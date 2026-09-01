import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminLedger from "@/pages/admin/AdminLedger";
import type { AdminLedgerEntry, AdminWalletAccount } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({
  getAdminWallets: vi.fn(),
  getAdminWallet: vi.fn(),
  getAdminLedgerEntries: vi.fn(),
  getAdminLedgerEntry: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "admin-token" }) }));

const wallet: AdminWalletAccount = {
  id: 5,
  user_id: 20,
  user: { id: 20, email: "wallet-user@example.test", phone: null, full_name: "Wallet User", status: "active", kyc_status: "verified", profile: null, roles: [] },
  provider_id: 1,
  provider: { id: 1, code: "nium", name: "Nium", status: "active" },
  account_reference: "raw-external-wallet-12345678",
  currency: "USD",
  available_balance: "100.00000000",
  ledger_balance: "125.00000000",
  hold_balance: "25.00000000",
  status: "active",
  last_reconciled_at: "2026-08-24T10:00:00Z",
};
const entry: AdminLedgerEntry = {
  id: 9,
  wallet_id: 5,
  wallet,
  user_id: 20,
  user: wallet.user,
  provider_id: 1,
  provider: wallet.provider,
  reference: "raw-internal-ledger-reference-9876",
  entry_type: "debit",
  status: "posted",
  currency: "USD",
  amount: "-25.00000000",
  balance_after: "100.00000000",
  source_type: "transfer",
  source_id: "raw-source-id-4567",
  posted_at: "2026-08-24T10:01:00Z",
};
const page = <T,>(data: T[], lastPage = 1) => ({ current_page: 1, data, first_page_url: null, from: data.length ? 1 : null, last_page: lastPage, last_page_url: null, links: [], next_page_url: lastPage > 1 ? "page=2" : null, path: "/api/admin/test", per_page: 15, prev_page_url: null, to: data.length, total: data.length });
const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminLedger /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getAdminWallets.mockResolvedValue(page([wallet]));
  apiMocks.getAdminWallet.mockResolvedValue(wallet);
  apiMocks.getAdminLedgerEntries.mockResolvedValue(page([entry]));
  apiMocks.getAdminLedgerEntry.mockResolvedValue(entry);
});

it("paginates wallets independently", async () => {
  apiMocks.getAdminWallets.mockResolvedValue(page([wallet], 2));
  renderPage();
  await screen.findByText("Wallet page 1 of 2");
  fireEvent.click(screen.getByRole("button", { name: "Next wallet page" }));
  await waitFor(() => expect(apiMocks.getAdminWallets).toHaveBeenLastCalledWith(expect.stringContaining("page=2"), "admin-token"));
});

it("passes supported wallet and ledger filters", async () => {
  renderPage();
  await screen.findByText("wallet-user@example.test");
  fireEvent.change(screen.getByLabelText("Filter wallets by user"), { target: { value: "20" } });
  fireEvent.change(screen.getByLabelText("Filter wallets by currency"), { target: { value: "usd" } });
  fireEvent.change(screen.getByLabelText("Search wallets"), { target: { value: "wallet user" } });
  fireEvent.change(screen.getByLabelText("Filter ledger by entry type"), { target: { value: "debit" } });
  fireEvent.change(screen.getByLabelText("Filter ledger by provider"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Filter ledger by user"), { target: { value: "20" } });
  await waitFor(() => {
    const walletQuery = String(apiMocks.getAdminWallets.mock.calls.at(-1)?.[0]);
    const ledgerQuery = String(apiMocks.getAdminLedgerEntries.mock.calls.at(-1)?.[0]);
    expect(walletQuery).toContain("user_id=20");
    expect(walletQuery).toContain("currency=USD");
    expect(walletQuery).toContain("search=wallet+user");
    expect(ledgerQuery).toContain("entry_type=debit");
    expect(ledgerQuery).toContain("provider_id=1");
    expect(ledgerQuery).toContain("user_id=20");
  });
});

it("loads wallet and ledger detail endpoints", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect wallet" }));
  await waitFor(() => expect(apiMocks.getAdminWallet).toHaveBeenCalledWith(5, "admin-token"));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Inspect entry" }));
  await waitFor(() => expect(apiMocks.getAdminLedgerEntry).toHaveBeenCalledWith(9, "admin-token"));
});

it("masks wallet and internal ledger references", async () => {
  renderPage();
  expect(await screen.findAllByText("****5678")).not.toHaveLength(0);
  expect(screen.getByText("****9876")).toBeInTheDocument();
  expect(screen.queryByText("raw-external-wallet-12345678")).not.toBeInTheDocument();
  expect(screen.queryByText("raw-internal-ledger-reference-9876")).not.toBeInTheDocument();
  expect(screen.queryByText("raw-source-id-4567")).not.toBeInTheDocument();
});

it("shows API errors", async () => {
  apiMocks.getAdminWallets.mockRejectedValue(new Error("Wallet API unavailable"));
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("Wallet API unavailable");
});

it("protects against unsupported wallet statuses", async () => {
  const unsupportedWallet = { ...wallet, status: "pending" } as unknown as AdminWalletAccount;
  apiMocks.getAdminWallets.mockResolvedValue(page([unsupportedWallet]));
  renderPage();
  expect(await screen.findByText("unknown")).toBeInTheDocument();
  expect(screen.queryByText("pending")).not.toBeInTheDocument();
});

it("renders authoritative amounts without inferred signs", async () => {
  renderPage();
  expect(await screen.findByText("-25 USD")).toBeInTheDocument();
  expect(screen.queryByText("--25 USD")).not.toBeInTheDocument();
});

it("uses provider balance timestamp semantics without inferring reconciliation", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect wallet" }));
  expect(await screen.findByText("Provider balance timestamp")).toBeInTheDocument();
  expect(screen.getAllByText("Available balance").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Ledger balance").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Reserved balance").length).toBeGreaterThan(0);
  expect(screen.queryByText(/reconcil/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/completed/i)).not.toBeInTheDocument();
});

it("keeps wallet balances separated by currency", async () => {
  const eurWallet = { ...wallet, id: 6, account_reference: "wallet-eur-8765", currency: "EUR", available_balance: "80", ledger_balance: "90", hold_balance: "10" };
  apiMocks.getAdminWallets.mockResolvedValue(page([wallet, eurWallet]));
  renderPage();
  expect((await screen.findAllByText("100 USD")).length).toBeGreaterThan(0);
  expect(screen.getByText("125 USD")).toBeInTheDocument();
  expect(screen.getByText("25 USD")).toBeInTheDocument();
  expect(screen.getByText("80 EUR")).toBeInTheDocument();
  expect(screen.getByText("90 EUR")).toBeInTheDocument();
  expect(screen.getByText("10 EUR")).toBeInTheDocument();
  expect(screen.queryByText("180")).not.toBeInTheDocument();
});

it("handles unknown wallet balance values safely", async () => {
  apiMocks.getAdminWallet.mockResolvedValue({ ...wallet, currency: "", ledger_balance: null, hold_balance: null, last_reconciled_at: null, updated_at: "not-a-date" });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect wallet" }));
  await waitFor(() => expect(apiMocks.getAdminWallet).toHaveBeenCalled());
  expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(4);
  expect(screen.queryByText(/undefined|null|invalid date/i)).not.toBeInTheDocument();
});
