import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { adminAuthEndpointConfig, adminUnauthorizedEvent, requestApi } from "@/lib/api";
import type { AdminAuthChallenge, AdminAuthResponse, AdminUser } from "@/types/admin";

export const adminAuthStorageKey = "origin_wallet_admin_token";
export const adminSessionVersion = 1;

interface StoredSession {
  version: number;
  created_at: string;
  token: string;
  user: AdminUser;
}

interface AuthContextType {
  user: AdminUser | null;
  loading: boolean;
  authError: string | null;
  token: string | null;
  clearAuthError: () => void;
  login: (email: string, password: string) => Promise<AdminAuthChallenge>;
  verifyLogin: (email: string, verificationCode: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isAdminUser = (value: unknown): value is AdminUser => {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<AdminUser>;
  return Number.isInteger(user.id)
    && Number(user.id) > 0
    && typeof user.email === "string"
    && user.email.trim().length > 0
    && typeof user.full_name === "string"
    && typeof user.status === "string"
    && typeof user.kyc_status === "string"
    && Array.isArray(user.roles);
};

export const parseAdminSession = (value: string | null): StoredSession | null => {
  if (!value) return null;

  try {
    const session = JSON.parse(value) as Partial<StoredSession>;
    const createdAt = typeof session.created_at === "string" ? Date.parse(session.created_at) : Number.NaN;
    if (
      session.version !== adminSessionVersion
      || !Number.isFinite(createdAt)
      || createdAt > Date.now()
      || typeof session.token !== "string"
      || session.token.trim().length === 0
      || !isAdminUser(session.user)
    ) {
      return null;
    }

    return session as StoredSession;
  } catch {
    return null;
  }
};

const saveSession = (session: StoredSession) => {
  localStorage.removeItem(adminAuthStorageKey);
  sessionStorage.setItem(adminAuthStorageKey, JSON.stringify(session));
};

const clearStoredSession = () => {
  localStorage.removeItem(adminAuthStorageKey);
  sessionStorage.removeItem(adminAuthStorageKey);
};

const toStoredSession = (payload: AdminAuthResponse, fallbackToken?: string | null): StoredSession => {
  const token = payload.token ?? fallbackToken;

  if (!isAdminUser(payload.user) || typeof token !== "string" || !token.trim()) {
    throw new Error("Admin auth response is missing session data");
  }

  return {
    version: adminSessionVersion,
    created_at: new Date().toISOString(),
    token,
    user: payload.user,
  };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const applySession = useCallback((session: StoredSession) => {
    saveSession(session);
    setToken(session.token);
    setUser(session.user);
    setAuthError(null);
  }, []);

  const clearSession = useCallback(() => {
    clearStoredSession();
    setToken(null);
    setUser(null);
    setAuthError(null);
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const refreshSession = useCallback(async () => {
    localStorage.removeItem(adminAuthStorageKey);
    const parsed = parseAdminSession(sessionStorage.getItem(adminAuthStorageKey));
    if (!parsed) {
      clearSession();
      return;
    }

    try {
      const payload = await requestApi<AdminAuthResponse>(adminAuthEndpointConfig.me, {
        method: "GET",
        token: parsed.token,
      });
      applySession(toStoredSession(payload, parsed.token));
    } catch (error) {
      clearSession();
      throw error;
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    const handleUnauthorized = () => clearSession();
    window.addEventListener(adminUnauthorizedEvent, handleUnauthorized);
    return () => window.removeEventListener(adminUnauthorizedEvent, handleUnauthorized);
  }, [clearSession]);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        localStorage.removeItem(adminAuthStorageKey);
        const parsed = parseAdminSession(sessionStorage.getItem(adminAuthStorageKey));
        if (!parsed) {
          clearStoredSession();
          return;
        }

        const payload = await requestApi<AdminAuthResponse>(adminAuthEndpointConfig.me, {
          method: "GET",
          token: parsed.token,
        });

        applySession(toStoredSession(payload, parsed.token));
      } catch (error) {
        console.warn("Unable to restore admin session", error);
        clearSession();
      } finally {
        setLoading(false);
      }
    };

    void restoreSession();
  }, [applySession, clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const payload = await requestApi<AdminAuthChallenge>(adminAuthEndpointConfig.login, {
        method: "POST",
        body: { email, password },
      });
      setAuthError(null);
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start admin login";
      clearSession();
      setAuthError(message);
      throw error;
    }
  }, [clearSession]);

  const verifyLogin = useCallback(async (email: string, verificationCode: string) => {
    try {
      const payload = await requestApi<AdminAuthResponse>(adminAuthEndpointConfig.loginVerify, {
        method: "POST",
        body: {
          email,
          verification_code: verificationCode,
        },
      });

      applySession(toStoredSession(payload));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to verify admin login";
      clearSession();
      setAuthError(message);
      throw error;
    }
  }, [applySession, clearSession]);

  const logout = useCallback(async () => {
    const currentToken = token;
    clearSession();

    if (!currentToken) {
      return;
    }

    try {
      await requestApi<{ message: string }>(adminAuthEndpointConfig.logout, {
        method: "POST",
        body: {},
        token: currentToken,
      });
    } catch (error) {
      console.warn("Admin logout request failed", error);
    }
  }, [clearSession, token]);

  const value = useMemo(
    () => ({
      user,
      loading,
      authError,
      token,
      clearAuthError,
      login,
      verifyLogin,
      logout,
      refreshSession,
    }),
    [authError, clearAuthError, loading, login, logout, refreshSession, token, user, verifyLogin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};
