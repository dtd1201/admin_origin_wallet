import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminKycReviews from "@/pages/admin/AdminKycReviews";
import type { AdminAmlScreening, AdminKycCorrection, AdminKycProfile, AdminKycProviderSubmission } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({
  requestApi: vi.fn(),
  requestApiBlob: vi.fn(),
  getAdminKycProfile: vi.fn(),
  getAdminKycProviderSubmissions: vi.fn(),
  getAdminAmlScreenings: vi.fn(),
  clearAdminAmlScreening: vi.fn(),
  confirmAdminAmlMatch: vi.fn(),
  getAdminKycCorrections: vi.fn(),
  reviewAdminKycCorrection: vi.fn(),
  syncAdminKycCorrection: vi.fn(),
  resolveAdminKycCorrectionFailure: vi.fn(),
  requestAdminKycCorrection: vi.fn(),
  requestAdminCorrectionProofOfAddress: vi.fn(),
  requestChangesAdminCorrectionProofOfAddress: vi.fn(),
  uploadAdminCorrectionProofOfAddress: vi.fn(),
  approveAdminCorrectionProofOfAddress: vi.fn(),
  getAdminManualKycResubmissionAuthorization: vi.fn(),
  authorizeAdminManualKycResubmission: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  adminEndpointConfig: { kycProfiles: "/admin/kyc-profiles" },
  buildApiUrl: (path: string) => `https://api.example.test${path}`,
  requestApi: apiMocks.requestApi,
  requestApiBlob: apiMocks.requestApiBlob,
  getAdminKycProfile: apiMocks.getAdminKycProfile,
  getAdminKycProviderSubmissions: apiMocks.getAdminKycProviderSubmissions,
  getAdminAmlScreenings: apiMocks.getAdminAmlScreenings,
  clearAdminAmlScreening: apiMocks.clearAdminAmlScreening,
  confirmAdminAmlMatch: apiMocks.confirmAdminAmlMatch,
  getAdminKycCorrections: apiMocks.getAdminKycCorrections,
  reviewAdminKycCorrection: apiMocks.reviewAdminKycCorrection,
  syncAdminKycCorrection: apiMocks.syncAdminKycCorrection,
  resolveAdminKycCorrectionFailure: apiMocks.resolveAdminKycCorrectionFailure,
  requestAdminKycCorrection: apiMocks.requestAdminKycCorrection,
  requestAdminCorrectionProofOfAddress: apiMocks.requestAdminCorrectionProofOfAddress,
  requestChangesAdminCorrectionProofOfAddress: apiMocks.requestChangesAdminCorrectionProofOfAddress,
  uploadAdminCorrectionProofOfAddress: apiMocks.uploadAdminCorrectionProofOfAddress,
  approveAdminCorrectionProofOfAddress: apiMocks.approveAdminCorrectionProofOfAddress,
  getAdminManualKycResubmissionAuthorization: apiMocks.getAdminManualKycResubmissionAuthorization,
  authorizeAdminManualKycResubmission: apiMocks.authorizeAdminManualKycResubmission,
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

const correction: AdminKycCorrection = {
  id: 71,
  kyc_profile_id: 10,
  applicant_related_person_id: 72,
  correction_version: 1,
  source_fingerprint: "a".repeat(64),
  status: "submitted",
  before_values: { legal_name: "NGUYEN THANH PHUONG", first_name: "THANH PHUONG", last_name: "NGUYEN", date_of_birth: "1990-01-01" },
  proposed_values: { legal_name: "NGUYEN VAN THANH PHUONG", first_name: "THANH PHUONG", last_name: "NGUYEN VAN", date_of_birth: "1991-02-03" },
  customer_hash_fingerprint: "b".repeat(64),
  applicant_reference_fingerprint: "c".repeat(64),
  submitted_at: "2026-10-12T10:00:00Z",
  review_capability: { can_approve: true, reason: null },
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

const renderPage = (initialEntry = "/admin/kyc-reviews") => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}><AdminKycReviews /></QueryClientProvider>
    </MemoryRouter>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.requestApi.mockResolvedValue(pageResponse);
  apiMocks.requestApiBlob.mockResolvedValue(new Blob(["passport"], { type: "application/pdf" }));
  apiMocks.getAdminKycProfile.mockResolvedValue({ user: profile.user, kyc_profile: detailProfile, kyc_submission: detailProfile, biometric_kyc: null });
  apiMocks.getAdminKycProviderSubmissions.mockResolvedValue({ user: profile.user, data: [] });
  apiMocks.getAdminAmlScreenings.mockResolvedValue({ ...pageResponse, data: [] });
  apiMocks.clearAdminAmlScreening.mockResolvedValue({ message: "Cleared", aml_screening: { ...amlScreening, status: "manual_clear" } });
  apiMocks.confirmAdminAmlMatch.mockResolvedValue({ message: "Confirmed", aml_screening: { ...amlScreening, status: "confirmed_match" } });
  apiMocks.getAdminKycCorrections.mockResolvedValue({ data: [], permissions: { approve: true, request_changes: true, sync: true } });
  apiMocks.reviewAdminKycCorrection.mockResolvedValue({ message: "Correction reviewed", correction: { ...correction, status: "approved" }, idempotent: false });
  apiMocks.syncAdminKycCorrection.mockResolvedValue({ message: "Correction synced", correction: { ...correction, status: "synced" } });
  apiMocks.resolveAdminKycCorrectionFailure.mockResolvedValue({ message: "Failure closed", correction: { ...correction, status: "needs_more_info" } });
  apiMocks.requestAdminKycCorrection.mockResolvedValue({ message: "Requested", correction: { ...correction, status: "requested" }, idempotent: false });
  apiMocks.getAdminManualKycResubmissionAuthorization.mockResolvedValue({ authorization: null });
  apiMocks.uploadAdminCorrectionProofOfAddress.mockResolvedValue({ message: "Uploaded", document: { id: 91, type: "proof_of_address", status: "pending_admin_review", file_url: "/document", has_nium_file_id: false } });
  apiMocks.approveAdminCorrectionProofOfAddress.mockResolvedValue({ message: "Approved", document: { id: 91, type: "proof_of_address", status: "approved", file_url: "/document", has_nium_file_id: false } });
  apiMocks.requestAdminCorrectionProofOfAddress.mockResolvedValue({ message: "Requested", correction });
  apiMocks.requestChangesAdminCorrectionProofOfAddress.mockResolvedValue({ message: "Changes requested", document: { id: 91, type: "proof_of_address", status: "changes_requested", file_url: "/document", has_nium_file_id: false } });
  apiMocks.authorizeAdminManualKycResubmission.mockResolvedValue({ authorization: { id: 1, state: "pending", correction_id: 71, correction_version: 1, prior_attempt: { state: "rejected", http_status: 400, api_request_log_id: 184 } } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("opens the requested customer review from a valid user_id deep link", async () => {
  renderPage("/admin/kyc-reviews?user_id=20");

  const reviewDialog = await screen.findByRole("dialog", { name: "KYC/KYB review" });
  expect(await within(reviewDialog).findAllByText("Detail Business Name")).toHaveLength(2);
  expect(apiMocks.getAdminKycProfile).toHaveBeenCalledWith(20, "admin-token");
});

it.each([
  "/admin/kyc-reviews",
  "/admin/kyc-reviews?user_id=0",
  "/admin/kyc-reviews?user_id=-1",
  "/admin/kyc-reviews?user_id=12x",
])("does not open a review for a missing or invalid deep link: %s", async (initialEntry) => {
  renderPage(initialEntry);

  await screen.findAllByText("List Business Name");
  expect(apiMocks.getAdminKycProfile).not.toHaveBeenCalled();
  expect(screen.queryByText("KYC/KYB review")).not.toBeInTheDocument();
});

it("keeps manual customer review selection functional", async () => {
  renderPage();

  fireEvent.click((await screen.findAllByRole("button", { name: /^Review$/ }))[0]);

  const reviewDialog = await screen.findByRole("dialog", { name: "KYC/KYB review" });
  expect(await within(reviewDialog).findAllByText("Detail Business Name")).toHaveLength(2);
  expect(apiMocks.getAdminKycProfile).toHaveBeenCalledWith(20, "admin-token");
});

it("shows the existing safe error state for an unauthorized or nonexistent deep link", async () => {
  apiMocks.getAdminKycProfile.mockRejectedValueOnce(new Error("KYC profile not found or access denied."));

  renderPage("/admin/kyc-reviews?user_id=999");

  expect(await screen.findByRole("alert")).toHaveTextContent("KYC profile not found or access denied.");
  expect(apiMocks.getAdminKycProfile).toHaveBeenCalledWith(999, "admin-token");
});

it("creates a scoped applicant field and passport update request", async () => {
  apiMocks.getAdminKycCorrections.mockResolvedValue({ data: [], permissions: { approve: true, request_changes: true, sync: true } });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Request KYC Update" }));
  fireEvent.click(screen.getByLabelText("First Name (Given Names)"));
  fireEvent.click(screen.getByLabelText("Passport document (required)"));
  fireEvent.change(screen.getByLabelText("Instructions to customer"), { target: { value: "Correct the given names and upload passport." } });
  fireEvent.click(screen.getByRole("button", { name: "Send KYC update request" }));

  await waitFor(() => expect(apiMocks.requestAdminKycCorrection).toHaveBeenCalledWith({
    userId: 20, fields: ["first_name"], documentTypes: ["passport"],
    instruction: "Correct the given names and upload passport.", token: "admin-token",
}));
});

it("creates a passport-only update request", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Request KYC Update" }));
  fireEvent.click(screen.getByLabelText("Passport document (required)"));
  fireEvent.change(screen.getByLabelText("Instructions to customer"), { target: { value: "Upload a readable passport." } });
  fireEvent.click(screen.getByRole("button", { name: "Send KYC update request" }));

  await waitFor(() => expect(apiMocks.requestAdminKycCorrection).toHaveBeenCalledWith({
    userId: 20, fields: [], documentTypes: ["passport"],
    instruction: "Upload a readable passport.", token: "admin-token",
  }));
});

it("shows correction before and after values and approves the exact version", async () => {
  apiMocks.getAdminKycCorrections.mockResolvedValue({ data: [correction], permissions: { approve: true, request_changes: true, sync: true } });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByText("Applicant correction review")).toBeVisible();
  expect(screen.getByText("NGUYEN THANH PHUONG")).toBeVisible();
  expect(screen.getByText("NGUYEN VAN THANH PHUONG")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Approve correction" }));

  await waitFor(() => expect(apiMocks.reviewAdminKycCorrection).toHaveBeenCalledWith({
    userId: 20,
    correctionId: 71,
    action: "approve",
    correctionVersion: 1,
    sourceFingerprint: "a".repeat(64),
    token: "admin-token",
    reason: undefined,
  }));
});

it("opens a correction document through authenticated Blob preview without a protected URL link", async () => {
  const createObjectUrl = vi.fn(() => "blob:https://admin.example.test/passport-preview");
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  apiMocks.getAdminKycCorrections.mockResolvedValue({
    data: [{
      ...correction,
      proposed_documents: [{
        type: "passport",
        file_url: "/api/kyc-documents/20/correction-passport-token",
        original_name: "passport.pdf",
        mime_type: "application/pdf",
        document_number: "P1234567",
        issuing_country_code: "HK",
        expires_at: "2099-12-31",
      }],
    }],
    permissions: { approve: true, request_changes: true, sync: true },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(screen.queryByRole("link", { name: "Review document" })).not.toBeInTheDocument();
  const reviewDocument = await screen.findByRole("button", { name: "Review document" });
  expect(reviewDocument.parentElement).toHaveTextContent("Passport number: ****4567");
  expect(reviewDocument.parentElement).toHaveTextContent("Issuing country: HK");
  expect(reviewDocument.parentElement).toHaveTextContent("Expiry date: 2099-12-31");
  fireEvent.click(reviewDocument);

  await waitFor(() => expect(apiMocks.requestApiBlob).toHaveBeenCalledWith(
    "/api/kyc-documents/20/correction-passport-token",
    { token: "admin-token", accept: "application/pdf" },
  ));
  expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
  expect(open).toHaveBeenCalledWith("blob:https://admin.example.test/passport-preview", "_blank", "noopener,noreferrer");
});

it("shows correction document fetch failures without opening a blank tab", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  apiMocks.requestApiBlob.mockRejectedValue(new Error("Forbidden"));
  apiMocks.getAdminKycCorrections.mockResolvedValue({
    data: [{
      ...correction,
      proposed_documents: [{ type: "passport", file_url: "/api/kyc-documents/20/missing", original_name: "passport.png", mime_type: "image/png" }],
    }],
    permissions: { approve: true, request_changes: true, sync: true },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Review document" }));

  const correctionReview = screen.getByRole("heading", { name: "Applicant correction review" }).parentElement;
  expect(correctionReview).not.toBeNull();
  expect(await within(correctionReview as HTMLElement).findByRole("alert")).toHaveTextContent("Forbidden");
  expect(open).not.toHaveBeenCalled();
});

it("shows approved Manual KYC evidence as ready to submit, not waiting for Nium", async () => {
  apiMocks.getAdminKycCorrections.mockResolvedValue({
    data: [{ ...correction, status: "manual_kyc_evidence_approved" }],
    permissions: { approve: true, request_changes: true, sync: true },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByText(/evidence approved for provider-directed manual kyc/i)).toBeVisible();
  expect(screen.queryByText(/waiting for nium compliance review/i)).not.toBeInTheDocument();
});

it("uploads Proof of Address for review without authorizing or submitting KYC", async () => {
  apiMocks.getAdminKycCorrections.mockResolvedValue({
    data: [{ ...correction, status: "manual_kyc_evidence_approved", proof_of_address_documents: [] }],
    permissions: { approve: true, request_changes: true, sync: true },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  const file = new File(["address"], "address.pdf", { type: "application/pdf" });
  fireEvent.change(await screen.findByLabelText(/PDF, JPG or PNG/i), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText(/Verified residence country/i), { target: { value: "VN" } });
  fireEvent.click(screen.getByRole("button", { name: "Upload for review" }));

  await waitFor(() => expect(apiMocks.uploadAdminCorrectionProofOfAddress).toHaveBeenCalledWith(expect.objectContaining({
    userId: 20, correctionId: 71, file, address: expect.objectContaining({ country_code: "VN" }),
  })));
  expect(apiMocks.authorizeAdminManualKycResubmission).not.toHaveBeenCalled();
  expect(apiMocks.requestApi.mock.calls.some(([path]) => path === "/admin/users/20/kyc-profile/submit-kyc")).toBe(false);
});

it("shows pending Proof of Address approval and resubmission authorization as separate actions", async () => {
  apiMocks.getAdminKycCorrections.mockResolvedValue({
    data: [{
      ...correction,
      status: "manual_kyc_evidence_approved",
      proof_of_address_documents: [{ id: 91, type: "proof_of_address", status: "pending_admin_review", file_url: "/document", original_name: "address.pdf", has_nium_file_id: false }],
    }],
    permissions: { approve: true, request_changes: true, sync: true },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Approve Proof of Address" }));
  await waitFor(() => expect(apiMocks.approveAdminCorrectionProofOfAddress).toHaveBeenCalledWith(expect.objectContaining({ documentId: 91 })));
  expect(apiMocks.authorizeAdminManualKycResubmission).not.toHaveBeenCalled();
});

it("shows waiting for Nium Compliance only after an accepted Manual KYC submission", async () => {
  apiMocks.getAdminKycCorrections.mockResolvedValue({
    data: [{ ...correction, status: "manual_kyc_compliance_review" }],
    permissions: { approve: true, request_changes: true, sync: true },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByText(/waiting for nium compliance review/i)).toBeVisible();
  expect(screen.getByText(/customer identity fields have not been updated/i)).toBeVisible();
});

it("requires a reason when requesting correction changes", async () => {
  apiMocks.getAdminKycCorrections.mockResolvedValue({ data: [correction], permissions: { approve: true, request_changes: true, sync: true } });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Request correction changes" }));

  const send = screen.getByRole("button", { name: "Send request" });
  expect(send).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Reason sent to customer"), { target: { value: "Surname does not match passport" } });
  fireEvent.click(send);

  await waitFor(() => expect(apiMocks.reviewAdminKycCorrection).toHaveBeenCalledWith(expect.objectContaining({
    action: "request-changes",
    reason: "Surname does not match passport",
  })));
});

it("does not render correction actions without backend permissions or after review", async () => {
  apiMocks.getAdminKycCorrections.mockResolvedValue({
    data: [{ ...correction, status: "approved" }],
    permissions: { approve: false, request_changes: false, sync: false },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByText("Approved")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Approve correction" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Request correction changes" })).not.toBeInTheDocument();
});

it("shows the backend approval block reason instead of an approve action", async () => {
  apiMocks.getAdminKycCorrections.mockResolvedValue({
    data: [{ ...correction, review_capability: { can_approve: false, reason: "Nium Customer Update is disabled." } }],
    permissions: { approve: true, request_changes: true, sync: true },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByText(/approval unavailable: nium customer update is disabled/i)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Approve correction" })).not.toBeInTheDocument();
});

it("filters correction synchronization and reconciliation statuses through the backend", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("combobox", { name: "Correction status filter" }));
  fireEvent.click(await screen.findByRole("option", { name: "Unknown outcome" }));

  await waitFor(() => expect(apiMocks.getAdminKycCorrections).toHaveBeenLastCalledWith(20, "admin-token", "unknown"));
});

it("only exposes backend-authorized sync and shows safe verification results", async () => {
  const approved = {
    ...correction,
    status: "approved",
    sync: {
      can_sync: true,
      reason: null,
      status: null,
      request_fingerprint: "d".repeat(64),
      verification: null,
      can_reconcile: false,
      can_resolve_failure: false,
    },
  };
  apiMocks.getAdminKycCorrections.mockResolvedValue({
    data: [approved],
    permissions: { approve: true, request_changes: true, sync: true },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Sync approved correction" }));

  await waitFor(() => expect(apiMocks.syncAdminKycCorrection).toHaveBeenCalledWith({
    userId: 20,
    correctionId: 71,
    action: "sync",
    token: "admin-token",
  }));
  expect(screen.queryByText(/biometric/i)).not.toBeInTheDocument();
});

it("closes only a backend-authorized deterministic failure with exact attempt evidence", async () => {
  const failed = {
    ...correction,
    status: "sync_failed",
    sync: {
      can_sync: false,
      reason: "Provider rejected the update.",
      status: "sync_failed",
      request_id: "a65ec8ad-cd61-4bf4-aea0-6bf93172e75d",
      request_fingerprint: "d".repeat(64),
      http_status: 422,
      failure_code: "provider_rejected",
      verification: null,
      can_reconcile: false,
      can_resolve_failure: true,
    },
  };
  apiMocks.getAdminKycCorrections.mockResolvedValue({
    data: [failed],
    permissions: { approve: true, request_changes: true, sync: true },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Close deterministic failure" }));
  fireEvent.change(screen.getByLabelText("Reason sent to customer"), { target: { value: "Correct the passport surname." } });
  fireEvent.click(screen.getByRole("button", { name: "Return for new correction" }));

  await waitFor(() => expect(apiMocks.resolveAdminKycCorrectionFailure).toHaveBeenCalledWith({
    userId: 20,
    correctionId: 71,
    requestId: "a65ec8ad-cd61-4bf4-aea0-6bf93172e75d",
    requestFingerprint: "d".repeat(64),
    reason: "Correct the passport surname.",
    token: "admin-token",
  }));
});

it("does not offer deterministic recovery for an unknown outcome", async () => {
  apiMocks.getAdminKycCorrections.mockResolvedValue({
    data: [{
      ...correction,
      status: "unknown",
      sync: {
        can_sync: false,
        reason: "Outcome requires reconciliation.",
        status: "unknown",
        request_id: "a65ec8ad-cd61-4bf4-aea0-6bf93172e75d",
        request_fingerprint: "d".repeat(64),
        verification: null,
        can_reconcile: true,
        can_resolve_failure: false,
      },
    }],
    permissions: { approve: true, request_changes: true, sync: true },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByRole("button", { name: "Reconcile with Nium GET" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Close deterministic failure" })).not.toBeInTheDocument();
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

it("shows the current biometric KYC status and action from the authorized detail response", async () => {
  const url = "https://idv.nium.com/prod/jumio/start?referenceNumber=current";
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: detailProfile,
    kyc_submission: detailProfile,
    biometric_kyc: { status: "retry", mode: "biometric_kyc", url, reference_id: "reference-current" },
  });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByText("Biometric KYC")).toBeVisible();
  expect(screen.getByText("Retry")).toBeVisible();
  expect(screen.getByRole("link", { name: "Open Biometric KYC" })).toHaveAttribute("href", url);
});

it("does not show a biometric KYC action when the detail response has no current URL", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  await screen.findAllByText("Detail Business Name");
  expect(screen.queryByRole("link", { name: "Open Biometric KYC" })).not.toBeInTheDocument();
});

it("displays company directors separately from related persons", async () => {
  const profileWithDirector: AdminKycProfile = {
    ...detailProfile,
    related_persons: [],
    company_directors: [{
      id: 71,
      legal_name: "Director Example",
      position: "Director",
      date_of_birth: "1985-04-12",
      nationality_country_code: "HK",
      residence_country_code: "SG",
      country_code: "HK",
      address_line1: "18 Director Road",
      city: "Hong Kong",
      status: "submitted",
      documents: [{
        id: 72,
        type: "passport_front",
        status: "submitted",
        file_url: "/api/kyc-company-director-documents/72",
        original_name: "director-passport.pdf",
      }],
    }],
  };
  apiMocks.getAdminKycProfile.mockResolvedValue({
    user: profile.user,
    kyc_profile: profileWithDirector,
    kyc_submission: profileWithDirector,
  });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));

  expect(await screen.findByText("Company directors")).toBeVisible();
  expect(screen.getByText("Director Example")).toBeVisible();
  expect(screen.getByText("director-passport.pdf")).toBeVisible();
  expect(screen.getByText("No related persons submitted.")).toBeVisible();
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

it("confirms manual Submit KYC and displays the real Nium biometric URL", async () => {
  const biometricUrl = "https://verify.example.test/real-nium-session";
  apiMocks.requestApi
    .mockResolvedValueOnce(pageResponse)
    .mockResolvedValueOnce({
      message: "Nium Submit KYC completed.",
      state: "accepted",
      kyc_status: "initiated",
      kyc_mode: "biometric_kyc",
      reference_id: "nium-reference-123",
      biometric_url: biometricUrl,
    });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Submit KYC" }));

  expect(screen.getByText("Submit KYC to Nium?")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confirm Submit KYC" }));

  await waitFor(() => expect(apiMocks.requestApi).toHaveBeenNthCalledWith(
    2,
    "/admin/users/20/kyc-profile/submit-kyc",
    {
      method: "POST",
      token: "admin-token",
      headers: { "Idempotency-Key": expect.any(String) },
    },
  ));
  expect(await screen.findByText("nium-reference-123")).toBeInTheDocument();
  expect(screen.getByText("initiated")).toBeInTheDocument();
  expect(screen.queryByText(biometricUrl)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Continue KYC" })).toHaveAttribute("href", biometricUrl);
});

it("submits manual KYC only once on a rapid confirmation double-click", async () => {
  let resolveSubmit!: (value: unknown) => void;
  const submitResponse = new Promise((resolve) => {
    resolveSubmit = resolve;
  });
  apiMocks.requestApi
    .mockResolvedValueOnce(pageResponse)
    .mockImplementationOnce(() => submitResponse);

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Submit KYC" }));

  const confirmButton = screen.getByRole("button", { name: "Confirm Submit KYC" });
  fireEvent.click(confirmButton);
  fireEvent.click(confirmButton);

  await waitFor(() => expect(
    apiMocks.requestApi.mock.calls.filter(([path]) => path === "/admin/users/20/kyc-profile/submit-kyc"),
  ).toHaveLength(1));

  resolveSubmit({
    message: "Nium Submit KYC completed.",
    state: "accepted",
    kyc_status: "initiated",
    kyc_mode: "biometric_kyc",
    reference_id: "nium-reference-once",
    biometric_url: null,
  });

  expect(await screen.findByText("nium-reference-once")).toBeInTheDocument();
});

it("states clearly when Nium returns no biometric URL", async () => {
  apiMocks.requestApi
    .mockResolvedValueOnce(pageResponse)
    .mockResolvedValueOnce({
      message: "Nium Submit KYC completed.",
      state: "accepted",
      kyc_status: "initiated",
      kyc_mode: "biometric_kyc",
      reference_id: "nium-reference-without-url",
      biometric_url: null,
    });

  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Submit KYC" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm Submit KYC" }));

  expect(await screen.findByText("Nium did not return a biometric KYC URL.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Open KYC" })).not.toBeInTheDocument();
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
