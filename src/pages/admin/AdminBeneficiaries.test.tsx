import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminBeneficiaries from "@/pages/admin/AdminBeneficiaries";
import type { AdminBeneficiary } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({ getAdminBeneficiaries: vi.fn(), getAdminBeneficiary: vi.fn() }));
vi.mock("@/lib/api", () => apiMocks);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "admin-token" }) }));

const beneficiary: AdminBeneficiary = { id: 654321, user_id: 88, provider_id: 98765, external_beneficiary_id: "provider-beneficiary-secret", full_name: "Jane Doe", currency: "SGD", status: "active", created_at: "2026-08-24T10:00:00Z", updated_at: "2026-08-24T11:00:00Z" };
const page = (data: AdminBeneficiary[] = [beneficiary]) => ({ current_page: 1, last_page: 1, total: data.length, data });
const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminBeneficiaries /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getAdminBeneficiaries.mockResolvedValue(page());
  apiMocks.getAdminBeneficiary.mockResolvedValue(beneficiary);
});

it("renders masked beneficiary fields and read-only payout status", async () => {
  renderPage();
  expect(await screen.findByText("J*** D***")).toBeInTheDocument();
  expect(screen.getByText("SGD")).toBeInTheDocument();
  expect(screen.getByText("Mapped")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
  await waitFor(() => expect(apiMocks.getAdminBeneficiary).toHaveBeenCalledWith(654321, "admin-token"));
  expect(screen.getAllByText("****4321").length).toBeGreaterThan(0);
  expect(screen.getAllByText("****8765").length).toBeGreaterThan(0);
  expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
});

it("does not disclose payment coordinates, provider identifiers, or payloads", async () => {
  apiMocks.getAdminBeneficiary.mockResolvedValue({ ...beneficiary, account_number: "account-secret", iban: "iban-secret", swift_bic: "swift-secret", routing_number: "routing-secret", raw_data: { token: "provider-token" } });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  await screen.findAllByText("J*** D***");
  for (const secret of ["provider-beneficiary-secret", "account-secret", "iban-secret", "swift-secret", "routing-secret", "provider-token"]) expect(screen.queryByText(secret)).not.toBeInTheDocument();
});

it("renders unknown mapping and an empty state safely", async () => {
  apiMocks.getAdminBeneficiaries.mockResolvedValue(page([]));
  renderPage();
  expect(await screen.findByText("No beneficiaries found.")).toBeInTheDocument();
});

it("renders API errors", async () => {
  apiMocks.getAdminBeneficiaries.mockRejectedValue(new Error("Beneficiary API unavailable"));
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("Beneficiary API unavailable");
});
