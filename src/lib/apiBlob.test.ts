import { ApiRequestError, requestApiBlob } from "@/lib/api";

describe("requestApiBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["application/pdf", "pdf"],
  ])("preserves the provider content type for %s previews", async (contentType, body) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "Content-Type": contentType },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const blob = await requestApiBlob("/api/kyc-documents/20/token", {
      token: "admin-token",
      accept: contentType,
    });

    expect(blob.type).toBe(contentType);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/kyc-documents/20/token"),
      expect.objectContaining({
        method: "GET",
        headers: { Accept: contentType, Authorization: "Bearer admin-token" },
      }),
    );
  });

  it.each([
    [401, "Unauthenticated."],
    [403, "Forbidden."],
    [404, "Document not found."],
  ])("returns an actionable error for HTTP %i", async (status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message }), {
      status,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(requestApiBlob("/api/kyc-documents/20/token", { token: "admin-token" }))
      .rejects.toEqual(expect.objectContaining<ApiRequestError>({ status, message }));
  });

  it("reports network failures without creating a preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(requestApiBlob("/api/kyc-documents/20/token", { token: "admin-token" }))
      .rejects.toThrow(/cannot connect to api/i);
  });

  it("does not send the admin token to a non-API document origin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestApiBlob("https://files.example.test/passport", { token: "admin-token" }))
      .rejects.toThrow(/refusing to send admin credentials/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
