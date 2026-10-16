import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminRfiCases from "@/pages/admin/AdminRfiCases";
import type { AdminRfiCase } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({
  getAdminRfiCases: vi.fn(), getAdminRfiCase: vi.fn(), saveAdminRfiDraft: vi.fn(), approveAdminRfiCase: vi.fn(),
  submitAdminRfiCase: vi.fn(), sendAdminRfiToUser: vi.fn(), requestAdminRfiRevision: vi.fn(),
  approveAdminRfiUserSubmission: vi.fn(), requestApiBlob: vi.fn(),
}));
const auth = vi.hoisted(() => ({ token: "admin-token" as string | null }));
vi.mock("@/lib/api", () => apiMocks);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: auth.token }) }));

const makeCase = (id: number, overrides: Partial<AdminRfiCase> = {}): AdminRfiCase => ({
  id, scope: "customer", origin: "authoritative_fetch", status: "requested", contract_gate: "provider_contract_unconfirmed",
  submission_state: "new", created_at: "2026-08-24T09:00:00Z", updated_at: "2026-08-24T10:00:00Z", ...overrides,
});
const cases = [
  makeCase(11, { customer_id: 101, business_name: "Acme Trading Co.", template_name: "Source of funds", provider_remarks: "Provide recent bank statements." }),
  makeCase(12, { customer_id: 101, business_name: "Acme Trading Co.", submission_state: "sent_to_user", template_name: "Ownership evidence" }),
  makeCase(13, { customer_id: 202, legal_name: "Beacon Imports Limited", submission_state: "user_submitted", template_name: "Business activity" }),
  makeCase(14, { submission_state: "approved", template_name: "Transaction purpose" }),
  makeCase(99, { origin: "webhook", submission_state: "not_claimed", template_name: "Legacy webhook notice" }),
];
const pageResponse = (data: AdminRfiCase[] = cases, lastPage = 1) => ({ current_page: 1, data, first_page_url: null, from: data.length ? 1 : null, last_page: lastPage, last_page_url: null, links: [], next_page_url: lastPage > 1 ? "page=2" : null, path: "/api/admin/nium-rfi-cases", per_page: 15, prev_page_url: null, to: data.length, total: data.length });
const renderPage = () => { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}><AdminRfiCases /></QueryClientProvider>); };

beforeEach(() => {
  vi.clearAllMocks(); auth.token = "admin-token";
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse());
  apiMocks.getAdminRfiCase.mockImplementation((id: number) => Promise.resolve(cases.find((item) => item.id === id)));
  apiMocks.saveAdminRfiDraft.mockImplementation((id: number) => Promise.resolve(makeCase(id, { submission_state: "draft" })));
  apiMocks.approveAdminRfiCase.mockImplementation((id: number) => Promise.resolve(makeCase(id, { submission_state: "approved" })));
  apiMocks.submitAdminRfiCase.mockImplementation((id: number) => Promise.resolve(makeCase(id, { submission_state: "responded" })));
  apiMocks.sendAdminRfiToUser.mockImplementation((id: number) => Promise.resolve(makeCase(id, { submission_state: "sent_to_user" })));
  apiMocks.requestAdminRfiRevision.mockImplementation((id: number) => Promise.resolve(makeCase(id, { submission_state: "revision_requested" })));
  apiMocks.approveAdminRfiUserSubmission.mockImplementation((id: number) => Promise.resolve(makeCase(id, { submission_state: "admin_approved" })));
});

it("renders four authoritative RFIs by reliable customer identity and isolates one historical case", async () => {
  renderPage();
  expect(await screen.findByText("Acme Trading Co.")).toBeInTheDocument();
  expect(screen.getByText("Beacon Imports Limited")).toBeInTheDocument();
  expect(screen.getByText("Customer identity unavailable")).toBeInTheDocument();
  expect(screen.getByLabelText("Authoritative provider RFI requests").querySelectorAll("article")).toHaveLength(4);
  const history = screen.getByText("Historical webhook evidence").closest("section") as HTMLElement;
  expect(within(history).getByText("Legacy webhook notice")).toBeInTheDocument();
  expect(within(history).getByText("Non-actionable")).toBeInTheDocument();
  expect(within(history).queryByRole("button", { name: /inspect/i })).not.toBeInTheDocument();
});

it("uses backend search, filters and pagination", async () => {
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse(cases, 2)); renderPage();
  await screen.findByText("Source of funds");
  fireEvent.change(screen.getByLabelText("Search RFI cases"), { target: { value: "Acme" } });
  fireEvent.click(screen.getByLabelText("Filter by scope")); fireEvent.click(await screen.findByRole("option", { name: "Transaction RFI" }));
  fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "requested" } });
  fireEvent.click(screen.getByLabelText("Filter by submission state")); fireEvent.click(await screen.findByRole("option", { name: "Admin draft" }));
  await waitFor(() => { const query = String(apiMocks.getAdminRfiCases.mock.calls.at(-1)?.[0]); expect(query).toContain("search=Acme"); expect(query).toContain("scope=transaction"); expect(query).toContain("status=requested"); expect(query).toContain("submission_state=draft"); });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(apiMocks.getAdminRfiCases).toHaveBeenLastCalledWith(expect.stringContaining("page=2"), "admin-token"));
});

it("shows the complete case workflow and keeps diagnostics collapsed", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue(makeCase(11, { business_name: "Acme Trading Co.", template_name: "Source of funds", provider_remarks: "Provide recent bank statements.", evidence: { template: { requiredFields: [{ fieldLabel: "Bank statement", type: "PDF" }] } }, user_explanation: "Operating revenue from wholesale activity.", documents: [{ id: 7, original_name: "statement.pdf", file_url: "/private/rfi/7", status: "uploaded" }], history: [{ event_type: "sent", from_state: "new", to_state: "sent_to_user", created_at: "2026-08-24T10:30:00Z" }] }));
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "Inspect request" }))[0]);
  expect(await screen.findByText("Original Nium remarks")).toBeInTheDocument();
  expect(screen.getByText("Bank statement")).toBeInTheDocument(); expect(screen.getByText("statement.pdf")).toBeInTheDocument();
  expect(screen.getByText("Operating revenue from wholesale activity.")).toBeInTheDocument();
  expect(screen.getByText("Review & Submission History")).toBeInTheDocument();
  expect(screen.getByText("Technical Diagnostics").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText("Received")).toBeInTheDocument(); expect(screen.getByText("Provider Submission")).toBeInTheDocument();
});

it("offers customer review actions without treating approval as provider submission", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue(makeCase(13, { submission_state: "user_submitted" }));
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "Inspect request" }))[2]);
  expect(await screen.findByRole("button", { name: "Approve Customer Submission" })).toBeEnabled();
  expect(screen.getByText(/Approval does not submit to Nium/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit Approved Response to Nium" })).toBeDisabled();
});

it("keeps provider POST blocked while the contract is unconfirmed", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue(makeCase(14, { submission_state: "approved" }));
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "Inspect request" }))[3]);
  expect(await screen.findByText(/Provider POST is blocked/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Submit Approved Response to Nium" })).toBeDisabled();
  expect(apiMocks.submitAdminRfiCase).not.toHaveBeenCalled();
});

it("submits a confirmed provider response only after confirmation", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue(makeCase(14, { submission_state: "approved", contract_gate: "provider_contract_confirmed" }));
  renderPage(); fireEvent.click((await screen.findAllByRole("button", { name: "Inspect request" }))[3]);
  fireEvent.click(await screen.findByRole("button", { name: "Submit Approved Response to Nium" }));
  expect(apiMocks.submitAdminRfiCase).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(apiMocks.submitAdminRfiCase).toHaveBeenCalledWith(14, "admin-token"));
});

it("preserves factual draft and approval actions", async () => {
  const draft = makeCase(21, { submission_state: "draft" });
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([draft])); apiMocks.getAdminRfiCase.mockResolvedValue(draft);
  renderPage(); fireEvent.click(await screen.findByRole("button", { name: "Inspect request" }));
  fireEvent.change(await screen.findByLabelText("Question ID"), { target: { value: "source-of-funds" } });
  fireEvent.change(screen.getByLabelText("Factual answer"), { target: { value: "Customer operating revenue" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
  await waitFor(() => expect(apiMocks.saveAdminRfiDraft).toHaveBeenCalledWith(21, { answers: [{ questionId: "source-of-funds", answer: "Customer operating revenue" }] }, "admin-token"));
  fireEvent.click(screen.getByRole("button", { name: "Approve Draft" })); expect(apiMocks.approveAdminRfiCase).not.toHaveBeenCalled();
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
  const { container } = renderPage(); await screen.findByText("Source of funds");
  expect(container.querySelector("table")).not.toBeInTheDocument(); expect(container.querySelector("main")).toHaveClass("min-w-0");
});
