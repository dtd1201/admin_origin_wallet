import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminKycReviews from "@/pages/admin/AdminKycReviews";
import type { AdminAmlScreening, AdminKycProfile, AdminKycProviderSubmission } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({
  requestApi: vi.fn(),
  getAdminKycProfile: vi.fn(),
  getAdminKycProviderSubmissions: vi.fn(),
  approveAdminKycProviderSubmission: vi.fn(),
  rejectAdminKycProviderSubmission: vi.fn(),
  getAdminAmlScreenings: vi.fn(),
  clearAdminAmlScreening: vi.fn(),
  confirmAdminAmlMatch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  adminEndpointConfig: { kycProfiles: "/admin/kyc-profiles" },
  buildApiUrl: (path: string) => `https://api.example.test${path}`,
  requestApi: apiMocks.requestApi,
  getAdminKycProfile: apiMocks.getAdminKycProfile,
  getAdminKycProviderSubmissions: apiMocks.getAdminKycProviderSubmissions,
  approveAdminKycProviderSubmission: apiMocks.approveAdminKycProviderSubmission,
  rejectAdminKycProviderSubmission: apiMocks.rejectAdminKycProviderSubmission,
  getAdminAmlScreenings: apiMocks.getAdminAmlScreenings,
  clearAdminAmlScreening: apiMocks.clearAdminAmlScreening,
  confirmAdminAmlMatch: apiMocks.confirmAdminAmlMatch,
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "admin-token" }) }));

const profile: AdminKycProfile = {
  id: 10,
  user_id: 20,
  user: {
    id: 20,
    email: "customer@example.test",
    phone: "+66123456789",
    full_name: "Customer User",
    status: "pending",
    kyc_status: "pending",
    profile: null,
    roles: [],
  },
  status: "submitted",
  applicant_type: "business",
  legal_name: "List Legal Name",
  business_name: "List Business Name",
  business_registration_number: "REG-100",
  tax_id: "TAX-12345678",
  address_line1: "1 Example Road",
  city: "Bangkok",
  country_code: "TH",
  metadata: { secret_provider_value: "must-not-render" },
  submitted_at: "2026-08-24T10:00:00Z",
  requirements: [{ id: 1, key: "address", label: "Address", category: "profile", status: "needs_more_info", requirement_type: "form" }],
  documents: [{
    id: 3,
    type: "passport",
    status: "submitted",
    file_url: "/api/kyc-documents/20/hash",
    file_path: "kyc/20/private-secret-path.pdf",
    document_number: "P123456789",
    original_name: null,
  }],
  related_persons: [],
  aml_screenings: [{ id: 4, subject_name: "List Business Name", subject_role: "business", screening_provider: "internal", status: "clear" }],
};

const detailProfile: AdminKycProfile = { ...profile, legal_name: "Detail Legal Name", business_name: "Detail Business Name" };

const providerSubmission: AdminKycProviderSubmission = {
  id: 31,
  user_id: 20,
  provider_id: 8,
  status: "submitted",
  provider: { id: 8, code: "secure-provider-code", name: "Secure Provider", status: "active" },
  provider_account: { id: 41, user_id: 20, provider_id: 8, status: "pending_review" },
  submitted_at: "2026-08-24T11:00:00Z",
  approved_at: null,
  rejected_at: null,
  failure_reason: "Provider validation pending",
  review_note: "Awaiting compliance review",
  reviewed_by: { ...profile.user!, full_name: "Admin Reviewer", email: "reviewer@example.test" },
  reviewed_at: "2026-08-24T12:00:00Z",
};

const amlScreening: AdminAmlScreening = {
  id: 51,
  user_id: 20,
  kyc_profile_id: 10,
  subject_name: "Sensitive Subject Name",
  subject_role: "business",
  screening_provider: "internal",
  status: "potential_match",
  created_at: "2026-08-24T09:00:00Z",
  screened_at: "2026-08-24T10:00:00Z",
  reviewed_at: "2026-08-24T11:00:00Z",
  reviewed_by: { ...profile.user!, full_name: "AML Reviewer", email: "aml-reviewer@example.test" },
  matches: [{
    id: 61,
    aml_screening_id: 51,
    list_type: "sanctions",
    source: "sensitive-source",
    matched_name: "Sensitive Matched Name",
    score: "97.00",
    country_code: "XX",
    date_of_birth: "1970-01-01",
    status: "open",
  }],
};

const pageResponse = {
  current_page: 1,
  data: [profile],
  first_page_url: null,
  from: 1,
  last_page: 1,
  last_page_url: null,
  links: [],
  next_page_url: null,
  path: "/api/admin/kyc-profiles",
  per_page: 15,
  prev_page_url: null,
  to: 1,
  total: 1,
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AdminKycReviews /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.requestApi.mockResolvedValue(pageResponse);
  apiMocks.getAdminKycProfile.mockResolvedValue({ user: profile.user, kyc_profile: detailProfile, kyc_submission: detailProfile });
  apiMocks.getAdminKycProviderSubmissions.mockResolvedValue({ user: profile.user, data: [] });
  apiMocks.approveAdminKycProviderSubmission.mockResolvedValue({ message: "Approved", provider: providerSubmission.provider, kyc_provider_submission: providerSubmission });
  apiMocks.rejectAdminKycProviderSubmission.mockResolvedValue({ message: "Rejected", provider: providerSubmission.provider, kyc_provider_submission: { ...providerSubmission, status: "rejected" } });
  apiMocks.getAdminAmlScreenings.mockResolvedValue({ ...pageResponse, data: [] });
  apiMocks.clearAdminAmlScreening.mockResolvedValue({ message: "Cleared", aml_screening: { ...amlScreening, status: "manual_clear" } });
  apiMocks.confirmAdminAmlMatch.mockResolvedValue({ message: "Confirmed", aml_screening: { ...amlScreening, status: "confirmed_match" } });
});

it("shows a list API error instead of an empty state", async () => {
  apiMocks.requestApi.mockRejectedValue(new Error("KYC list unavailable"));
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("KYC list unavailable");
});

it("loads selected customer data from the detail endpoint", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  await waitFor(() => expect(apiMocks.getAdminKycProfile).toHaveBeenCalledWith(20, "admin-token"));
  expect((await screen.findAllByText("Detail Business Name")).length).toBeGreaterThan(0);
});

it("offers the backend draft and expired status filters", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("combobox"));
  expect(await screen.findByRole("option", { name: "Draft" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Expired" })).toBeInTheDocument();
});

it("uses the list endpoint for pagination", async () => {
  apiMocks.requestApi.mockResolvedValue({ ...pageResponse, last_page: 2, next_page_url: "page=2" });
  renderPage();
  await screen.findByText("Page 1 of 2");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(apiMocks.requestApi).toHaveBeenLastCalledWith(
    expect.stringContaining("page=2"),
    expect.objectContaining({ method: "GET", token: "admin-token" }),
  ));
});

it("does not block approval for needs_more_info requirements", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByRole("button", { name: "Approve" })).toBeEnabled();
});

it("masks sensitive fields and hides raw metadata and storage paths", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect((await screen.findAllByText("Detail Business Name")).length).toBeGreaterThan(0);
  expect(screen.queryByText("TAX-12345678")).not.toBeInTheDocument();
  expect(screen.getByText(/5678$/)).toBeInTheDocument();
  expect(screen.queryByText("P123456789")).not.toBeInTheDocument();
  expect(screen.getByText("Document no. ******6789")).toBeInTheDocument();
  expect(screen.queryByText("must-not-render")).not.toBeInTheDocument();
  expect(screen.queryByText("kyc/20/private-secret-path.pdf")).not.toBeInTheDocument();
});

it("keeps rejection notes separate from approval notes", async () => {
  apiMocks.requestApi
    .mockResolvedValueOnce(pageResponse)
    .mockResolvedValue({ user: profile.user, kyc_profile: { ...detailProfile, status: "rejected" } });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.change(await screen.findByLabelText("Approval review note"), { target: { value: "Approval-only note" } });
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  fireEvent.change(screen.getByLabelText("Rejection reason"), { target: { value: "Document mismatch" } });
  fireEvent.change(screen.getByLabelText("Internal review note"), { target: { value: "Rejection-only note" } });
  fireEvent.click(screen.getByRole("button", { name: "Reject profile" }));
  await waitFor(() => expect(apiMocks.requestApi).toHaveBeenCalledWith(
    "/admin/users/20/kyc-profile/reject",
    expect.objectContaining({ body: { rejection_reason: "Document mismatch", review_note: "Rejection-only note" } }),
  ));
});

it("shows provider submission loading", async () => {
  apiMocks.getAdminKycProviderSubmissions.mockReturnValue(new Promise(() => undefined));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByText("Loading provider submissions...")).toBeInTheDocument();
});

it("shows the provider submission empty state", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByText("No provider submissions found.")).toBeInTheDocument();
});

it("displays provider statuses and safe review fields without metadata or raw identifiers", async () => {
  apiMocks.getAdminKycProviderSubmissions.mockResolvedValue({
    user: profile.user,
    data: [{ ...providerSubmission, metadata: { token: "provider-secret-token" }, external_id: "raw-external-id" }],
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByText("Secure Provider")).toBeInTheDocument();
  expect(screen.getAllByText("submitted").length).toBeGreaterThan(0);
  expect(screen.getByText("pending_review")).toBeInTheDocument();
  expect(screen.getByText("Failure reason: Provider validation pending")).toBeInTheDocument();
  expect(screen.getByText("Review note: Awaiting compliance review")).toBeInTheDocument();
  expect(screen.getByText("Admin Reviewer")).toBeInTheDocument();
  expect(screen.queryByText("secure-provider-code")).not.toBeInTheDocument();
  expect(screen.queryByText("provider-secret-token")).not.toBeInTheDocument();
  expect(screen.queryByText("raw-external-id")).not.toBeInTheDocument();
});

it("approves a compatible provider submission after confirmation", async () => {
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: { ...detailProfile, status: "verified" },
    kyc_submission: detailProfile,
  });
  apiMocks.getAdminKycProviderSubmissions.mockResolvedValue({ user: profile.user, data: [providerSubmission] });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Approve provider" }));
  fireEvent.change(screen.getByLabelText("Review note"), { target: { value: "Release approved" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm provider approval" }));
  await waitFor(() => expect(apiMocks.approveAdminKycProviderSubmission).toHaveBeenCalledWith(
    20,
    "secure-provider-code",
    "Release approved",
    "admin-token",
  ));
});

it("shows provider approval validation errors", async () => {
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: { ...detailProfile, status: "verified" },
    kyc_submission: detailProfile,
  });
  apiMocks.getAdminKycProviderSubmissions.mockResolvedValue({ user: profile.user, data: [providerSubmission] });
  apiMocks.approveAdminKycProviderSubmission.mockRejectedValue(new Error("Provider submission cannot be approved."));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Approve provider" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm provider approval" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Provider submission cannot be approved.");
});

it("requires a reason before rejecting a provider submission", async () => {
  apiMocks.getAdminKycProviderSubmissions.mockResolvedValue({ user: profile.user, data: [providerSubmission] });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Reject provider" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm provider rejection" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Rejection reason is required.");
  expect(apiMocks.rejectAdminKycProviderSubmission).not.toHaveBeenCalled();
});

it("rejects a provider submission with its required reason", async () => {
  apiMocks.getAdminKycProviderSubmissions.mockResolvedValue({ user: profile.user, data: [providerSubmission] });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Reject provider" }));
  fireEvent.change(screen.getByLabelText("Rejection reason"), { target: { value: "Provider documents incomplete" } });
  fireEvent.change(screen.getByLabelText("Review note"), { target: { value: "Escalated by compliance" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm provider rejection" }));
  await waitFor(() => expect(apiMocks.rejectAdminKycProviderSubmission).toHaveBeenCalledWith(
    20,
    "secure-provider-code",
    "Provider documents incomplete",
    "Escalated by compliance",
    "admin-token",
  ));
});

it("shows provider permission errors", async () => {
  apiMocks.getAdminKycProviderSubmissions.mockResolvedValue({ user: profile.user, data: [providerSubmission] });
  apiMocks.rejectAdminKycProviderSubmission.mockRejectedValue(new Error("You do not have permission to review this provider."));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Reject provider" }));
  fireEvent.change(screen.getByLabelText("Rejection reason"), { target: { value: "Compliance decision" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm provider rejection" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to review this provider.");
});

it("shows AML screening loading", async () => {
  apiMocks.getAdminAmlScreenings.mockReturnValue(new Promise(() => undefined));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByText("Loading AML screenings...")).toBeInTheDocument();
});

it("shows the AML empty state", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByText("No AML screenings found.")).toBeInTheDocument();
});

it("displays safe AML match fields without sensitive screening data", async () => {
  apiMocks.getAdminAmlScreenings.mockResolvedValue({
    ...pageResponse,
    data: [{ ...amlScreening, raw_data: { token: "raw-screening-secret" } }],
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByText("sanctions")).toBeInTheDocument();
  expect(screen.getByText("open")).toBeInTheDocument();
  expect(screen.getByText("97.00")).toBeInTheDocument();
  expect(screen.getByText("AML Reviewer")).toBeInTheDocument();
  expect(screen.queryByText("Sensitive Subject Name")).not.toBeInTheDocument();
  expect(screen.queryByText("Sensitive Matched Name")).not.toBeInTheDocument();
  expect(screen.queryByText("sensitive-source")).not.toBeInTheDocument();
  expect(screen.queryByText("raw-screening-secret")).not.toBeInTheDocument();
  expect(screen.queryByText("1970-01-01")).not.toBeInTheDocument();
});

it("confirms an AML match after confirmation", async () => {
  apiMocks.getAdminAmlScreenings.mockResolvedValue({ ...pageResponse, data: [amlScreening] });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm match" }));
  fireEvent.change(screen.getByLabelText("Review note"), { target: { value: "True match confirmed" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm AML match" }));
  await waitFor(() => expect(apiMocks.confirmAdminAmlMatch).toHaveBeenCalledWith(
    51,
    "True match confirmed",
    "admin-token",
  ));
});

it("clears an AML screening after confirmation", async () => {
  apiMocks.getAdminAmlScreenings.mockResolvedValue({ ...pageResponse, data: [amlScreening] });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Clear AML" }));
  fireEvent.change(screen.getByLabelText("Review note"), { target: { value: "False positive" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm AML clear" }));
  await waitFor(() => expect(apiMocks.clearAdminAmlScreening).toHaveBeenCalledWith(51, "False positive", "admin-token"));
});

it("shows AML validation errors", async () => {
  apiMocks.getAdminAmlScreenings.mockResolvedValue({ ...pageResponse, data: [amlScreening] });
  apiMocks.confirmAdminAmlMatch.mockRejectedValue(new Error("AML screening cannot be confirmed."));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm match" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm AML match" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("AML screening cannot be confirmed.");
});

it("shows AML permission errors", async () => {
  apiMocks.getAdminAmlScreenings.mockResolvedValue({ ...pageResponse, data: [amlScreening] });
  apiMocks.clearAdminAmlScreening.mockRejectedValue(new Error("You do not have permission to clear AML."));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Clear AML" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm AML clear" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to clear AML.");
});
