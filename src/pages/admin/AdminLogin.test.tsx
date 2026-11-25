import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, adminAuthStorageKey, adminSessionVersion, useAuth } from "@/contexts/AuthContext";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminSettings from "@/pages/admin/AdminSettings";

const user = { id: 7, email: "admin@example.com", phone: null, full_name: "Admin User",
  status: "active", kyc_status: "approved", profile: null, roles: ["admin"] };
const capability = "a".repeat(64);
const challenge = (next_action = "totp_required", token = capability) => ({
  next_action, challenge_token: token, expires_in_seconds: 300, methods: next_action === "totp_required" ? ["totp", "recovery_code"] : [],
});
const codes = Array.from({ length: 10 }, (_, index) => "synthetic-code-" + index);
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
function ProtectedContent() {
  const auth = useAuth();
  const location = useLocation();
  return <div data-testid="protected" data-path={location.pathname}>Protected Admin content: {JSON.stringify(auth.user?.roles)}</div>;
}
const renderLogin = (path = "/admin/login", state?: Record<string, unknown>) => render(
  <AuthProvider><MemoryRouter initialEntries={[{ pathname: path, state }]}>
    <Routes>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<ProtectedContent />} />
        <Route path="users" element={<ProtectedContent />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
    </Routes>
  </MemoryRouter></AuthProvider>,
);
const enterCredentials = async () => {
  await screen.findByRole("button", { name: "Sign in" });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
};
const beginTotp = async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response(challenge()));
  renderLogin();
  await enterCredentials();
  await screen.findByLabelText("Google Authenticator code");
};
const verify = async () => {
  fireEvent.change(screen.getByLabelText("Google Authenticator code"), { target: { value: "000123" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
};

describe("Admin mandatory Google Authenticator UI and route guards", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => response({ user }));
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:synthetic-qr") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it("uses six-digit TOTP after password without any normal login email OTP or resend fallback", async () => {
    await beginTotp();
    expect(screen.getByLabelText("Google Authenticator code")).toHaveAttribute("maxLength", "6");
    expect(screen.getByLabelText("Google Authenticator code")).toHaveAttribute("inputMode", "numeric");
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByText(/sent to your email/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resend|email code|send verification/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
    vi.mocked(fetch).mockResolvedValueOnce(response({ token: "verified-token", user }))
      .mockResolvedValueOnce(response({ user }));
    await verify();
    expect(await screen.findByTestId("protected")).toBeInTheDocument();
    expect(sessionStorage.getItem(adminAuthStorageKey)).toContain("verified-token");
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("resend"))).toBe(false);
  });

  it("resets to credentials with a cleared password/code after a rejected TOTP", async () => {
    await beginTotp();
    vi.mocked(fetch).mockResolvedValueOnce(response({ message: "Authentication could not be completed." }, 422));
    await verify();
    expect(await screen.findByRole("alert")).toHaveTextContent("challenge may have expired, been used or been revoked");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.queryByLabelText("Google Authenticator code")).not.toBeInTheDocument();
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
  });

  it("cancels an in-flight challenge without restoring restricted material", async () => {
    await beginTotp();
    fireEvent.change(screen.getByLabelText("Google Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel and restart" }));
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.queryByLabelText("Google Authenticator code")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/challenges/cancel"))).toBe(true);
  });

  it("shows the approval gate when Admin enrollment policy is inactive", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("enrollment_identity_required")))
      .mockResolvedValueOnce(response({ next_action: "enrollment_identity_required", methods: [], policy_pending: true }));
    renderLogin();
    await enterCredentials();
    expect(await screen.findByText(/Enrollment policy is unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Scan/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
  });

  it("renders backend QR/key and one-time codes, requiring an explicit save acknowledgment before access", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("enrollment_identity_required")))
      .mockResolvedValueOnce(response({ next_action: "enrollment_identity_required", methods: ["operator_grant"], policy_pending: false }));
    renderLogin();
    await enterCredentials();
    await screen.findByLabelText("Approved operator grant");
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("enrollment_ready", "b".repeat(64))));
    fireEvent.change(screen.getByLabelText("Approved operator grant"), { target: { value: "c".repeat(64) } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByRole("button", { name: "Show authenticator setup" });
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...challenge("enrollment_ready", "b".repeat(64)), qr_svg: "<svg/>", manual_key: "SYNTHETICSETUPKEY" }));
    fireEvent.click(screen.getByRole("button", { name: "Show authenticator setup" }));
    expect(await screen.findByText("SYNTHETICSETUPKEY")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Scan with Google Authenticator" })).toHaveAttribute("src", "blob:synthetic-qr");
    vi.mocked(fetch).mockResolvedValueOnce(response({ token: "enrolled-token", user, recovery_codes: codes }))
      .mockResolvedValueOnce(response({ user }));
    await verify();
    expect(await screen.findByRole("heading", { name: "Save your recovery codes" })).toBeInTheDocument();
    expect(screen.getAllByText(/^synthetic-code-/)).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-qr");
    fireEvent.click(screen.getByLabelText("I have saved my recovery codes"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByTestId("protected")).toBeInTheDocument();
    expect(screen.queryByText("synthetic-code-0")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(adminAuthStorageKey)).not.toContain("synthetic-code");
  });

  it("offers replacement through a backup code without granting access after backup verification", async () => {
    await beginTotp();
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("recovery_required", "b".repeat(64))));
    fireEvent.click(screen.getByRole("button", { name: "Use a recovery code" }));
    await screen.findByLabelText("Recovery code");
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("replacement_required", "c".repeat(64))));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "synthetic-backup" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("button", { name: "Show authenticator setup" })).toBeInTheDocument();
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
  });

  it("disables login until Retry-After has elapsed", async () => {
    renderLogin();
    await screen.findByRole("button", { name: "Sign in" });
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(response({ message: "Too many" }, 429, { "Retry-After": "30" }));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Email"), { target: { value: user.email } });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "synthetic-password" } });
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    });
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(screen.getByText("Try again in 30 seconds.")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows sanitized service-unavailable copy without echoing sensitive error payloads", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ message: "synthetic-secret", trace: ["private"] }, 503));
    renderLogin();
    await enterCredentials();
    expect(await screen.findByRole("alert")).toHaveTextContent("Authentication service is unavailable.");
    expect(document.body).not.toHaveTextContent("synthetic-secret");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("rejects unauthenticated protected routes", async () => {
    renderLogin("/admin/users");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
  });

  it("rejects cached sessions when the authoritative Admin role gate denies /me", async () => {
    sessionStorage.setItem(adminAuthStorageKey, JSON.stringify({ version: adminSessionVersion,
      created_at: new Date().toISOString(), token: "ineligible-token", user: { ...user, roles: ["customer"] } }));
    vi.mocked(fetch).mockResolvedValueOnce(response({ message: "Admin access denied" }, 403));
    renderLogin("/admin/users");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
  });

  it.each(["https://outside.example.test/", "/admin/../account", "/admin/%2e%2e/account", "/admin/login?next=account"])("rejects unsafe or login-loop redirect %s", async from => {
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge()));
    renderLogin("/admin/login", { from });
    await enterCredentials();
    await screen.findByLabelText("Google Authenticator code");
    vi.mocked(fetch).mockResolvedValueOnce(response({ token: "verified-token", user }))
      .mockResolvedValueOnce(response({ user }));
    await verify();
    expect(await screen.findByTestId("protected")).toHaveAttribute("data-path", "/admin");
  });

  it("returns to a protected Admin destination after MFA", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge()));
    renderLogin("/admin/login", { from: "/admin/users" });
    await enterCredentials();
    await screen.findByLabelText("Google Authenticator code");
    vi.mocked(fetch).mockResolvedValueOnce(response({ token: "verified-token", user }))
      .mockResolvedValueOnce(response({ user }));
    await verify();
    expect(await screen.findByTestId("protected")).toHaveAttribute("data-path", "/admin/users");
  });

  it("keeps backoffice roles returned by /me and clears the session on logout", async () => {
    sessionStorage.setItem(adminAuthStorageKey, JSON.stringify({ version: adminSessionVersion,
      created_at: new Date().toISOString(), token: "admin-token", user }));
    vi.mocked(fetch).mockResolvedValueOnce(response({ user: { ...user, roles: ["compliance_officer"] } }))
      .mockResolvedValueOnce(response({ mandatory: true, enrolled: true, confirmed_at: "2026-01-01T00:00:00Z", recovery_codes_remaining: 8 }));
    renderLogin("/admin/settings");
    expect(await screen.findByText(/Recovery codes remaining: 8/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Authenticator security" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
  });

  it("transfers working-authenticator replacement from Session to Login without losing the one-time codes", async () => {
    sessionStorage.setItem(adminAuthStorageKey, JSON.stringify({ version: adminSessionVersion,
      created_at: new Date().toISOString(), token: "admin-token", user }));
    vi.mocked(fetch).mockResolvedValueOnce(response({ user }))
      .mockResolvedValueOnce(response({ mandatory: true, enrolled: true, confirmed_at: "2026-01-01T00:00:00Z", recovery_codes_remaining: 8 }));
    renderLogin("/admin/settings");
    await screen.findByText(/Recovery codes remaining: 8/);
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("step_up_required")));
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue with verification" }));
    await screen.findByLabelText("Google Authenticator code");
    vi.mocked(fetch).mockResolvedValueOnce(response(challenge("replacement_required", "b".repeat(64))));
    await verify();
    await screen.findByRole("button", { name: "Show authenticator setup" });
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...challenge("replacement_required", "b".repeat(64)), manual_key: "NEWKEY", qr_svg: "<svg/>" }));
    fireEvent.click(screen.getByRole("button", { name: "Show authenticator setup" }));
    await screen.findByText("NEWKEY");
    let resolveMe!: (value: Response) => void;
    vi.mocked(fetch).mockResolvedValueOnce(response({ token: "replaced-token", user, recovery_codes: codes }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveMe = resolve; }));
    await verify();
    await waitFor(() => expect(resolveMe).toBeTypeOf("function"));
    await screen.findByRole("heading", { name: "Origin Wallet Admin" });
    expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
    await act(async () => { resolveMe(response({ user })); });
    expect(await screen.findByRole("heading", { name: "Save your recovery codes" })).toBeInTheDocument();
    expect(screen.getAllByText(/^synthetic-code-/)).toHaveLength(10);
    fireEvent.click(screen.getByLabelText("I have saved my recovery codes"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: "Authenticator security" });
    expect(sessionStorage.getItem(adminAuthStorageKey)).toContain("replaced-token");
    expect(screen.queryByText("synthetic-code-0")).not.toBeInTheDocument();
  });
});
