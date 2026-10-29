import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import AdminProviders from "./AdminProviders";

const mocks = vi.hoisted(() => ({ requestApi: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requestApi: mocks.requestApi }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "test-token" }) }));

it("uses the canonical logo in both provider lists without changing other provider artwork or making writes", async () => {
  mocks.requestApi.mockResolvedValue({ current_page: 1, last_page: 1, total: 2, data: [
    { id: 1, code: "nium", name: "Nium", status: "active", logo_url: "https://old.example/nium.svg" },
    { id: 2, code: "other", name: "Other Provider", status: "active", logo_url: "/other-provider.svg" },
  ] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AdminProviders /></QueryClientProvider>);
  const brandLogos = await screen.findAllByRole("img", { name: "Origin Wallet logo" });
  expect(brandLogos).toHaveLength(2);
  brandLogos.forEach((logo) => expect(logo).toHaveAttribute("src", "/logo/logo.jpg"));
  screen.getAllByRole("img", { name: "Other Provider logo" }).forEach((logo) => expect(logo).toHaveAttribute("src", "/other-provider.svg"));
  expect(mocks.requestApi.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
});
