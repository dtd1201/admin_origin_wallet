import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { adminUnauthorizedEvent } from "@/lib/api";
import { AuthFailure, newClientBinding, readChallenge, readRecoveryCodes, requestAdminAuth,
  type AuthAction, type AuthChallenge, type AuthResult, type SecurityStatus } from "@/lib/admin-auth";
import type { AdminAuthResponse, AdminUser } from "@/types/admin";

export const adminAuthStorageKey = "origin_wallet_admin_token";
export const adminSessionVersion = 2;
interface StoredSession { version: number; created_at: string; token: string; user: AdminUser }
export type SecurityIntent = "replace_authenticator" | "regenerate_recovery_codes";
export interface Ceremony {
  binding: string;
  challenge: AuthChallenge;
  expiresAt: number;
  qrSvg?: string;
  manualKey?: string;
  supportRequired?: boolean;
  resendAt?: number;
  intent?: SecurityIntent;
}
interface AuthContextType {
  user: AdminUser | null;
  token: string | null;
  loading: boolean;
  authError: string | null;
  notice: string;
  busy: boolean;
  retryAt: number;
  ceremony: Ceremony | null;
  recoveryCodes: string[];
  clearAuthError: () => void;
  login: (email: string, password: string) => Promise<void>;
  submitProof: (proof: string) => Promise<void>;
  resendIdentity: () => Promise<void>;
  startRecovery: () => Promise<void>;
  assistedRecovery: (email: string) => Promise<void>;
  cancelCeremony: () => void;
  leaveSecurity: () => void;
  acknowledgeCodes: () => void;
  startStepUp: (password: string, intent: SecurityIntent) => Promise<void>;
  getSecurity: () => Promise<SecurityStatus>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const isAdminUser = (value: unknown): value is AdminUser => {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<AdminUser>;
  // /me determines Admin role eligibility, including configured backoffice roles.
  return Number.isInteger(user.id) && Number(user.id) > 0 && typeof user.email === "string"
    && !!user.email.trim() && typeof user.full_name === "string" && typeof user.status === "string"
    && typeof user.kyc_status === "string" && Array.isArray(user.roles);
};
export const parseAdminSession = (value: string | null): StoredSession | null => {
  try {
    const session = JSON.parse(value ?? "null") as StoredSession | null;
    const created = Date.parse(session?.created_at ?? "");
    return session?.version === adminSessionVersion && Number.isFinite(created) && created <= Date.now()
      && typeof session.token === "string" && !!session.token.trim() && isAdminUser(session.user) ? session : null;
  } catch { return null; }
};
const clearStoredSession = () => {
  localStorage.removeItem(adminAuthStorageKey);
  sessionStorage.removeItem(adminAuthStorageKey);
};
const makeSession = (payload: AdminAuthResponse, token: string): StoredSession => {
  if (!isAdminUser(payload.user) || !token.trim()) throw new AuthFailure(401, "Admin session validation failed. Sign in again.");
  return { version: adminSessionVersion, created_at: new Date().toISOString(), token, user: payload.user };
};
const discardResult = (result: AuthResult, binding: string) => {
  if (result.token) void requestAdminAuth("logout", { token: result.token, body: {} }).catch(() => undefined);
  if (result.challenge_token) void requestAdminAuth("challenges/cancel", {
    binding, body: { challenge_token: result.challenge_token },
  }).catch(() => undefined);
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<StoredSession | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const retryRef = useRef(0);
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const ceremonyRef = useRef<Ceremony | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const pendingSession = useRef<StoredSession | null>(null);
  const generation = useRef(0);
  const flight = useRef<object | null>(null);

  const changeCeremony = useCallback((value: Ceremony | null) => {
    ceremonyRef.current = value;
    setCeremony(value);
  }, []);
  const applySession = useCallback((value: StoredSession | null) => {
    clearStoredSession();
    if (value) sessionStorage.setItem(adminAuthStorageKey, JSON.stringify(value));
    sessionRef.current = value;
    setSession(value);
  }, []);
  const cancelCeremony = useCallback(() => {
    generation.current++;
    const old = ceremonyRef.current;
    const pending = pendingSession.current;
    changeCeremony(null);
    pendingSession.current = null;
    setRecoveryCodes([]);
    flight.current = null;
    setBusy(false);
    setAuthError(null);
    setNotice("");
    if (old) discardResult(old.challenge, old.binding);
    if (pending) discardResult({ token: pending.token }, "");
  }, [changeCeremony]);
  const clearAll = useCallback(() => {
    cancelCeremony();
    applySession(null);
  }, [applySession, cancelCeremony]);
  const leaveSecurity = useCallback(() => {
    // Read synchronous refs: a route guard can remove Security before the child
    // renders the new context. Preserve only a completion transferring to Login.
    if (!sessionRef.current && pendingSession.current) return;
    cancelCeremony();
  }, [cancelCeremony]);
  const clearAuthError = useCallback(() => setAuthError(null), []);

  // Single flight and a generation check at every network boundary prevent stale
  // completions from authenticating after cancel, logout, expiry or unmount.
  const run = useCallback(async (task: (call: (path: string, body?: Record<string, unknown>,
    binding?: string, token?: string) => Promise<AuthResult>) => Promise<void>) => {
    if (flight.current || loading || Date.now() < retryRef.current) return;
    const owner = {};
    flight.current = owner;
    const epoch = generation.current;
    setBusy(true);
    setAuthError(null);
    setNotice("");
    const call = async (path: string, body?: Record<string, unknown>, binding = "", token?: string) => {
      if (generation.current !== epoch) throw new Error("cancelled");
      const result = await requestAdminAuth(path, { body, binding, token, method: path === "me" ? "GET" : "POST" });
      if (generation.current !== epoch) {
        discardResult(result, binding);
        throw new Error("cancelled");
      }
      return result;
    };
    try { await task(call); }
    catch (error) {
      if (generation.current !== epoch) return;
      // Backend 422 intentionally does not distinguish bad proof from a
      // consumed/revoked challenge. Require a fresh ceremony in either case.
      const failure = error instanceof AuthFailure ? error : new AuthFailure(0, "Authentication could not be completed. Restart sign-in.");
      cancelCeremony();
      if ([401, 403].includes(failure.status)) applySession(null);
      setAuthError(failure.message);
      if (failure.retryAt) { retryRef.current = failure.retryAt; setRetryAt(failure.retryAt); }
    } finally {
      if (flight.current === owner) { flight.current = null; setBusy(false); }
    }
  }, [applySession, cancelCeremony, loading]);

  const acceptChallenge = useCallback((result: AuthResult, binding: string, allowed: AuthAction[], intent?: SecurityIntent) => {
    try {
      const challenge = readChallenge(result);
      if (!allowed.includes(challenge.next_action)) throw new AuthFailure(422, "The authentication transition is invalid. Restart sign-in.");
      changeCeremony({ binding, challenge, expiresAt: Date.now() + challenge.expires_in_seconds * 1000, intent });
    } catch (error) { discardResult(result, binding); throw error; }
  }, [changeCeremony]);

  const login = useCallback(async (email: string, password: string) => {
    await run(async call => {
      const binding = newClientBinding();
      const result = await call("login", { email, password, client_binding: binding }, binding);
      acceptChallenge(result, binding, ["totp_required", "enrollment_identity_required"]);
      if (result.next_action === "enrollment_identity_required") {
        const methods = await call("enrollment/identity/request", { challenge_token: result.challenge_token }, binding);
        if (methods.challenge_token) acceptChallenge(methods, binding, ["enrollment_ready"]);
        else {
          if (methods.token || methods.next_action !== "enrollment_identity_required" || !Array.isArray(methods.methods)
            || !methods.methods.every(method => typeof method === "string")) {
            discardResult(methods, binding);
            throw new AuthFailure(422, "The enrollment authorization response is invalid. Restart sign-in.");
          }
          changeCeremony({ ...ceremonyRef.current!, supportRequired: methods.support_required,
            resendAt: Date.now() + (methods.resend_after_seconds ?? 120) * 1000,
            expiresAt: Math.min(ceremonyRef.current!.expiresAt, Date.now() + (methods.proof_expires_in_seconds ?? Number.POSITIVE_INFINITY) * 1000),
            challenge: { ...ceremonyRef.current!.challenge, methods: methods.methods } });
        }
      }
    });
  }, [acceptChallenge, changeCeremony, run]);

  const startRecovery = useCallback(async () => {
    await run(async call => {
      const current = ceremonyRef.current;
      if (!current || current.challenge.next_action !== "totp_required") return;
      acceptChallenge(await call("recovery/start", { challenge_token: current.challenge.challenge_token }, current.binding), current.binding, ["recovery_required"]);
    });
  }, [acceptChallenge, run]);

  const resendIdentity = useCallback(async () => {
    await run(async call => {
      const current = ceremonyRef.current;
      if (!current || current.challenge.next_action !== "enrollment_identity_required"
        || current.supportRequired || !current.challenge.methods.includes("enrollment_email_proof")
        || Date.now() < (current.resendAt ?? 0)) return;
      const result = await call("enrollment/identity/request", { challenge_token: current.challenge.challenge_token }, current.binding);
      if (result.token || result.challenge_token || result.next_action !== "enrollment_identity_required"
        || !result.methods?.includes("enrollment_email_proof")) {
        discardResult(result, current.binding);
        throw new AuthFailure(422, "Email ownership verification is unavailable. Restart sign-in or contact support.");
      }
      changeCeremony({ ...current, resendAt: Date.now() + (result.resend_after_seconds ?? 120) * 1000 });
    });
  }, [changeCeremony, run]);

  const submitProof = useCallback(async (proof: string) => {
    await run(async call => {
      const current = ceremonyRef.current;
      if (!current || current.expiresAt <= Date.now()) throw new AuthFailure(422, "Authentication challenge expired. Restart sign-in.");
      const { challenge, binding, intent } = current;
      const bound = { challenge_token: challenge.challenge_token };
      const action = challenge.next_action;
      if (["totp_required", "step_up_required"].includes(action) || current.manualKey) {
        if (!/^\d{6}$/.test(proof)) throw new AuthFailure(422, "Enter a six-digit authenticator code.");
      }
      if (action === "enrollment_identity_required" || action === "recovery_required") {
        const path = action === "recovery_required" ? "recovery/verify" : "enrollment/identity/verify";
        acceptChallenge(await call(path, { ...bound, [action === "enrollment_identity_required" ? "identity_proof" : "recovery_code"]: proof }, binding), binding,
          [action === "recovery_required" ? "replacement_required" : "enrollment_ready"]);
        return;
      }
      if (action === "step_up_required") {
        acceptChallenge(await call("security/step-up/verify", { ...bound, totp_code: proof }, binding, sessionRef.current?.token), binding,
          [intent === "replace_authenticator" ? "replacement_required" : "step_up_complete"], intent);
        return;
      }
      if (action === "step_up_complete") {
        const result = await call("recovery-codes/regenerate", bound, binding, sessionRef.current?.token);
        const codes = readRecoveryCodes(result);
        changeCeremony(null);
        setRecoveryCodes(codes);
        return;
      }
      if ((action === "enrollment_ready" || action === "replacement_required") && !current.manualKey) {
        const result = await call(action === "enrollment_ready" ? "enrollment/setup" : "totp/replacement/setup", bound, binding);
        const next = readChallenge(result);
        if (next.next_action !== action || next.challenge_token !== challenge.challenge_token || !result.manual_key || !result.qr_svg) {
          discardResult(result, binding);
          throw new AuthFailure(0, "Authenticator setup is unavailable. Restart sign-in.");
        }
        changeCeremony({ ...current, challenge: next, expiresAt: Math.min(current.expiresAt, Date.now() + next.expires_in_seconds * 1000),
          manualKey: result.manual_key, qrSvg: result.qr_svg });
        return;
      }
      const path = action === "totp_required" ? "login/verify" : action === "enrollment_ready" ? "enrollment/confirm" : "totp/replacement/confirm";
      const result = await call(path, { ...bound, totp_code: proof }, binding);
      if (!result.token || result.next_action) throw new AuthFailure(401, "A full Admin session was not returned. Restart sign-in.");
      // Track immediately so cancellation or failed /me validation can revoke it.
      pendingSession.current = { version: adminSessionVersion, created_at: new Date().toISOString(), token: result.token, user: result.user! };
      if (action === "replacement_required") applySession(null);
      const me = await call("me", undefined, "", result.token);
      const validated = makeSession(me as AdminAuthResponse, result.token);
      changeCeremony(null);
      if (action !== "totp_required") {
        const codes = readRecoveryCodes(result);
        pendingSession.current = validated;
        setRecoveryCodes(codes);
      } else {
        pendingSession.current = null;
        applySession(validated);
      }
    });
  }, [acceptChallenge, applySession, changeCeremony, run]);

  const acknowledgeCodes = useCallback(() => {
    if (!recoveryCodes.length) return;
    const pending = pendingSession.current;
    pendingSession.current = null;
    setRecoveryCodes([]);
    if (pending) applySession(pending);
  }, [applySession, recoveryCodes]);
  const assistedRecovery = useCallback(async (email: string) => {
    await run(async call => {
      await call("recovery/request", { email });
      setNotice("Contact your established Origin Wallet support channel. Automatic recovery is unavailable. This does not approve recovery or create a support ticket.");
    });
  }, [run]);
  const startStepUp = useCallback(async (password: string, intent: SecurityIntent) => {
    await run(async call => {
      const binding = newClientBinding();
      acceptChallenge(await call("security/step-up", { password, intent, client_binding: binding }, binding, sessionRef.current?.token), binding, ["step_up_required"], intent);
    });
  }, [acceptChallenge, run]);
  const getSecurity = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) throw new AuthFailure(401, "Sign in again to view security status.");
    try {
      return await requestAdminAuth<SecurityStatus>("security", { method: "GET", token: current.token });
    } catch (error) {
      if (error instanceof AuthFailure && [401, 403].includes(error.status) && sessionRef.current?.token === current.token) clearAll();
      throw error;
    }
  }, [clearAll]);
  const refreshSession = useCallback(async () => {
    const current = sessionRef.current;
    const epoch = generation.current;
    if (!current) return;
    try {
      const payload = await requestAdminAuth<AdminAuthResponse>("me", { method: "GET", token: current.token });
      if (generation.current === epoch && sessionRef.current?.token === current.token) applySession(makeSession(payload, current.token));
    } catch {
      if (generation.current === epoch && sessionRef.current?.token === current.token) { clearAll(); setAuthError("Your Admin session could not be validated. Sign in again."); }
    }
  }, [applySession, clearAll]);
  const logout = useCallback(async () => {
    const previous = sessionRef.current?.token;
    clearAll();
    if (previous) await requestAdminAuth("logout", { token: previous, body: {} }).catch(() => undefined);
  }, [clearAll]);

  useEffect(() => {
    const handleUnauthorized = () => clearAll();
    window.addEventListener(adminUnauthorizedEvent, handleUnauthorized);
    return () => window.removeEventListener(adminUnauthorizedEvent, handleUnauthorized);
  }, [clearAll]);
  useEffect(() => {
    let active = true;
    const epoch = generation.current;
    localStorage.removeItem(adminAuthStorageKey);
    const stored = parseAdminSession(sessionStorage.getItem(adminAuthStorageKey));
    clearStoredSession();
    void (async () => {
      try {
        if (stored) {
          const payload = await requestAdminAuth<AdminAuthResponse>("me", { method: "GET", token: stored.token });
          if (active && generation.current === epoch) applySession(makeSession(payload, stored.token));
        }
      } catch { if (active && generation.current === epoch) clearAll(); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; cancelCeremony(); };
  }, [applySession, cancelCeremony, clearAll]);
  useEffect(() => {
    if (!ceremony) return;
    const timer = window.setTimeout(() => {
      cancelCeremony();
      setAuthError("Authentication challenge expired. Restart sign-in.");
    }, Math.max(0, ceremony.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [cancelCeremony, ceremony]);

  const value = useMemo(() => ({ user: session?.user ?? null, token: session?.token ?? null, loading,
    authError, notice, busy, retryAt, ceremony, recoveryCodes, clearAuthError, login, submitProof,
    startRecovery, resendIdentity, assistedRecovery, cancelCeremony, leaveSecurity, acknowledgeCodes, startStepUp, getSecurity, logout, refreshSession }),
  [session, loading, authError, notice, busy, retryAt, ceremony, recoveryCodes, clearAuthError, login, submitProof,
    startRecovery, resendIdentity, assistedRecovery, cancelCeremony, leaveSecurity, acknowledgeCodes, startStepUp, getSecurity, logout, refreshSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
