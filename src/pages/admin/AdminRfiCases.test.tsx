import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminRfiCases from "@/pages/admin/AdminRfiCases";
import type { AdminRfiCase } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({
  getAdminRfiCases: vi.fn(), getAdminRfiCase: vi.fn(), saveAdminRfiDraft: vi.fn(), approveAdminRfiCase: vi.fn(),
  submitAdminRfiCase: vi.fn(), refreshAdminRfiStatus: vi.fn(), sendAdminRfiToUser: vi.fn(), requestAdminRfiRevision: vi.fn(),
  approveAdminRfiUserSubmission: vi.fn(), requestApiBlob: vi.fn(),
}));
const auth = vi.hoisted(() => ({ token: "admin-token" as string | null }));
vi.mock("@/lib/api", () => apiMocks);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: auth.token }) }));

const makeCase = (id: number, overrides: Partial<AdminRfiCase> = {}): AdminRfiCase => ({
  id, scope: "customer", origin: "authoritative_fetch", status: "requested", contract_gate: "provider_contract_unconfirmed",
  submission_state: "new", created_at: "2026-08-24T09:00:00Z", updated_at: "2026-08-24T10:00:00Z",
  last_activity_at: "2026-08-24T09:30:00Z", customer_submitted_at: null, admin_approved_at: null,
  provider_responded_at: null, last_synced_at: "2026-08-24T10:00:00Z", ...overrides,
});
const cases = [
  makeCase(11, { customer_id: 101, business_name: "GREENTECH GLOBAL TRADING COMPANY LIMITED", template_name: "businessRegistrationDocument", provider_remarks: "Provide the Business Registration Document and Certificate of Incorporation." }),
  makeCase(12, { customer_id: 101, business_name: "GREENTECH GLOBAL TRADING COMPANY LIMITED", submission_state: "sent_to_user", template_name: "otherDocument", provider_remarks: "Provide Personal Source of Wealth evidence." }),
  makeCase(13, { customer_id: 101, business_name: "GREENTECH GLOBAL TRADING COMPANY LIMITED", submission_state: "user_submitted", template_name: "otherDocument", provider_remarks: "Provide Personal Source of Funds evidence." }),
  makeCase(14, { customer_id: 101, business_name: "GREENTECH GLOBAL TRADING COMPANY LIMITED", submission_state: "approved", template_name: "otherDocument", provider_remarks: "Provide Company Source of Funds and Source of Wealth evidence." }),
  makeCase(99, { origin: "webhook", submission_state: "not_claimed", template_name: "Legacy webhook notice" }),
];
const pageResponse = (data: AdminRfiCase[] = cases, lastPage = 1) => ({ current_page: 1, data, first_page_url: null, from: data.length ? 1 : null, last_page: lastPage, last_page_url: null, links: [], next_page_url: lastPage > 1 ? "page=2" : null, path: "/api/admin/nium-rfi-cases", per_page: 15, prev_page_url: null, to: data.length, total: data.length });
const renderPage = () => { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}><AdminRfiCases /></QueryClientProvider>); };
const openOnlyCaseDetail = async (caseId: number) => {
  fireEvent.click(await screen.findByRole("button", { name: "View RFI details" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText(`#${caseId}`, { selector: "dd" });
  return dialog;
};

beforeEach(() => {
  vi.clearAllMocks(); auth.token = "admin-token";
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse());
  apiMocks.getAdminRfiCase.mockImplementation((id: number) => Promise.resolve(cases.find((item) => item.id === id)));
  apiMocks.saveAdminRfiDraft.mockImplementation((id: number) => Promise.resolve(makeCase(id, { submission_state: "draft" })));
  apiMocks.approveAdminRfiCase.mockImplementation((id: number) => Promise.resolve(makeCase(id, { submission_state: "approved" })));
  apiMocks.submitAdminRfiCase.mockImplementation((item: AdminRfiCase) => Promise.resolve(makeCase(item.id, { submission_state: "responded" })));
  apiMocks.refreshAdminRfiStatus.mockImplementation((item: AdminRfiCase) => Promise.resolve(makeCase(item.id, { submission_state: "responded", provider_status: "RFI_RESPONDED" })));
  apiMocks.sendAdminRfiToUser.mockImplementation((id: number) => Promise.resolve(makeCase(id, { submission_state: "sent_to_user" })));
  apiMocks.requestAdminRfiRevision.mockImplementation((id: number) => Promise.resolve(makeCase(id, { submission_state: "revision_requested" })));
  apiMocks.approveAdminRfiUserSubmission.mockImplementation((id: number) => Promise.resolve(makeCase(id, { submission_state: "admin_approved" })));
});

it("renders four authoritative RFIs by reliable customer identity and isolates one historical case", async () => {
  renderPage();
  expect(await screen.findByText("GREENTECH GLOBAL TRADING COMPANY LIMITED")).toBeInTheDocument();
  expect(screen.getByText("Certificate of Incorporation / Corporate Documents")).toBeInTheDocument();
  expect(screen.getByText("Personal Source of Wealth")).toBeInTheDocument();
  expect(screen.getByText("Personal Source of Funds")).toBeInTheDocument();
  expect(screen.getByText("Corporate Source of Wealth & Source of Funds")).toBeInTheDocument();
  expect(screen.getByLabelText("Authoritative provider RFI requests").querySelectorAll("article")).toHaveLength(4);
  expect(screen.getAllByRole("button", { name: "View RFI details" })).toHaveLength(4);
  const history = screen.getByText("Historical webhook evidence").closest("section") as HTMLElement;
  expect(within(history).getByText(/^Legacy Webhook Notice$/i)).toBeInTheDocument();
  expect(within(history).getByText("Non-actionable")).toBeInTheDocument();
  expect(within(history).queryByRole("button", { name: /inspect/i })).not.toBeInTheDocument();
});

it("shows business activity separately from synchronization on list and detail", async () => {
  const item = makeCase(61, {
    customer_name: "Timestamp Customer",
    last_activity_at: "2026-10-05T09:00:00Z",
    customer_submitted_at: "2026-10-03T09:00:00Z",
    admin_approved_at: "2026-10-05T09:00:00Z",
    provider_responded_at: null,
    last_synced_at: "2026-10-20T12:00:00Z",
  });
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([item]));
  apiMocks.getAdminRfiCase.mockResolvedValue(item);
  renderPage();

  const card = (await screen.findByText("Timestamp Customer")).closest("section") as HTMLElement;
  expect(within(card).getByText("Last activity")).toBeInTheDocument();
  expect(within(card).getByText("Last synced")).toBeInTheDocument();
  expect(within(card).getByText("Provider responded").parentElement).toHaveTextContent("Not available");

  fireEvent.click(screen.getByRole("button", { name: "View RFI details" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getAllByText("Last activity").length).toBeGreaterThan(0);
  expect(within(dialog).getAllByText("Customer submitted").length).toBeGreaterThan(0);
  expect(within(dialog).getAllByText("Admin approved").length).toBeGreaterThan(0);
  expect(within(dialog).getAllByText("Provider responded").some((node) => node.parentElement?.textContent?.includes("Not available"))).toBe(true);
  expect(within(dialog).getAllByText("Last synced").length).toBeGreaterThan(0);
});

it("uses backend search, filters and pagination", async () => {
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse(cases, 2)); renderPage();
  await screen.findByText("Personal Source of Funds");
  fireEvent.change(screen.getByLabelText("Search RFI cases"), { target: { value: "Acme" } });
  fireEvent.click(screen.getByLabelText("Filter by scope")); fireEvent.click(await screen.findByRole("option", { name: "Transaction RFI" }));
  fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "requested" } });
  fireEvent.click(screen.getByLabelText("Filter by submission state")); fireEvent.click(await screen.findByRole("option", { name: "Admin draft" }));
  await waitFor(() => { const query = String(apiMocks.getAdminRfiCases.mock.calls.at(-1)?.[0]); expect(query).toContain("search=Acme"); expect(query).toContain("scope=transaction"); expect(query).toContain("status=requested"); expect(query).toContain("submission_state=draft"); });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(apiMocks.getAdminRfiCases).toHaveBeenLastCalledWith(expect.stringContaining("page=2"), "admin-token"));
});

it("shows full provider remarks, multiple requirements, document alternatives and customer evidence", async () => {
  const fullRemarks = "Please provide one of the following documents without changing the original content:\n1. Bank statement for the last three months\n2. Audited financial statements";
  apiMocks.getAdminRfiCase.mockResolvedValue(makeCase(11, { business_name: "GREENTECH GLOBAL TRADING COMPANY LIMITED", template_name: "otherDocument", provider_remarks: fullRemarks, evidence: { remarks: fullRemarks, template: { requiredFields: [{ fieldLabel: "Source of funds explanation", fieldValue: "sourceOfFunds", type: "text", required: true, question: "Explain the origin of the company's funds." }, { fieldLabel: "Supporting financial evidence", fieldValue: "document", type: "document", required: false, choices: ["Bank statement", "Audited accounts"] }] } }, response_draft: [{ questionId: "sourceOfFunds", answer: "Operating revenue from wholesale activity." }], user_explanation: "Operating revenue from wholesale activity.", documents: [{ id: 7, type: "bank_statement", original_name: "statement.pdf", file_url: "/private/rfi/7", status: "uploaded" }], history: [{ event_type: "sent", from_state: "new", to_state: "sent_to_user", created_at: "2026-08-24T10:30:00Z" }] }));
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "View RFI details" }))[0]);
  expect(await screen.findByText("Provider-authored text")).toBeInTheDocument();
  expect(screen.getByText("Please provide one of the following documents without changing the original content:")).toBeInTheDocument();
  expect(screen.getAllByText("Bank statement for the last three months").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Audited financial statements").length).toBeGreaterThan(0);
  expect(screen.getByText("Source of funds explanation")).toBeInTheDocument();
  expect(screen.getByText("Supporting financial evidence")).toBeInTheDocument();
  expect(screen.getByText("Mandatory")).toBeInTheDocument();
  expect(screen.getByText("Optional")).toBeInTheDocument();
  expect(screen.getByText("statement.pdf")).toBeInTheDocument();
  expect(screen.getAllByText("Operating revenue from wholesale activity.").length).toBeGreaterThan(0);
  expect(screen.getByText("Workflow History")).toBeInTheDocument();
  expect(screen.getByText("Technical Diagnostics").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText("Received")).toBeInTheDocument(); expect(screen.getByText("Provider Submission")).toBeInTheDocument();
});

it("shows Answers Not required for an authoritative document-only request", async () => {
  const item = makeCase(51, { evidence: { template: { requiredFields: [{ fieldLabel: "Corporate document", fieldValue: "document", type: "document" }] } }, documents: [{ id: 1 }, { id: 2 }] });
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([item])); apiMocks.getAdminRfiCase.mockResolvedValue(item);
  renderPage(); const dialog = await openOnlyCaseDetail(item.id);
  expect(within(dialog).getByText("Answers").parentElement).toHaveTextContent("Not required");
  expect(within(dialog).getByText("Evidence").parentElement).toHaveTextContent("2 attached");
  expect(within(dialog).getByText(/Document-only request/)).toBeInTheDocument();
});

it("keeps missing textual answers visible", async () => {
  const item = makeCase(52, { evidence: { template: { requiredFields: [{ fieldLabel: "Source of funds", fieldValue: "sourceOfFunds", type: "text" }] } }, response_draft: [] });
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([item])); apiMocks.getAdminRfiCase.mockResolvedValue(item);
  renderPage(); const dialog = await openOnlyCaseDetail(item.id);
  expect(within(dialog).getByText("Answers").parentElement).toHaveTextContent("Missing");
  expect(within(dialog).getByText("Structured gaps").parentElement).toHaveTextContent("1 unanswered");
});

it("evaluates mixed document and text requirements independently", async () => {
  const item = makeCase(53, { evidence: { template: { requiredFields: [{ fieldLabel: "Explanation", fieldValue: "explanation", type: "text" }, { fieldLabel: "Evidence", fieldValue: "document", type: "document" }] } }, response_draft: [], documents: [{ id: 3 }] });
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([item])); apiMocks.getAdminRfiCase.mockResolvedValue(item);
  renderPage(); const dialog = await openOnlyCaseDetail(item.id);
  expect(within(dialog).getByText("Answers").parentElement).toHaveTextContent("Missing");
  expect(within(dialog).getAllByText("Evidence").find((node) => node.parentElement?.textContent?.includes("1 attached"))?.parentElement).toHaveTextContent("1 attached");
});

it("does not classify malformed requirements as document-only", async () => {
  const item = makeCase(54, { evidence: { template: { requiredFields: [{ fieldLabel: "Unrecognized requirement" }, "invalid"] } }, response_draft: [] });
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([item])); apiMocks.getAdminRfiCase.mockResolvedValue(item);
  renderPage(); const dialog = await openOnlyCaseDetail(item.id);
  expect(within(dialog).getByText("Answers").parentElement).toHaveTextContent("Unverified");
  expect(within(dialog).getByText(/requirements could not be safely classified/i)).toBeInTheDocument();
});

it("labels responded RFIs as under compliance review without implying clearance", async () => {
  const item = makeCase(55, { status: "responded_under_review", provider_status: "RFI_RESPONDED", submission_state: "responded" });
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([item])); apiMocks.getAdminRfiCase.mockResolvedValue(item);
  renderPage(); const dialog = await openOnlyCaseDetail(item.id);
  expect(within(dialog).getByText("Provider RFI status").parentElement).toHaveTextContent("RFI Responded — Under Compliance Review");
  expect(within(dialog).getByText("Origin Wallet state").parentElement).toHaveTextContent("Provider responded");
  expect(within(dialog).queryByText(/KYC completed|Compliance cleared|Account activated|Approved by Nium/i)).not.toBeInTheDocument();
});

it("shows only safe bounded provider submission history fields", async () => {
  const item = makeCase(56, { submission_state: "responded", provider_status: "RFI_RESPONDED", submission_http_status: 200, submission_outcome: "RECONCILED", authoritative_rfi_status: "RFI_RESPONDED", reconciled_at: "2026-10-16T08:00:00Z", reconciliation_required: false });
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([item])); apiMocks.getAdminRfiCase.mockResolvedValue(item);
  renderPage(); const dialog = await openOnlyCaseDetail(item.id);
  const history = within(dialog).getByLabelText("Safe provider submission history");
  expect(history).toHaveTextContent("Provider responded"); expect(history).toHaveTextContent("200"); expect(history).toHaveTextContent("RECONCILED"); expect(history).toHaveTextContent("RFI_RESPONDED"); expect(history).toHaveTextContent("No");
  expect(dialog).not.toHaveTextContent(/customerHashId|rfiHashId|x-request-id|api[_-]?key|private:\/\/|base64/i);
});

it("offers customer review actions without treating approval as provider submission", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue(makeCase(13, { submission_state: "user_submitted" }));
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "View RFI details" }))[2]);
  expect(await screen.findByRole("button", { name: "Approve customer submission" })).toBeEnabled();
  expect(screen.getByText(/approval does not submit.*Nium/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Submit approved response to Nium" })).not.toBeInTheDocument();
});

it("opens any selected authoritative case and exposes the supported send action", async () => {
  apiMocks.getAdminRfiCase.mockImplementation((id: number) => Promise.resolve({ ...cases.find((item) => item.id === id), evidence: { template: { requiredFields: [{ fieldLabel: id === 12 ? "Personal Source of Wealth" : "Requested information", fieldValue: "document", type: "document" }] } } }));
  renderPage();
  fireEvent.click((await screen.findAllByRole("button", { name: "View RFI details" }))[1]);
  await waitFor(() => expect(apiMocks.getAdminRfiCase).toHaveBeenCalledWith(12, "admin-token"));
  expect(screen.getAllByRole("heading", { name: "Personal Source of Wealth" }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "Send request to customer" })).not.toBeInTheDocument();
});

it("shows send to customer only for a backend-supported new request", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue({ ...cases[0], submission_state: "new" });
  renderPage();
  fireEvent.click((await screen.findAllByRole("button", { name: "View RFI details" }))[0]);
  fireEvent.click(await screen.findByRole("button", { name: "Send request to customer" }));
  await waitFor(() => expect(apiMocks.sendAdminRfiToUser).toHaveBeenCalledWith(11, "admin-token"));
});

it("handles missing optional detail fields without inventing requirements", async () => {
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([makeCase(41, { customer_id: 401, customer_name: "Minimal Customer", template_name: null, provider_remarks: null })]));
  apiMocks.getAdminRfiCase.mockResolvedValue(makeCase(41, { customer_id: 401, customer_name: "Minimal Customer", evidence: null }));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "View RFI details" }));
  expect(await screen.findByText("No original provider remarks were supplied.")).toBeInTheDocument();
  expect(screen.getByText("No structured information fields were supplied by the provider.")).toBeInTheDocument();
  expect(screen.getByText(/without inferring additional requirements/)).toBeInTheDocument();
});

it("fails closed when live submission readiness fields are missing", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue(makeCase(14, { submission_state: "approved" }));
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "View RFI details" }))[3]);
  expect(await screen.findByText(/live submission readiness is unavailable/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit approved response to Nium" })).toBeDisabled();
  expect(apiMocks.submitAdminRfiCase).not.toHaveBeenCalled();
});

it("uses backend eligibility even when the diagnostic contract gate is unconfirmed", async () => {
  const eligible = makeCase(7, { customer_id: 101, business_name: "GREENTECH GLOBAL TRADING COMPANY LIMITED", submission_state: "admin_approved", live_submit_permitted: true, submission_eligible: true, submission_blockers: [], provider_reference_fingerprint: "a".repeat(64), template_fingerprint: "b".repeat(64) });
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([eligible]));
  apiMocks.getAdminRfiCase.mockResolvedValue(eligible);
  renderPage(); const dialog = await openOnlyCaseDetail(7);
  expect(within(dialog).queryByText(/provider contract remains unconfirmed/i)).not.toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Submit approved response to Nium" })).toBeEnabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Submit approved response to Nium" }));
  expect(screen.getByText(/GREENTECH GLOBAL TRADING COMPANY LIMITED, Case #7/)).toBeInTheDocument();
  expect(apiMocks.submitAdminRfiCase).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Live submission confirmation"), { target: { value: "SUBMIT 7 " } });
  expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Live submission confirmation"), { target: { value: "SUBMIT 7" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(apiMocks.submitAdminRfiCase).toHaveBeenCalledWith(eligible, "admin-token"));
});

it("blocks submission when backend eligibility is false", async () => {
  const denied = makeCase(14, { submission_state: "approved", live_submit_permitted: true, submission_eligible: false, submission_blockers: ["Supporting documents require approval."] });
  apiMocks.getAdminRfiCase.mockResolvedValue(denied);
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "View RFI details" }))[3]);
  expect(await screen.findByText("Supporting documents require approval.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit approved response to Nium" })).toBeDisabled();
});

it("shows backend blocker reasons and denies live submit without the dedicated permission", async () => {
  const denied = makeCase(14, { submission_state: "approved", live_submit_permitted: false, submission_eligible: true, submission_blockers: ["Your Admin role does not permit live provider submission."] });
  apiMocks.getAdminRfiCase.mockResolvedValue(denied);
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "View RFI details" }))[3]);
  expect(await screen.findByText("Your Admin role does not permit live provider submission.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit approved response to Nium" })).toBeDisabled();
  expect(apiMocks.submitAdminRfiCase).not.toHaveBeenCalled();
});

it("prevents duplicate submissions and refreshes authoritative detail after completion", async () => {
  const eligible = makeCase(14, { submission_state: "approved", live_submit_permitted: true, submission_eligible: true, submission_blockers: [], provider_reference_fingerprint: "a".repeat(64), template_fingerprint: "b".repeat(64) });
  let resolveSubmission!: (value: AdminRfiCase) => void;
  apiMocks.getAdminRfiCase.mockResolvedValue(eligible);
  apiMocks.submitAdminRfiCase.mockReturnValue(new Promise((resolve) => { resolveSubmission = resolve; }));
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "View RFI details" }))[3]);
  fireEvent.click(await screen.findByRole("button", { name: "Submit approved response to Nium" }));
  fireEvent.change(screen.getByLabelText("Live submission confirmation"), { target: { value: "SUBMIT 14" } });
  const confirm = screen.getByRole("button", { name: "Confirm" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => expect(apiMocks.submitAdminRfiCase).toHaveBeenCalledTimes(1));
  resolveSubmission(makeCase(14, { submission_state: "nium_submitted", submission_outcome: "ACKNOWLEDGED" }));
  await waitFor(() => expect(apiMocks.getAdminRfiCase.mock.calls.filter(([id]) => id === 14).length).toBeGreaterThan(1));
});

it("does not retry an uncertain submission and refreshes the case", async () => {
  const eligible = makeCase(14, { submission_state: "approved", live_submit_permitted: true, submission_eligible: true, submission_blockers: [], provider_reference_fingerprint: "a".repeat(64), template_fingerprint: "b".repeat(64) });
  apiMocks.getAdminRfiCase.mockResolvedValue(eligible);
  apiMocks.submitAdminRfiCase.mockRejectedValue(new Error("Request timed out"));
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "View RFI details" }))[3]);
  fireEvent.click(await screen.findByRole("button", { name: "Submit approved response to Nium" }));
  fireEvent.change(screen.getByLabelText("Live submission confirmation"), { target: { value: "SUBMIT 14" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/outcome may be uncertain.*not retried/i);
  expect(apiMocks.submitAdminRfiCase).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(apiMocks.getAdminRfiCase.mock.calls.filter(([id]) => id === 14).length).toBeGreaterThan(1));
});

it("refreshes authoritative Nium status without invoking submission", async () => {
  const refreshable = makeCase(14, { submission_state: "unknown", status_refresh_eligible: true, provider_reference_fingerprint: "a".repeat(64), template_fingerprint: "b".repeat(64) });
  apiMocks.getAdminRfiCase.mockResolvedValue(refreshable);
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "View RFI details" }))[3]);
  fireEvent.click(await screen.findByRole("button", { name: "Refresh Nium Status" }));
  await waitFor(() => expect(apiMocks.refreshAdminRfiStatus).toHaveBeenCalledWith(refreshable, "admin-token"));
  expect(apiMocks.submitAdminRfiCase).not.toHaveBeenCalled();
});

it("does not allow a responded case to be submitted again", async () => {
  const responded = makeCase(57, { status: "responded_under_review", provider_status: "RFI_RESPONDED", submission_state: "responded", submission_eligible: false, status_refresh_eligible: true, provider_reference_fingerprint: "a".repeat(64), template_fingerprint: "b".repeat(64) });
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([responded])); apiMocks.getAdminRfiCase.mockResolvedValue(responded);
  renderPage(); const dialog = await openOnlyCaseDetail(responded.id);
  expect(within(dialog).queryByRole("button", { name: "Submit approved response to Nium" })).not.toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Refresh Nium Status" })).toBeEnabled();
  expect(apiMocks.submitAdminRfiCase).not.toHaveBeenCalled();
});

it("preserves factual draft and approval actions", async () => {
  const draft = makeCase(21, { submission_state: "draft" });
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([draft])); apiMocks.getAdminRfiCase.mockResolvedValue(draft);
  renderPage(); fireEvent.click(await screen.findByRole("button", { name: "View RFI details" }));
  fireEvent.change(await screen.findByLabelText("Question ID"), { target: { value: "source-of-funds" } });
  fireEvent.change(screen.getByLabelText("Factual answer"), { target: { value: "Customer operating revenue" } });
  fireEvent.click(screen.getByRole("button", { name: "Save factual draft" }));
  await waitFor(() => expect(apiMocks.saveAdminRfiDraft).toHaveBeenCalledWith(21, { answers: [{ questionId: "source-of-funds", answer: "Customer operating revenue" }] }, "admin-token"));
  fireEvent.click(screen.getByRole("button", { name: "Approve factual draft" })); expect(apiMocks.approveAdminRfiCase).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" })); await waitFor(() => expect(apiMocks.approveAdminRfiCase).toHaveBeenCalledWith(21, "admin-token"));
});

it("shows permission, loading, error, retry, empty and no-results states", async () => {
  auth.token = null; const permission = renderPage(); expect(screen.getByRole("alert")).toHaveTextContent("Permission required"); permission.unmount();
  auth.token = "admin-token"; apiMocks.getAdminRfiCases.mockReturnValue(new Promise(() => undefined)); const loading = renderPage(); expect(screen.getByLabelText("Loading RFI cases")).toBeInTheDocument(); loading.unmount();
  apiMocks.getAdminRfiCases.mockRejectedValue(new Error("RFI cases unavailable")); const error = renderPage(); expect(await screen.findByRole("alert")).toHaveTextContent("RFI cases unavailable"); expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument(); error.unmount();
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([])); const empty = renderPage(); expect(await screen.findByText("No RFI cases")).toBeInTheDocument(); empty.unmount();
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([makeCase(31, { submission_state: "sent_to_user" })])); renderPage(); await screen.findByText("RFI request #31"); fireEvent.click(screen.getByRole("button", { name: "Complete" })); expect(await screen.findByText("No matching requests")).toBeInTheDocument();
});

it("uses responsive cards instead of a horizontally scrolling technical table", async () => {
  const { container } = renderPage(); await screen.findByText("Personal Source of Funds");
  expect(container.querySelector("table")).not.toBeInTheDocument(); expect(container.querySelector("main")).toHaveClass("min-w-0");
});
