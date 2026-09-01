import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminBankAccounts from "@/pages/admin/AdminBankAccounts";
import type { AdminBankAccount } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({ getAdminBankAccounts: vi.fn(), getAdminBankAccount: vi.fn() }));
vi.mock("@/lib/api", () => apiMocks);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "admin-token" }) }));

const account: AdminBankAccount = { id: 123456, user_id: 88, provider_id: 98765, currency: "USD", status: "active", created_at: "2026-08-24T10:00:00Z", updated_at: "2026-08-24T11:00:00Z" };
const page = (data: AdminBankAccount[] = [account]) => ({ current_page: 1, last_page: 1, total: data.length, data });
const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminBankAccounts /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getAdminBankAccounts.mockResolvedValue(page());
  apiMocks.getAdminBankAccount.mockResolvedValue(account);
});

it("renders safe bank account fields and loads read-only detail", async () => {
  renderPage();
  expect(await screen.findByText("USD")).toBeInTheDocument();
  expect(screen.getByText("active")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
  await waitFor(() => expect(apiMocks.getAdminBankAccount).toHaveBeenCalledWith(123456, "admin-token"));
  expect(screen.getAllByText("****3456").length).toBeGreaterThan(0);
  expect(screen.getAllByText("****8765").length).toBeGreaterThan(0);
});

it("does not disclose bank coordinates or provider data", async () => {
  apiMocks.getAdminBankAccount.mockResolvedValue({ ...account, account_number: "account-secret", iban: "iban-secret", swift_bic: "swift-secret", routing_number: "routing-secret", raw_data: { token: "provider-token" } });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  await screen.findAllByText("****3456");
  for (const secret of ["account-secret", "iban-secret", "swift-secret", "routing-secret", "provider-token"]) expect(screen.queryByText(secret)).not.toBeInTheDocument();
});

it("renders an empty state", async () => {
  apiMocks.getAdminBankAccounts.mockResolvedValue(page([]));
  renderPage();
  expect(await screen.findByText("No bank accounts found.")).toBeInTheDocument();
});

it("renders list and detail errors", async () => {
  apiMocks.getAdminBankAccounts.mockRejectedValue(new Error("Bank account API unavailable"));
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("Bank account API unavailable");
});
