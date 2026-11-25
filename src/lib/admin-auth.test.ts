import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthFailure, newClientBinding, readChallenge, requestAdminAuth } from "@/lib/admin-auth";

describe("Admin auth transport", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it("uses no-store/no-referrer and explicit binding/bearer without cookies or email verification fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await requestAdminAuth("security/step-up/verify", { body: { challenge_token: "a".repeat(64), totp_code: "000123" }, binding: "b".repeat(64), token: "synthetic-token" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/admin/auth/security/step-up/verify"), expect.objectContaining({
      cache: "no-store", referrerPolicy: "no-referrer", credentials: "omit", method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer synthetic-token", "X-Auth-Client-Binding": "b".repeat(64) }),
      body: JSON.stringify({ challenge_token: "a".repeat(64), totp_code: "000123" }),
    }));
  });
  it("generates a fresh cryptographically random 64-character binding", () => {
    const first = newClientBinding();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(newClientBinding()).not.toBe(first);
  });
  it("handles HTTP-date Retry-After without exposing error bodies", async () => {
    const date = new Date(Math.ceil(Date.now() / 1000) * 1000 + 60000).toUTCString();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"message":"synthetic-secret"}', { status: 429, headers: { "Retry-After": date } }));
    await expect(requestAdminAuth("login")).rejects.toMatchObject({ status: 429, retryAt: Date.parse(date), message: "Too many authentication attempts. Wait before trying again." });
  });
  it("sanitizes network errors and malformed success responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("synthetic-secret"));
    await expect(requestAdminAuth("login")).rejects.toThrow("Unable to connect to the authentication service.");
    fetchMock.mockResolvedValueOnce(new Response("invalid-json"));
    await expect(requestAdminAuth("login")).rejects.toBeInstanceOf(AuthFailure);
  });
  it.each([
    {}, { next_action: "email_otp" }, { next_action: "totp_required", challenge_token: "short", expires_in_seconds: 300, methods: [] },
    { next_action: "totp_required", challenge_token: "a".repeat(64), expires_in_seconds: 0, methods: [] },
  ])("fails closed on unsupported or malformed challenge %j", result => {
    expect(() => readChallenge(result as Parameters<typeof readChallenge>[0])).toThrow("invalid");
  });
});
