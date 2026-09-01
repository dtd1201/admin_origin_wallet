import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminRfiCases from "@/pages/admin/AdminRfiCases";
import type { AdminRfiCase } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({
  getAdminRfiCases: vi.fn(),
  getAdminRfiCase: vi.fn(),
  saveAdminRfiDraft: vi.fn(),
  approveAdminRfiCase: vi.fn(),
  submitAdminRfiCase: vi.fn(),
}));

vi.mock("@/lib/api", () => apiMocks);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "admin-token" }) }));

const rfiCase: AdminRfiCase = {
  id: 17,
  scope: "customer",
  status: "requested",
  contract_gate: "provider_contract_unconfirmed",
  submission_state: "draft",
  approved_at: null,
  claimed_at: null,
  reconciled_at: null,
  created_at: "2026-08-24T09:00:00Z",
  updated_at: "2026-08-24T10:00:00Z",
};

const pageResponse = (data: AdminRfiCase[] = [rfiCase], lastPage = 1) => ({
  current_page: 1,
  data,
  first_page_url: null,
  from: data.length ? 1 : null,
  last_page: lastPage,
  last_page_url: null,
  links: [],
  next_page_url: lastPage > 1 ? "page=2" : null,
  path: "/api/admin/nium-rfi-cases",
  per_page: 15,
  prev_page_url: null,
  to: data.length,
  total: data.length,
});

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AdminRfiCases /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse());
  apiMocks.getAdminRfiCase.mockResolvedValue(rfiCase);
  apiMocks.saveAdminRfiDraft.mockResolvedValue(rfiCase);
  apiMocks.approveAdminRfiCase.mockResolvedValue({ ...rfiCase, submission_state: "approved", approved_at: "2026-08-24T11:00:00Z" });
  apiMocks.submitAdminRfiCase.mockResolvedValue({ ...rfiCase, scope: "transaction", submission_state: "responded" });
});

it("shows the list loading state", () => {
  apiMocks.getAdminRfiCases.mockReturnValue(new Promise(() => undefined));
  renderPage();
  expect(screen.getByText("Loading RFI cases...")).toBeInTheDocument();
});

it("shows the empty state", async () => {
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([]));
  renderPage();
  expect(await screen.findByText("No RFI cases found.")).toBeInTheDocument();
});

it("uses list pagination", async () => {
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse([rfiCase], 2));
  renderPage();
  await screen.findByText("Page 1 of 2");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(apiMocks.getAdminRfiCases).toHaveBeenLastCalledWith(expect.stringContaining("page=2"), "admin-token"));
});

it("passes scope, status, and submission state filters", async () => {
  renderPage();
  await screen.findByText("#17");
  fireEvent.click(screen.getByLabelText("Filter by scope"));
  fireEvent.click(await screen.findByRole("option", { name: "transaction" }));
  fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "provisional" } });
  fireEvent.click(screen.getByLabelText("Filter by submission state"));
  fireEvent.click(await screen.findByRole("option", { name: "approved" }));
  await waitFor(() => {
    const query = String(apiMocks.getAdminRfiCases.mock.calls.at(-1)?.[0]);
    expect(query).toContain("scope=transaction");
    expect(query).toContain("status=provisional");
    expect(query).toContain("submission_state=approved");
  });
});

it("shows detail loading", async () => {
  apiMocks.getAdminRfiCase.mockReturnValue(new Promise(() => undefined));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  expect(await screen.findByText("Loading RFI case detail...")).toBeInTheDocument();
});

it("shows API errors", async () => {
  apiMocks.getAdminRfiCases.mockRejectedValue(new Error("RFI cases unavailable"));
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("RFI cases unavailable");
});

it("shows backend RFI evidence and reviewed answers without exposing provider account identifiers", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue({
    ...rfiCase,
    evidence: { customerHashId: "sensitive-customer-hash", walletHashId: "sensitive-wallet-hash", description: "salaryStatement", rfiStatus: "RFI_RESPONDED" },
    response_draft: [{ questionId: "sourceOfFunds", answer: "Salary income", provenance: { source: "human_supplied", recorded_at: "2026-08-24T09:30:00Z" } }],
    provider_reference_fingerprint: "sensitive-provider-reference",
    supporting_file_ids: ["sensitive-file-id"],
    metadata: { secret: "sensitive-metadata" },
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  await waitFor(() => expect(apiMocks.getAdminRfiCase).toHaveBeenCalledWith(17, "admin-token"));
  expect(await screen.findByText("provider_contract_unconfirmed")).toBeInTheDocument();
  expect(screen.queryByText("sensitive-customer-hash")).not.toBeInTheDocument();
  expect(screen.queryByText("sensitive-wallet-hash")).not.toBeInTheDocument();
  expect(screen.getAllByText("salaryStatement").length).toBeGreaterThan(0);
  expect(screen.getAllByText("RFI_RESPONDED").length).toBeGreaterThan(0);
  expect(screen.getByText("Salary income")).toBeInTheDocument();
  expect(screen.queryByText("sensitive-provider-reference")).not.toBeInTheDocument();
  expect(screen.queryByText("sensitive-file-id")).not.toBeInTheDocument();
  expect(screen.queryByText("sensitive-metadata")).not.toBeInTheDocument();
});

it("requires confirmation before submitting an approved transaction RFI", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue({ ...rfiCase, scope: "transaction", submission_state: "approved" });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  fireEvent.click(await screen.findByRole("button", { name: "Submit approved transaction RFI" }));
  expect(apiMocks.submitAdminRfiCase).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm submission" }));
  await waitFor(() => expect(apiMocks.submitAdminRfiCase).toHaveBeenCalledWith(17, "admin-token"));
});

it("saves a factual draft through the existing endpoint", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue({ ...rfiCase, submission_state: "not_claimed" });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  fireEvent.change(await screen.findByLabelText("Question ID"), { target: { value: "business-purpose" } });
  fireEvent.change(screen.getByLabelText("Factual answer"), { target: { value: "Payment for invoice 42" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(apiMocks.saveAdminRfiDraft).toHaveBeenCalledWith(17, {
    answers: [{ questionId: "business-purpose", answer: "Payment for invoice 42" }],
  }, "admin-token"));
});

it("requires confirmation before approving a draft", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  fireEvent.click(await screen.findByRole("button", { name: "Approve draft" }));
  expect(apiMocks.approveAdminRfiCase).not.toHaveBeenCalled();
  expect(screen.getByText("Approve factual RFI draft?")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
  await waitFor(() => expect(apiMocks.approveAdminRfiCase).toHaveBeenCalledWith(17, "admin-token"));
});

it("renders case status and submission state as distinct lifecycle fields", async () => {
  const states = ["not_claimed", "draft", "approved", "claimed", "responded", "reconciled"] as const;
  const statuses = ["provisional", "requested", "resolved_authoritative_clear"];
  apiMocks.getAdminRfiCases.mockResolvedValue(pageResponse(states.map((submission_state, index) => ({
    ...rfiCase,
    id: index + 1,
    status: statuses[index % statuses.length],
    submission_state,
  }))));
  renderPage();
  for (const status of statuses) expect((await screen.findAllByText(status)).length).toBeGreaterThan(0);
  for (const state of states) expect((await screen.findAllByText(state)).length).toBeGreaterThan(0);
});

it("labels CLEAR only for the backend authoritative resolved state", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue({
    ...rfiCase,
    scope: "customer",
    status: "resolved_authoritative_clear",
    submission_state: "reconciled",
    reconciled_at: "2026-08-24T12:00:00Z",
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  expect(await screen.findByText("CLEAR - backend authoritative")).toBeInTheDocument();
  expect(screen.getByText("Corporate RFI")).toBeInTheDocument();
});

it("shows draft API errors without exposing hidden detail fields", async () => {
  apiMocks.getAdminRfiCase.mockResolvedValue({ ...rfiCase, submission_state: "not_claimed", evidence: { secret: "hidden-evidence" } });
  apiMocks.saveAdminRfiDraft.mockRejectedValue(new Error("Draft validation failed"));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  fireEvent.change(await screen.findByLabelText("Question ID"), { target: { value: "q-1" } });
  fireEvent.change(screen.getByLabelText("Factual answer"), { target: { value: "Safe factual answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Draft validation failed");
  expect(screen.queryByText("hidden-evidence")).not.toBeInTheDocument();
});
