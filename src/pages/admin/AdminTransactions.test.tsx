import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminTransactions from "@/pages/admin/AdminTransactions";
import type { AdminTransfer } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({ requestApi: vi.fn() }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, requestApi: apiMocks.requestApi };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "admin-token" }) }));

const transfer: AdminTransfer = {
  id: 42,
  transfer_no: "TR-SENSITIVE-9876",
  user_id: 7,
  provider_id: 1,
  user: { id: 7, email: "customer@example.com", phone: null, full_name: "Customer", status: "active", kyc_status: "approved", profile: null, roles: [] },
  provider: { id: 1, code: "provider", name: "Provider", status: "operational" },
  beneficiary: { full_name: "Safe Beneficiary", bank_name: "Safe Bank", country_code: "US", currency: "USD", status: "active" },
  external_transfer_id: "EXT-SENSITIVE-4321",
  external_payment_id: "PAY-SENSITIVE-6789",
  transfer_type: "payout",
  source_currency: "USD",
  target_currency: "EUR",
  source_amount: "100.00",
  target_amount: "91.50",
  status: "approval_required",
  submitted_at: "2026-08-24T10:00:00Z",
  created_at: "2026-08-24T09:00:00Z",
  approvals: [],
};

const page = (data: AdminTransfer[] = [transfer], lastPage = 1) => ({
  current_page: 1, data, first_page_url: null, from: data.length ? 1 : null, last_page: lastPage,
  last_page_url: null, links: [], next_page_url: lastPage > 1 ? "page=2" : null,
  path: "/api/admin/transfers", per_page: 15, prev_page_url: null, to: data.length, total: data.length,
});

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminTransactions /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => {
    if (url === "/admin/transfers?page=1") return Promise.resolve(page());
    if (url === "/admin/transfers/42" && options?.method === "GET") return Promise.resolve(transfer);
    return Promise.resolve({ message: "ok" });
  });
});

const openReview = async () => {
  fireEvent.click((await screen.findAllByRole("button", { name: /review/i }))[0]);
  expect(await screen.findByRole("heading", { name: "Transfer review" })).toBeInTheDocument();
  expect(await screen.findByText("Safe Beneficiary")).toBeInTheDocument();
};

it.each([
  ["approve", "Approve", "Confirm approval", "/admin/transfers/42/approve"],
  ["reject", "Reject", "Confirm rejection", "/admin/transfers/42/reject"],
])("requires confirmation before %s", async (_action, actionLabel, confirmationLabel, endpoint) => {
  renderPage();
  await openReview();
  fireEvent.click(screen.getByRole("button", { name: actionLabel }));
  expect(apiMocks.requestApi).not.toHaveBeenCalledWith(endpoint, expect.anything());
  fireEvent.click(screen.getByRole("button", { name: confirmationLabel }));
  await waitFor(() => expect(apiMocks.requestApi).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: "POST", body: {} })));
});

it("masks transfer and provider identifiers", async () => {
  renderPage();
  expect(await screen.findAllByText("TR****9876")).not.toHaveLength(0);
  expect(screen.getByText("EX****4321")).toBeInTheDocument();
  expect(screen.queryByText("TR-SENSITIVE-9876")).not.toBeInTheDocument();
  expect(screen.queryByText("EXT-SENSITIVE-4321")).not.toBeInTheDocument();
  expect(screen.queryByText("PAY-SENSITIVE-6789")).not.toBeInTheDocument();
});

it("renders only safe detail fields and excludes raw payload and account data", async () => {
  apiMocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => {
    if (url === "/admin/transfers?page=1") return Promise.resolve(page());
    if (url === "/admin/transfers/42" && options?.method === "GET") return Promise.resolve({
      ...transfer,
      raw_data: { secret: "raw-provider-secret" },
      source_bank_account: { account_number: "123456789", iban: "SECRET-IBAN" },
      beneficiary: { ...transfer.beneficiary, account_number: "987654321", external_beneficiary_id: "RAW-BENEFICIARY-ID" },
    });
    return Promise.resolve({ message: "ok" });
  });
  renderPage();
  await openReview();
  expect(await screen.findByText("Safe Beneficiary")).toBeInTheDocument();
  for (const secret of ["raw-provider-secret", "123456789", "SECRET-IBAN", "987654321", "RAW-BENEFICIARY-ID"]) {
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  }
});

it("renders supported transfer lifecycle labels", async () => {
  const statuses = ["pending", "submitted", "processing", "completed", "failed", "cancelled", "submission_unknown"];
  apiMocks.requestApi.mockResolvedValue(page(statuses.map((status, index) => ({ ...transfer, id: index + 1, transfer_no: `TR-${index}-0000`, status }))));
  renderPage();
  for (const label of ["Pending", "Submitted", "Processing", "Completed", "Failed", "Cancelled", "Submission unknown"]) {
    expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
  }
});

it("uses backend pagination metadata without inventing totals", async () => {
  apiMocks.requestApi.mockImplementation((url: string) => Promise.resolve(url.endsWith("page=2") ? { ...page(), current_page: 2, last_page: 2 } : page([transfer], 2)));
  renderPage();
  expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(apiMocks.requestApi).toHaveBeenCalledWith("/admin/transfers?page=2", expect.objectContaining({ method: "GET" })));
});
