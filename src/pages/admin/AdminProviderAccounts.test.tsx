import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminProviderAccounts from "@/pages/admin/AdminProviderAccounts";
import type { AdminKycProviderSubmission } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({
  getAdminProviderAccountSubmissions: vi.fn(),
  syncAdminProviderAccount: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "admin-token" }) }));

const submission: AdminKycProviderSubmission = {
  id: 31,
  user_id: 2088,
  provider_id: 8,
  status: "submitted",
  provider: { id: 8, code: "nium", name: "Nium", status: "active" },
  kyc_profile: { id: 10, user_id: 2088, status: "verified", applicant_type: "business", legal_name: "Customer", address_line1: "Address", city: "Bangkok", country_code: "TH" },
  provider_account: {
    id: 41,
    user_id: 2088,
    provider_id: 8,
    status: "active",
    provider_status: "clear",
    provider_sub_status: "customer_active",
    compliance_status: "clear",
    rfi_status: "not_required",
    provider_status_updated_at: "2026-08-24T10:00:00Z",
    transactions_last_synced_at: "2026-08-24T11:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
};

const page = (data: AdminKycProviderSubmission[] = [submission]) => ({ current_page: 1, last_page: 1, total: data.length, data });
const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminProviderAccounts /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getAdminProviderAccountSubmissions.mockResolvedValue(page());
  apiMocks.syncAdminProviderAccount.mockResolvedValue({
    message: "raw provider message",
    provider: submission.provider,
    user_id: submission.user_id,
    provider_account: { ...submission.provider_account, status: "active", provider_status: "clear" },
  });
});

it("renders backend provider, account, KYC, compliance, RFI, and sync states", async () => {
  renderPage();
  expect(await screen.findByText("Origin Wallet")).toBeInTheDocument();
  expect(screen.getAllByText("active").length).toBeGreaterThan(0);
  expect(screen.getByText("verified")).toBeInTheDocument();
  expect(screen.getAllByText("clear").length).toBeGreaterThan(0);
  expect(screen.getByText("not required")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
  expect(screen.getByText("Provider status timestamp")).toBeInTheDocument();
  expect(screen.getByText("Transactions last synced")).toBeInTheDocument();
});

it("synchronizes through the existing authoritative provider endpoint", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  fireEvent.click(screen.getByRole("button", { name: "Synchronize provider account" }));
  await waitFor(() => expect(apiMocks.syncAdminProviderAccount).toHaveBeenCalledWith("nium", 2088, "admin-token"));
  expect(await screen.findByRole("status")).toHaveTextContent("Provider account synchronized successfully.");
});

it("shows synchronization failures", async () => {
  apiMocks.syncAdminProviderAccount.mockRejectedValue(new Error("Provider synchronization unavailable"));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  fireEvent.click(screen.getByRole("button", { name: "Synchronize provider account" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Provider synchronization unavailable");
});

it("does not disclose provider payloads, secrets, external identifiers, or metadata", async () => {
  apiMocks.getAdminProviderAccountSubmissions.mockResolvedValue(page([{
    ...submission,
    provider_account: {
      ...submission.provider_account!,
      external_customer_id: "sensitive-customer-id",
      external_account_id: "sensitive-account-id",
      external_reference: "sensitive-provider-reference",
      raw_data: { token: "raw-provider-token" },
      metadata: { secret: "internal-provider-secret" },
    },
  } as AdminKycProviderSubmission]));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  expect(screen.getAllByText("****").length).toBeGreaterThan(0);
  for (const secret of ["sensitive-customer-id", "sensitive-account-id", "sensitive-provider-reference", "raw-provider-token", "internal-provider-secret"]) {
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  }
});
