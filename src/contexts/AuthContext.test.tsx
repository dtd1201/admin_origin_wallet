import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, adminAuthStorageKey, adminSessionVersion, parseAdminSession, useAuth } from "@/contexts/AuthContext";
import { requestApi } from "@/lib/api";
import type { AuthAction } from "@/lib/admin-auth";
import type { AdminUser } from "@/types/admin";

const adminUser: AdminUser = {
  id: 7, email: "admin@example.com", phone: null, full_name: "Admin User",
  status: "active", kyc_status: "approved", profile: null, roles: ["admin"],
};
const capability = "a".repeat(64);
const nextCapability = "b".repeat(64);
const replacementCapability = "c".repeat(64);
const recoveryCodes = Array.from({ length: 10 }, (_, index) => "synthetic-recovery-" + index);
const challenge = (next_action: AuthAction = "totp_required", token = capability, seconds = 300) => ({
  next_action, challenge_token: token, expires_in_seconds: seconds, methods: next_action === "totp_required" ? ["totp", "recovery_code"] : [],
});
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const storedSession = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  version: adminSessionVersion, created_at: new Date(Date.now() - 1000).toISOString(), token: "admin-token", user: adminUser, ...overrides,
});
const requests = () => vi.mocked(fetch).mock.calls.map(([url, init]) => ({
  url: String(url), init, body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined,
}));
const mountAuth = async () => {
  const hook = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};
type AuthHook = Awaited<ReturnType<typeof mountAuth>>;
const beginLogin = async (hook: AuthHook) => {
  vi.mocked(fetch).mockResolvedValueOnce(response(challenge()));
  await act(async () => hook.result.current.login(adminUser.email, "synthetic-password"));
};
const beginEnrollment = async (hook: AuthHook, pending = false) => {
  vi.mocked(fetch).mockResolvedValueOnce(response(challenge("enrollment_identity_required")))
    .mockResolvedValueOnce(response({ next_action: "enrollment_identity_required", methods: pending ? [] : ["enrollment_email_proof"], support_required: pending }));
  await act(async () => hook.result.current.login(adminUser.email, "synthetic-password"));
};
const expectNoSession = (hook: AuthHook) => {
  expect(hook.result.current.user).toBeNull();
  expect(hook.result.current.token).toBeNull();
  expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
  expect(localStorage.getItem(adminAuthStorageKey)).toBeNull();
};

describe("Admin mandatory MFA state and session isolation", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => response({ user: adminUser }));
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it("sends a 32-byte binding with password login and never authenticates a restricted challenge", async () => {
    const hook = await mountAuth();
    await beginLogin(hook);
    expectNoSession(hook);
    const request = requests()[0];
    expect(request.body).toEqual({ email: adminUser.email, password: "synthetic-password", client_binding: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(hook.result.current.ceremony?.challenge.next_action).toBe("totp_required");
    expect(requests().some(item => item.url.includes("resend"))).toBe(false);
    expect(JSON.stringify(sessionStorage)).not.toContain(capability);
  });

  it("preserves a leading-zero TOTP and persists only after completed MFA and GET Admin /me", async () => {
    const hook = await mountAuth();
    await beginLogin(hook);
    let resolveMe!: (value: Response) => void;
    vi.mocked(fetch).mockResolvedValueOnce(response({ token: "verified-token", user: adminUser }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveMe = resolve; }));
    let verification!: Promise<void>;
    act(() => { verification = hook.result.current.submitProof("000123"); });
    await waitFor(() => expect(resolveMe).toBeTypeOf("function"));
    expectNoSession(hook);
    const verify = requests().find(item => item.url.endsWith("/login/verify"))!;
    expect(verify.body).toEqual({ challenge_token: capability, totp_code: "000123" });
    expect(verify.init?.headers).toMatchObject({ "X-Auth-Client-Binding": hook.result.current.ceremony?.binding });
    expect(requests().find(item => item.url.endsWith("/me"))?.init).toMatchObject({ method: "GET", headers: { Authorization: "Bearer verified-token" } });
    await act(async () => { resolveMe(response({ user: adminUser })); await verification; });
    expect(hook.result.current.user?.email).toBe(adminUser.email);
    expect(sessionStorage.getItem(adminAuthStorageKey)).toContain("verified-token");
    expect(localStorage.getItem(adminAuthStorageKey)).toBeNull();
    expect(hook.result.current.ceremony).toBeNull();
  });

  it.each([401, 403])("refuses a completed token when Admin /me rejects it with %s", async status => {
    const hook = await mountAuth();
    await beginLogin(hook);
    vi.mocked(fetch).mockResolvedValueOnce(response({ token: "ineligible-token", user: adminUser }))
      .mockResolvedValueOnce(response({ message: "Denied" }, status));
    await act(async () => hook.result.current.submitProof("123456"));
    expectNoSession(hook);
    expect(requests().some(item => item.url.endsWith("/logout") && (item.init?.headers as Record<string, string>)?.Authorization === "Bearer ineligible-token")).toBe(true);
  });

  it("does not accept a password endpoint response containing a full token as a challenge", async () => {
    const hook = await mountAuth();
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...challenge(), token: "unexpected-token", user: adminUser }));
    await act(async () => hook.result.current.login(adminUser.email, "synthetic-password"));
    expectNoSession(hook);
    expect(hook.result.current.authError).toContain("invalid");
  });

  it("fails closed before setup when an established ownership channel is unavailable", async () => {
    const hook = await mountAuth();
    await beginEnrollment(hook, true);
    expectNoSession(hook);
    expect(hook.result.current.ceremony?.supportRequired).toBe(true);
    expect(hook.result.current.ceremony?.manualKey).toBeUndefined();
    expect(requests().some(item => item.url.endsWith("/enrollment/setup"))).toBe(false);
    expect(requests().some(item => item.body && "identity_proof" in item.body)).toBe(false);
  });

  it("enrolls using email ownership proof, backend QR/key and TOTP, holding codes/token until save acknowledgment", async () => {
    const hook = await mountAuth();
    await beginEnrollment(hook);
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("enrollment_ready", nextCapability)));
    await act(async () => hook.result.current.submitProof("000123"));
    expect(requests().find(item => item.url.endsWith("/identity/verify"))?.body).toEqual({ challenge_token: capability, identity_proof: "000123" });
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...challenge("enrollment_ready", nextCapability), qr_svg: "<svg/>", manual_key: "SYNTHETICKEY" }));
    await act(async () => hook.result.current.submitProof(""));
    expect(hook.result.current.ceremony?.manualKey).toBe("SYNTHETICKEY");
    expectNoSession(hook);
    vi.mocked(fetch).mockResolvedValueOnce(response({ token: "enrolled-token", user: adminUser, recovery_codes: recoveryCodes }))
      .mockResolvedValueOnce(response({ user: adminUser }));
    await act(async () => hook.result.current.submitProof("000123"));
    expectNoSession(hook);
    expect(hook.result.current.ceremony).toBeNull();
    expect(hook.result.current.recoveryCodes).toEqual(recoveryCodes);
    act(() => hook.result.current.acknowledgeCodes());
    expect(hook.result.current.user?.email).toBe(adminUser.email);
    expect(hook.result.current.recoveryCodes).toEqual([]);
    expect(sessionStorage.getItem(adminAuthStorageKey)).not.toContain("SYNTHETICKEY");
    expect(sessionStorage.getItem(adminAuthStorageKey)).not.toContain("synthetic-recovery");
  });

  it.each(["synthetic-backup", "another-synthetic-backup"])("authorizes restricted replacement with a recovery code (%s)", async code => {
    const hook = await mountAuth();
    await beginLogin(hook);
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("recovery_required", nextCapability)));
    await act(async () => hook.result.current.startRecovery());
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("replacement_required", replacementCapability)));
    await act(async () => hook.result.current.submitProof(code));
    expect(requests().find(item => item.url.endsWith("/recovery/verify"))?.body).toEqual({
      challenge_token: nextCapability, recovery_code: code,
    });
    expectNoSession(hook);
    expect(hook.result.current.ceremony?.challenge.challenge_token).toBe(replacementCapability);
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...challenge("replacement_required", replacementCapability), qr_svg: "<svg/>", manual_key: "NEWKEY" }));
    await act(async () => hook.result.current.submitProof(""));
    vi.mocked(fetch).mockResolvedValueOnce(response({ token: "replaced-token", user: adminUser, recovery_codes: recoveryCodes }))
      .mockResolvedValueOnce(response({ user: adminUser }));
    await act(async () => hook.result.current.submitProof("000123"));
    expectNoSession(hook);
    expect(hook.result.current.recoveryCodes).toEqual(recoveryCodes);
    act(() => hook.result.current.acknowledgeCodes());
    expect(hook.result.current.token).toBe("replaced-token");
  });

  it.each(["replace_authenticator", "regenerate_recovery_codes"] as const)("binds password/TOTP step-up to the initiating token and intent %s", async intent => {
    sessionStorage.setItem(adminAuthStorageKey, storedSession());
    const hook = await mountAuth();
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("step_up_required")));
    await act(async () => hook.result.current.startStepUp("synthetic-password", intent));
    const start = requests().find(item => item.url.endsWith("/security/step-up"))!;
    expect(start.body).toMatchObject({ password: "synthetic-password", intent, client_binding: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(start.init?.headers).toMatchObject({ Authorization: "Bearer admin-token" });
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge(intent === "replace_authenticator" ? "replacement_required" : "step_up_complete", nextCapability)));
    await act(async () => hook.result.current.submitProof("000123"));
    const verify = requests().find(item => item.url.endsWith("/step-up/verify"))!;
    expect(verify.init?.headers).toMatchObject({ Authorization: "Bearer admin-token", "X-Auth-Client-Binding": start.body?.client_binding });
    if (intent === "regenerate_recovery_codes") {
      vi.mocked(fetch).mockResolvedValueOnce(response({ recovery_codes: recoveryCodes }));
      await act(async () => hook.result.current.submitProof(""));
      expect(hook.result.current.recoveryCodes).toEqual(recoveryCodes);
      expect(hook.result.current.token).toBe("admin-token");
      expect(requests().find(item => item.url.endsWith("/recovery-codes/regenerate"))?.body).toEqual({ challenge_token: nextCapability });
      act(() => hook.result.current.acknowledgeCodes());
      expect(hook.result.current.recoveryCodes).toEqual([]);
    } else {
      expect(hook.result.current.ceremony?.challenge.next_action).toBe("replacement_required");
    }
  });

  it("automatically requests only enrollment email proof and enforces the resend cooldown", async () => {
    const hook = await mountAuth();
    vi.useFakeTimers();
    await beginEnrollment(hook);
    const login = requests().find(item => item.url.endsWith("/login"))!;
    const identity = requests().find(item => item.url.endsWith("/identity/request"))!;
    expect(identity.init?.headers).toMatchObject({ "X-Auth-Client-Binding": login.body?.client_binding });
    expect(hook.result.current.ceremony?.challenge.methods).toEqual(["enrollment_email_proof"]);
    expect(requests().some(item => item.body && "grant_token" in item.body)).toBe(false);
    await act(async () => hook.result.current.resendIdentity());
    expect(requests().filter(item => item.url.endsWith("/identity/request"))).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(121000); });
    vi.mocked(fetch).mockResolvedValueOnce(response({ next_action: "enrollment_identity_required",
      methods: ["enrollment_email_proof"], resend_after_seconds: 120 }));
    await act(async () => hook.result.current.resendIdentity());
    expect(requests().filter(item => item.url.endsWith("/identity/request"))).toHaveLength(2);
    expectNoSession(hook);
    expect(hook.result.current.ceremony?.manualKey).toBeUndefined();
  });

  it.each([422, 429])("fails closed after invalid/expired or rate-limited enrollment email proof (%s)", async status => {
    const hook = await mountAuth();
    await beginEnrollment(hook);
    vi.mocked(fetch).mockResolvedValueOnce(response({ message: "private-code-and-trace" }, status, { "Retry-After": "30" }));
    await act(async () => hook.result.current.submitProof("000123"));
    expectNoSession(hook);
    expect(hook.result.current.ceremony).toBeNull();
    expect(hook.result.current.authError).not.toContain("private-code");
    if (status === 429) expect(hook.result.current.retryAt).toBeGreaterThan(Date.now());
  });

  it("records assisted intake without authenticating or claiming approval/ticket creation", async () => {
    const hook = await mountAuth();
    vi.mocked(fetch).mockResolvedValueOnce(response({ message: "Recovery request recorded." }, 202));
    await act(async () => hook.result.current.assistedRecovery("unknown@example.com"));
    expectNoSession(hook);
    expect(hook.result.current.notice).toContain("established Origin Wallet support channel");
    expect(hook.result.current.notice).toContain("does not approve recovery or create a support ticket");
  });

  it("revokes an enrollment completion when its recovery codes are discarded", async () => {
    const hook = await mountAuth();
    await beginEnrollment(hook);
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("enrollment_ready", nextCapability)));
    await act(async () => hook.result.current.submitProof("000123"));
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...challenge("enrollment_ready", nextCapability), qr_svg: "<svg/>", manual_key: "SYNTHETICKEY" }));
    await act(async () => hook.result.current.submitProof(""));
    vi.mocked(fetch).mockResolvedValueOnce(response({ token: "discarded-token", user: adminUser, recovery_codes: recoveryCodes }))
      .mockResolvedValueOnce(response({ user: adminUser }));
    await act(async () => hook.result.current.submitProof("123456"));
    expect(hook.result.current.recoveryCodes).toHaveLength(10);
    act(() => hook.result.current.cancelCeremony());
    act(() => hook.result.current.acknowledgeCodes());
    expectNoSession(hook);
    expect(hook.result.current.recoveryCodes).toEqual([]);
    expect(requests().some(item => item.url.endsWith("/logout") && (item.init?.headers as Record<string, string>)?.Authorization === "Bearer discarded-token")).toBe(true);
  });

  it("fails closed if activation succeeds but its one-time code response is incomplete", async () => {
    const hook = await mountAuth();
    await beginEnrollment(hook);
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("enrollment_ready", nextCapability)));
    await act(async () => hook.result.current.submitProof("000123"));
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...challenge("enrollment_ready", nextCapability), qr_svg: "<svg/>", manual_key: "SYNTHETICKEY" }));
    await act(async () => hook.result.current.submitProof(""));
    vi.mocked(fetch).mockResolvedValueOnce(response({ token: "incomplete-token", user: adminUser, recovery_codes: ["only-one"] }))
      .mockResolvedValueOnce(response({ user: adminUser }));
    await act(async () => hook.result.current.submitProof("123456"));
    expectNoSession(hook);
    expect(hook.result.current.authError).toContain("Recovery codes were not received");
    expect(hook.result.current.ceremony).toBeNull();
    expect(hook.result.current.recoveryCodes).toEqual([]);
  });

  it.each([422, 503, 500])("clears sensitive challenge state on %s without displaying raw errors", async status => {
    const hook = await mountAuth();
    await beginLogin(hook);
    vi.mocked(fetch).mockResolvedValueOnce(response({ message: "synthetic-secret-and-trace", trace: ["private"] }, status));
    await act(async () => hook.result.current.submitProof("123456"));
    expectNoSession(hook);
    expect(hook.result.current.ceremony).toBeNull();
    expect(hook.result.current.authError).not.toContain("synthetic-secret");
    if (status === 503) expect(hook.result.current.authError).toBe("Authentication service is unavailable.");
  });

  it("obeys Retry-After and blocks direct duplicate submissions during the cooldown", async () => {
    const hook = await mountAuth();
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(response({}, 429, { "Retry-After": "30" }));
    await act(async () => hook.result.current.login(adminUser.email, "synthetic-password"));
    expect(hook.result.current.retryAt).toBe(Date.now() + 30000);
    const count = requests().length;
    await act(async () => hook.result.current.login(adminUser.email, "synthetic-password"));
    expect(requests()).toHaveLength(count);
    act(() => vi.advanceTimersByTime(30000));
    await beginLogin(hook);
    expect(hook.result.current.ceremony).not.toBeNull();
  });

  it("expires challenges locally, erasing restricted capabilities and setup state", async () => {
    const hook = await mountAuth();
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("totp_required", capability, 1)));
    await act(async () => hook.result.current.login(adminUser.email, "synthetic-password"));
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(hook.result.current.ceremony).toBeNull();
    expect(hook.result.current.authError).toContain("expired");
    expectNoSession(hook);
  });

  it("prevents duplicate requests and revokes a late challenge after cancellation", async () => {
    const hook = await mountAuth();
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    let pending!: Promise<void>;
    act(() => { pending = hook.result.current.login(adminUser.email, "synthetic-password"); });
    await act(async () => hook.result.current.login(adminUser.email, "synthetic-password"));
    expect(requests().filter(item => item.url.endsWith("/login"))).toHaveLength(1);
    act(() => hook.result.current.cancelCeremony());
    await act(async () => { resolve(response(challenge())); await pending; });
    expectNoSession(hook);
    expect(hook.result.current.ceremony).toBeNull();
    expect(requests().some(item => item.url.endsWith("/challenges/cancel") && item.body?.challenge_token === capability)).toBe(true);
  });

  it("does not resurrect a logged-out session from an in-flight MFA completion", async () => {
    const hook = await mountAuth();
    await beginLogin(hook);
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    let pending!: Promise<void>;
    act(() => { pending = hook.result.current.submitProof("123456"); });
    await act(async () => hook.result.current.logout());
    await act(async () => { resolve(response({ token: "late-token", user: adminUser })); await pending; });
    expectNoSession(hook);
    expect(requests().some(item => item.url.endsWith("/logout") && (item.init?.headers as Record<string, string>)?.Authorization === "Bearer late-token")).toBe(true);
  });

  it("restores a valid session only after Admin /me validation, preserving configured backoffice roles", async () => {
    const roles = ["compliance_officer", "operations"];
    sessionStorage.setItem(adminAuthStorageKey, storedSession());
    vi.mocked(fetch).mockResolvedValueOnce(response({ user: { ...adminUser, roles } }));
    const hook = await mountAuth();
    expect(hook.result.current.user?.roles).toEqual(roles);
    expect(requests()[0].url).toContain("/admin/auth/me");
    expect(requests()[0].init?.headers).toMatchObject({ Authorization: "Bearer admin-token" });
  });

  it.each([{ version: 1 }, { version: 999 }, { created_at: "invalid" }, { created_at: "2999-01-01" }, { token: "" }, { user: { email: adminUser.email } }])("rejects malformed/legacy stored sessions %j", async overrides => {
    sessionStorage.setItem(adminAuthStorageKey, storedSession(overrides));
    const hook = await mountAuth();
    expectNoSession(hook);
    expect(fetch).not.toHaveBeenCalled();
    expect(parseAdminSession(storedSession(overrides))).toBeNull();
  });

  it("removes legacy localStorage tokens instead of restoring them", async () => {
    localStorage.setItem(adminAuthStorageKey, storedSession());
    const hook = await mountAuth();
    expectNoSession(hook);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("clears saved sessions, challenges and one-time recovery codes on logout", async () => {
    sessionStorage.setItem(adminAuthStorageKey, storedSession());
    const hook = await mountAuth();
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("step_up_required")));
    await act(async () => hook.result.current.startStepUp("synthetic-password", "regenerate_recovery_codes"));
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("step_up_complete", nextCapability)));
    await act(async () => hook.result.current.submitProof("123456"));
    vi.mocked(fetch).mockResolvedValueOnce(response({ recovery_codes: recoveryCodes }));
    await act(async () => hook.result.current.submitProof(""));
    await act(async () => hook.result.current.logout());
    expectNoSession(hook);
    expect(hook.result.current.ceremony).toBeNull();
    expect(hook.result.current.recoveryCodes).toEqual([]);
  });

  it.each([401, 403])("preserves existing global session rejection after business HTTP %s", async status => {
    sessionStorage.setItem(adminAuthStorageKey, storedSession());
    const hook = await mountAuth();
    vi.mocked(fetch).mockResolvedValueOnce(response({ message: "Unauthorized" }, status));
    await act(async () => { await expect(requestApi("/admin/users", { token: "admin-token" })).rejects.toThrow("Unauthorized"); });
    expectNoSession(hook);
  });
});
