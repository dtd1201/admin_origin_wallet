import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthProvider,
  adminAuthStorageKey,
  adminSessionVersion,
  useAuth,
} from "@/contexts/AuthContext";
import { requestApi } from "@/lib/api";
import type { AdminUser } from "@/types/admin";

const adminUser: AdminUser = {
  id: 7,
  email: "admin@example.com",
  phone: null,
  full_name: "Admin User",
  status: "active",
  kyc_status: "approved",
  profile: null,
  roles: ["admin"],
};

const storedSession = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  version: adminSessionVersion,
  created_at: new Date(Date.now() - 1_000).toISOString(),
  token: "admin-token",
  user: adminUser,
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

const Harness = () => {
  const auth = useAuth();
  return (
    <div>
      <span>{auth.loading ? "loading" : auth.user?.email ?? "signed-out"}</span>
      <button onClick={() => void auth.verifyLogin("admin@example.com", "123456")}>verify</button>
      <button onClick={() => void auth.logout()}>logout</button>
    </div>
  );
};

const renderAuth = () => render(<AuthProvider><Harness /></AuthProvider>);

describe("admin session storage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jsonResponse({ user: adminUser }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("stores verified sessions only in sessionStorage", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ token: "verified-token", user: adminUser }));
    renderAuth();
    await waitFor(() => expect(screen.getByText("signed-out")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "verify" }));
    await waitFor(() => expect(screen.getByText(adminUser.email)).toBeInTheDocument());

    expect(localStorage.getItem(adminAuthStorageKey)).toBeNull();
    expect(sessionStorage.getItem(adminAuthStorageKey)).toContain("verified-token");
  });

  it("restores a valid session only after auth me validation", async () => {
    sessionStorage.setItem(adminAuthStorageKey, storedSession());
    renderAuth();

    await waitFor(() => expect(screen.getByText(adminUser.email)).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/auth/me"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer admin-token" }) }),
    );
  });

  it.each([
    { version: 999 },
    { created_at: "invalid" },
    { token: "" },
    { user: { email: "admin@example.com" } },
  ])("removes an invalid stored session", async (overrides) => {
    sessionStorage.setItem(adminAuthStorageKey, storedSession(overrides));
    renderAuth();

    await waitFor(() => expect(screen.getByText("signed-out")).toBeInTheDocument());
    expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
  });

  it("removes legacy localStorage session data", async () => {
    localStorage.setItem(adminAuthStorageKey, storedSession());
    renderAuth();

    await waitFor(() => expect(screen.getByText("signed-out")).toBeInTheDocument());
    expect(localStorage.getItem(adminAuthStorageKey)).toBeNull();
  });

  it("clears session storage on logout", async () => {
    sessionStorage.setItem(adminAuthStorageKey, storedSession());
    renderAuth();
    await waitFor(() => expect(screen.getByText(adminUser.email)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(screen.getByText("signed-out")).toBeInTheDocument());
    expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
    expect(localStorage.getItem(adminAuthStorageKey)).toBeNull();
  });

  it.each([401, 403])("clears the active session after a %s response", async (status) => {
    sessionStorage.setItem(adminAuthStorageKey, storedSession());
    renderAuth();
    await waitFor(() => expect(screen.getByText(adminUser.email)).toBeInTheDocument());
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, status));

    await act(async () => {
      await expect(requestApi("/admin/users", { token: "admin-token" })).rejects.toThrow("Unauthorized");
    });

    await waitFor(() => expect(screen.getByText("signed-out")).toBeInTheDocument());
    expect(sessionStorage.getItem(adminAuthStorageKey)).toBeNull();
  });
});
