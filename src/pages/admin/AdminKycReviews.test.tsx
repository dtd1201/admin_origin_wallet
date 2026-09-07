import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminKycReviews from "@/pages/admin/AdminKycReviews";
import type { AdminAmlScreening, AdminKycProfile, AdminKycProviderSubmission } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({
  requestApi: vi.fn(),
  getAdminKycProfile: vi.fn(),
  getAdminKycProviderSubmissions: vi.fn(),
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
  aml_screenings: [{
    id: 4,
    subject_name: "List Business Name",
    subject_role: "business",
    screening_provider: "internal",
    status: "completed",
    compliance_decision: "clear",
  }],
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
  failure_reason: "Provider validation pending",
  review_note: "Awaiting compliance review",
};

const amlScreening: AdminAmlScreening = {
  id: 51,
  user_id: 20,
  kyc_profile_id: 10,
  subject_name: "Sensitive Subject Name",
  subject_role: "business",
  screening_provider: "internal",
  status: "manual_review",
  compliance_decision: "pending_review",
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

it("allows HK Corporate Full approval with a submitted business registration despite generic required rows", async () => {
  const hkProfile = {
    ...detailProfile,
    metadata: {
      nium_region: "HK",
      nium_kyc_type: "full",
      nium_v5_fields: { isMultiLayeredCompany: false },
    },
    documents: [{ ...detailProfile.documents![0], type: "business_registration", status: "submitted" }],
    requirements: [
      "selfie_liveness",
      "identity_document_back",
      "account_opening_application_form",
      "ownership_structure",
      "certificate_of_incorporation",
    ].map((key, index) => ({
      id: index + 100,
      key,
      label: key,
      category: "document",
      status: "required",
      requirement_type: "document",
    })),
  };
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: hkProfile,
    kyc_submission: hkProfile,
  });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByRole("button", { name: "Approve" })).toBeEnabled();
  expect(screen.queryByText("Submit all required KYC requirements before approving this profile.")).not.toBeInTheDocument();
});

it("accepts a submitted certificate of incorporation for HK Corporate Full approval", async () => {
  const hkProfile = {
    ...detailProfile,
    metadata: { nium_region: "hk", nium_kyc_type: "FULL" },
    documents: [{ ...detailProfile.documents![0], type: "certificate_of_incorporation", status: "verified" }],
    requirements: [{
      id: 110,
      key: "business_registration",
      label: "Business registration",
      category: "document",
      status: "required",
      requirement_type: "document",
    }],
  };
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: hkProfile,
    kyc_submission: hkProfile,
  });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByRole("button", { name: "Approve" })).toBeEnabled();
});

it("blocks HK Corporate Full approval without a submitted registration document", async () => {
  const hkProfile = {
    ...detailProfile,
    metadata: { nium_region: "HK", nium_kyc_type: "full" },
    documents: [{ ...detailProfile.documents![0], type: "business_registration", status: "rejected" }],
    requirements: [],
  };
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: hkProfile,
    kyc_submission: hkProfile,
  });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByRole("button", { name: "Approve" })).toBeDisabled();
  expect(screen.getByText("Submit all required KYC requirements before approving this profile.")).toBeInTheDocument();
});

it.each([
  "authorized_representative",
  "authorized_representative_identity_document",
  "beneficial_owner",
  "beneficial_owner_identity_document",
])("blocks HK Corporate Full approval for required %s", async (key) => {
  const hkProfile = {
    ...detailProfile,
    metadata: { nium_region: "HK", nium_kyc_type: "full" },
    documents: [{ ...detailProfile.documents![0], type: "business_registration", status: "approved" }],
    requirements: [{
      id: 120,
      key,
      label: key,
      category: "related_person",
      status: "required",
      requirement_type: "document",
    }],
  };
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: hkProfile,
    kyc_submission: hkProfile,
  });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByRole("button", { name: "Approve" })).toBeDisabled();
});

it("blocks ownership structure only for multilayered HK Corporate Full companies", async () => {
  const hkProfile = {
    ...detailProfile,
    metadata: {
      nium_region: "HK",
      nium_kyc_type: "full",
      nium_v5_fields: { isMultiLayeredCompany: true },
    },
    documents: [{ ...detailProfile.documents![0], type: "business_registration", status: "submitted" }],
    requirements: [{
      id: 130,
      key: "ownership_structure",
      label: "Ownership structure",
      category: "document",
      status: "required",
      requirement_type: "document",
    }],
  };
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: hkProfile,
    kyc_submission: hkProfile,
  });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByRole("button", { name: "Approve" })).toBeDisabled();
});

it("keeps generic required rows blocking non-HK approval", async () => {
  const nonHkProfile = {
    ...detailProfile,
    metadata: { nium_region: "SG", nium_kyc_type: "full" },
    requirements: [{
      id: 140,
      key: "selfie_liveness",
      label: "Selfie liveness",
      category: "document",
      status: "required",
      requirement_type: "document",
    }],
  };
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: nonHkProfile,
    kyc_submission: nonHkProfile,
  });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByRole("button", { name: "Approve" })).toBeDisabled();
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
  expect(await screen.findByText("Loading Nium submission status...")).toBeInTheDocument();
});

it("shows the provider submission empty state", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByText("No Nium submission has been prepared yet.")).toBeInTheDocument();
});

it("displays Nium submission tracking without metadata or raw identifiers", async () => {
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
  expect(screen.queryByText("secure-provider-code")).not.toBeInTheDocument();
  expect(screen.queryByText("provider-secret-token")).not.toBeInTheDocument();
  expect(screen.queryByText("raw-external-id")).not.toBeInTheDocument();
});

it("submits approval once with only the review note and refreshes Nium state", async () => {
  let resolveApproval!: (value: unknown) => void;
  const approvalResponse = new Promise((resolve) => {
    resolveApproval = resolve;
  });
  apiMocks.requestApi
    .mockResolvedValueOnce(pageResponse)
    .mockImplementationOnce(() => approvalResponse)
    .mockResolvedValue(pageResponse);
  apiMocks.getAdminKycProviderSubmissions
    .mockResolvedValueOnce({ user: profile.user, data: [] })
    .mockResolvedValue({ user: profile.user, data: [providerSubmission] });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.change(await screen.findByLabelText("Approval review note"), { target: { value: "  Approved after review.  " } });

  const approveButton = await screen.findByRole("button", { name: "Approve" });
  fireEvent.click(approveButton);
  fireEvent.click(approveButton);

  await waitFor(() => expect(approveButton).toBeDisabled());
  expect(apiMocks.requestApi).toHaveBeenCalledTimes(2);
  expect(apiMocks.requestApi).toHaveBeenNthCalledWith(2, "/admin/users/20/kyc-profile/approve", {
    method: "POST",
    token: "admin-token",
    body: { review_note: "Approved after review." },
  });

  resolveApproval({
    message: "KYC profile approved and Nium onboarding submitted.",
    user: { ...profile.user, kyc_status: "verified" },
    kyc_profile: { ...detailProfile, status: "verified" },
  });

  expect(await screen.findByText("Secure Provider")).toBeInTheDocument();
  expect(screen.getAllByText("submitted").length).toBeGreaterThan(0);
  await waitFor(() => expect(apiMocks.getAdminKycProviderSubmissions).toHaveBeenCalledTimes(2));
});

it("shows a safe approval failure diagnostic", async () => {
  apiMocks.requestApi
    .mockResolvedValueOnce(pageResponse)
    .mockRejectedValueOnce(new Error("KYC was approved, but Nium onboarding could not be completed. The submission can be retried safely."));

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

  expect((await screen.findAllByText(
    "KYC was approved, but Nium onboarding could not be completed. The submission can be retried safely.",
  )).length).toBeGreaterThan(0);
  expect(screen.queryByText(/nium_kyc_type|customerHashId|bankAccountDetails/i)).not.toBeInTheDocument();

  const approveButton = screen.getByRole("button", { name: "Approve" });
  await waitFor(() => expect(approveButton).toBeEnabled());
  fireEvent.click(approveButton);
  await waitFor(() => expect(
    apiMocks.requestApi.mock.calls.filter(([path]) => path === "/admin/users/20/kyc-profile/approve"),
  ).toHaveLength(2));
});

it("shows the staging AML provider unavailable bypass message after approval", async () => {
  apiMocks.requestApi
    .mockResolvedValueOnce(pageResponse)
    .mockResolvedValueOnce({
      message: "AML provider unavailable. Staging bypass applied.",
      aml_bypass_reason: "staging_aml_provider_unavailable_bypass",
      user: { ...profile.user, kyc_status: "verified" },
      kyc_profile: { ...detailProfile, status: "verified" },
    });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

  expect((await screen.findAllByText("AML provider unavailable. Staging bypass applied.")).length).toBeGreaterThan(0);
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

it("shows auto-cleared AML without manual action buttons", async () => {
  apiMocks.getAdminAmlScreenings.mockResolvedValue({ ...pageResponse, data: [profile.aml_screenings![0]] });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByText("AML cleared automatically")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Clear AML" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Confirm AML Match" })).not.toBeInTheDocument();
});

it("hides superseded AML and does not let it block approval", async () => {
  const supersededScreening: AdminAmlScreening = {
    ...amlScreening,
    id: 50,
    subject_name: "Historical Pending Subject",
    status: "pending",
    compliance_decision: "pending_review",
    superseded_at: "2026-08-24T12:00:00Z",
  };
  const activeScreening: AdminAmlScreening = {
    ...profile.aml_screenings![0],
    superseded_at: null,
  };
  const profileWithHistory = {
    ...detailProfile,
    aml_screenings: [supersededScreening, activeScreening],
  };
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: profileWithHistory,
    kyc_submission: profileWithHistory,
  });
  apiMocks.getAdminAmlScreenings.mockResolvedValue({
    ...pageResponse,
    data: [supersededScreening, activeScreening],
  });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByText("AML cleared automatically")).toBeInTheDocument();
  expect(screen.queryByText("Historical Pending Subject")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
});

it("allows approval for the exact AML provider unavailable bypass without displaying AML details", async () => {
  const unavailableScreening: AdminAmlScreening = {
    ...amlScreening,
    screening_provider: "unconfigured",
    provider: "unconfigured",
    status: "failed",
    compliance_decision: "pending_review",
    result_summary: { error: "provider_failure" },
    matches: [],
  };
  const bypassProfile = { ...detailProfile, aml_screenings: [unavailableScreening] };
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: bypassProfile,
    kyc_submission: bypassProfile,
  });
  apiMocks.getAdminAmlScreenings.mockResolvedValue({ ...pageResponse, data: [unavailableScreening] });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByRole("button", { name: "Approve" })).toBeEnabled();
  expect(screen.queryByText("AML screenings")).not.toBeInTheDocument();
  expect(screen.queryByText("unconfigured")).not.toBeInTheDocument();
  expect(screen.queryByText("No AML matches found.")).not.toBeInTheDocument();
  expect(screen.queryByText("Clear or manually clear all active AML screenings before approving this profile.")).not.toBeInTheDocument();
});

it("keeps approval blocked when an unavailable-provider AML record has a different error", async () => {
  const failedScreening: AdminAmlScreening = {
    ...amlScreening,
    provider: "unconfigured",
    status: "failed",
    compliance_decision: "pending_review",
    result_summary: { error: "screening_match" },
  };
  const blockedProfile = { ...detailProfile, aml_screenings: [failedScreening] };
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: blockedProfile,
    kyc_submission: blockedProfile,
  });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByRole("button", { name: "Approve" })).toBeDisabled();
  expect(screen.getByText("Clear or manually clear all active AML screenings before approving this profile.")).toBeInTheDocument();
});

it("shows pending AML without manual action buttons", async () => {
  apiMocks.getAdminAmlScreenings.mockResolvedValue({
    ...pageResponse,
    data: [{ ...amlScreening, status: "pending", compliance_decision: "pending_review" }],
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect((await screen.findAllByText("pending")).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "Clear AML" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Confirm AML Match" })).not.toBeInTheDocument();
});

it("shows both manual actions for AML pending manual review", async () => {
  apiMocks.getAdminAmlScreenings.mockResolvedValue({ ...pageResponse, data: [amlScreening] });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  expect(await screen.findByRole("button", { name: "Clear AML" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm AML Match" })).toBeInTheDocument();
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
  fireEvent.click(await screen.findByRole("button", { name: "Confirm AML Match" }));
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
  fireEvent.click(await screen.findByRole("button", { name: "Confirm AML Match" }));
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
