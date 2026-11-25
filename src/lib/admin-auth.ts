import { adminAuthEndpointConfig, buildApiUrl } from "@/lib/api";
import type { AdminAuthResponse } from "@/types/admin";

export type AuthAction = "totp_required" | "recovery_required" | "enrollment_identity_required"
  | "enrollment_ready" | "replacement_required" | "step_up_required" | "step_up_complete";
export interface AuthChallenge {
  next_action: AuthAction;
  challenge_token: string;
  expires_in_seconds: number;
  methods: string[];
}
export interface AuthResult extends Partial<AuthChallenge>, Partial<AdminAuthResponse> {
  policy_pending?: boolean;
  qr_svg?: string;
  manual_key?: string;
  recovery_codes?: string[];
}
export interface SecurityStatus {
  mandatory: boolean;
  enrolled: boolean;
  confirmed_at: string;
  recovery_codes_remaining: number;
}
export class AuthFailure extends Error {
  constructor(public status: number, message: string, public retryAt = 0) {
    super(message);
    this.name = "AuthFailure";
  }
}
export const newClientBinding = () => Array.from(crypto.getRandomValues(new Uint8Array(32)),
  byte => byte.toString(16).padStart(2, "0")).join("");
const endpoints: Record<string, string> = {
  login: adminAuthEndpointConfig.login,
  "login/verify": adminAuthEndpointConfig.loginVerify,
  me: adminAuthEndpointConfig.me,
  logout: adminAuthEndpointConfig.logout,
};

// Separate auth transport preserves business request behavior. Never expose raw errors.
export async function requestAdminAuth<T = AuthResult>(path: string, options: {
  body?: Record<string, unknown>;
  binding?: string;
  token?: string | null;
  method?: "GET" | "POST";
} = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl(endpoints[path] ?? `/admin/auth/${path}`), {
      method: options.method ?? "POST", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.binding ? { "X-Auth-Client-Binding": options.binding } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new AuthFailure(0, "Unable to connect to the authentication service. Restart if the result is uncertain.");
  }
  if (!response.ok) {
    const retry = response.headers.get("Retry-After");
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : NaN;
    const retryAt = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retry ?? "");
    const messages: Record<number, string> = {
      401: "Your Admin session is no longer eligible. Sign in again.",
      403: "Admin access was denied. Sign in again.",
      422: "Authentication could not be completed. Check your input and restart sign-in; the challenge may have expired, been used or been revoked. Use a fresh authenticator code.",
      429: "Too many authentication attempts. Wait before trying again.",
      503: "Authentication service is unavailable.",
    };
    throw new AuthFailure(response.status, messages[response.status] ?? "Authentication could not be completed. Restart sign-in.",
      response.status === 429 ? (Number.isFinite(retryAt) ? Math.max(Date.now(), retryAt) : Date.now() + 60000) : 0);
  }
  try { return await response.json() as T; }
  catch { throw new AuthFailure(0, "Authentication returned an incomplete response. Restart sign-in."); }
}
export function readChallenge(result: AuthResult): AuthChallenge {
  const actions: AuthAction[] = ["totp_required", "recovery_required", "enrollment_identity_required",
    "enrollment_ready", "replacement_required", "step_up_required", "step_up_complete"];
  if (!result.next_action || !actions.includes(result.next_action)
    || !/^[0-9a-f]{64}$/.test(result.challenge_token ?? "")
    || !Number.isFinite(result.expires_in_seconds) || Number(result.expires_in_seconds) <= 0
    || !Array.isArray(result.methods) || !result.methods.every(method => typeof method === "string") || result.token) {
    throw new AuthFailure(422, "The authentication challenge is invalid. Restart sign-in.");
  }
  return result as AuthChallenge;
}

export function readRecoveryCodes(result: AuthResult): string[] {
  if (!Array.isArray(result.recovery_codes) || result.recovery_codes.length !== 10
    || !result.recovery_codes.every(code => typeof code === "string" && code.length > 0)) {
    throw new AuthFailure(0, "Recovery codes were not received. Sign in again and regenerate them from Session security.");
  }
  return result.recovery_codes;
}
