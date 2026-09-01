import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminTransactionRecords from "@/pages/admin/AdminTransactionRecords";
import type { AdminTransaction } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({ getAdminTransactionRecords: vi.fn(), getAdminTransactionRecord: vi.fn() }));
vi.mock("@/lib/api", () => apiMocks);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "admin-token" }) }));

const transaction: AdminTransaction = {
  id: 41,
  user_id: 20,
  provider_id: 1,
  bank_account_id: 31,
  transfer_id: 51,
  external_transaction_id: "external-sensitive-transaction-9876",
  transaction_type: "payment",
  direction: "credit",
  currency: "USD",
  amount: "125.00000000",
  fee_amount: "1.50000000",
  description: "Provider settlement",
  reference_text: "internal-transfer-reference-4567",
  status: "completed",
  booked_at: "2026-08-24T10:00:00Z",
  value_date: "2026-08-24",
  compliance_review_required: false,
  compliance_status: "CLEAR",
  compliance_reviewed_at: "2026-08-24T10:05:00Z",
  created_at: "2026-08-24T10:00:00Z",
  updated_at: "2026-08-24T10:05:00Z",
};
const page = (data: AdminTransaction[] = [transaction], lastPage = 1) => ({ current_page: 1, data, first_page_url: null, from: data.length ? 1 : null, last_page: lastPage, last_page_url: null, links: [], next_page_url: lastPage > 1 ? "page=2" : null, path: "/api/admin/transactions", per_page: 15, prev_page_url: null, to: data.length, total: data.length });
const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminTransactionRecords /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getAdminTransactionRecords.mockResolvedValue(page());
  apiMocks.getAdminTransactionRecord.mockResolvedValue(transaction);
});

it("loads the transaction list", async () => {
  renderPage();
  expect(await screen.findByText("payment")).toBeInTheDocument();
  expect(screen.getByText("125 USD")).toBeInTheDocument();
  expect(apiMocks.getAdminTransactionRecords).toHaveBeenCalledWith(1, "admin-token");
});

it("shows the empty state", async () => {
  apiMocks.getAdminTransactionRecords.mockResolvedValue(page([]));
  renderPage();
  expect(await screen.findByText("No transaction records found.")).toBeInTheDocument();
});

it("paginates transaction records", async () => {
  apiMocks.getAdminTransactionRecords.mockResolvedValue(page([transaction], 2));
  renderPage();
  await screen.findByText("Page 1 of 2");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(apiMocks.getAdminTransactionRecords).toHaveBeenLastCalledWith(2, "admin-token"));
});

it("loads safe transaction detail", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  await waitFor(() => expect(apiMocks.getAdminTransactionRecord).toHaveBeenCalledWith(41, "admin-token"));
  expect(await screen.findByText("Provider settlement")).toBeInTheDocument();
  expect(screen.getAllByText("CLEAR").length).toBeGreaterThan(0);
});

it("masks external, internal, and transfer references", async () => {
  renderPage();
  expect(await screen.findByText("****9876")).toBeInTheDocument();
  expect(screen.queryByText("external-sensitive-transaction-9876")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
  expect(await screen.findByText("****4567")).toBeInTheDocument();
  expect(screen.queryByText("internal-transfer-reference-4567")).not.toBeInTheDocument();
});

it("does not render nested bank, transfer, or raw provider data", async () => {
  apiMocks.getAdminTransactionRecord.mockResolvedValue({
    ...transaction,
    raw_data: { providerToken: "sensitive-provider-token" },
    bank_account: { account_number: "sensitive-account-number", iban: "sensitive-iban", swift_bic: "sensitive-swift", routing_number: "sensitive-routing" },
    transfer: { external_transfer_id: "sensitive-transfer-id", raw_data: { secret: "sensitive-transfer-metadata" } },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  await screen.findByText("Provider settlement");
  for (const secret of ["sensitive-provider-token", "sensitive-account-number", "sensitive-iban", "sensitive-swift", "sensitive-routing", "sensitive-transfer-id", "sensitive-transfer-metadata"]) {
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  }
});

it("shows API errors", async () => {
  apiMocks.getAdminTransactionRecords.mockRejectedValue(new Error("Transaction API unavailable"));
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("Transaction API unavailable");
});
