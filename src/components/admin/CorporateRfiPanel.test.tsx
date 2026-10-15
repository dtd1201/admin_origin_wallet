import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CorporateRfiPanel } from "@/components/admin/CorporateRfiPanel";
import type { AdminRfiCase } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({
  getAdminRfiCases: vi.fn(), getAdminRfiCase: vi.fn(), sendAdminRfiToUser: vi.fn(),
  approveAdminRfiUserSubmission: vi.fn(), requestAdminRfiRevision: vi.fn(), requestApiBlob: vi.fn(),
  submitAdminRfiCase: vi.fn(),
}));
vi.mock("@/lib/api", () => apiMocks);

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

const requirements = [
  [1, "businessRegistrationDocument", "Certificate of Incorporation", "Incorporation certificate", "Upload the incorporation certificate."],
  [2, "otherDocument", "Personal Source of Wealth", "Source of wealth evidence", "Explain and evidence personal source of wealth."],
  [3, "otherDocument", "Personal Source of Funds", "Source of funds evidence", "Provide personal source of funds evidence."],
  [4, "otherDocument", "Company Source of Funds and Source of Wealth", "Company financial evidence", "Provide company source of funds and wealth evidence."],
] as const;

const cases: AdminRfiCase[] = requirements.map(([id, documentType, templateName, fieldLabel, remarks]) => ({
  id, scope: "customer", origin: "authoritative_fetch", status: "requested",
  submission_state: id === 1 ? "new" : id === 2 ? "user_submitted" : "sent_to_user",
  contract_gate: "provider_contract_unconfirmed",
  evidence: { remarks, template: { name: templateName, documentType, requiredFields: [{ fieldLabel, fieldValue: "document", type: "document" }] } },
  documents: id === 2 ? [{ id: 91, original_name: "supporting-evidence.pdf", file_url: "/api/kyc-documents/20/evidence" }] : [],
  history: [{ event_type: "rfi_received", from_state: null, to_state: "new", created_at: "2026-08-20T09:00:00Z" }],
  updated_at: `2026-08-2${id}T09:00:00Z`,
}));

const historical: AdminRfiCase = {
  ...cases[0], id: 99, origin: "webhook", evidence: { remarks: "Historical webhook evidence only.", template: { name: "Historical RFI Case #1" } },
};

const allCases = [...cases, historical];
const page = { current_page: 1, last_page: 1, total: 5, data: allCases.map(({ id, scope, origin, status, submission_state, contract_gate }) => ({ id, scope, origin, status, submission_state, contract_gate })) };
const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><CorporateRfiPanel userId={20} token="admin-token" customerName="Fixture Trading Limited" /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn() });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  apiMocks.getAdminRfiCases.mockResolvedValue(page);
  apiMocks.getAdminRfiCase.mockImplementation((id: number) => Promise.resolve(allCases.find((item) => item.id === id)));
  apiMocks.sendAdminRfiToUser.mockResolvedValue({ ...cases[0], submission_state: "sent_to_user" });
  apiMocks.approveAdminRfiUserSubmission.mockResolvedValue({ ...cases[1], submission_state: "admin_approved" });
  apiMocks.requestAdminRfiRevision.mockResolvedValue({ ...cases[1], submission_state: "revision_requested" });
  apiMocks.requestApiBlob.mockResolvedValue(new Blob(["safe fixture"], { type: "application/pdf" }));
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalCreateObjectUrl) Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
  else Reflect.deleteProperty(URL, "createObjectURL");
  if (originalRevokeObjectUrl) Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
  else Reflect.deleteProperty(URL, "revokeObjectURL");
});

it("renders a customer workspace with four authoritative requests and separate historical evidence", async () => {
  renderPanel();
  expect(await screen.findByRole("heading", { name: "Corporate RFI management" })).toBeVisible();
  await screen.findByLabelText("Search Corporate RFI requests");
  expect(screen.getByText("Fixture Trading Limited")).toBeVisible();
  expect(screen.getByText("Active RFIs").parentElement).toHaveTextContent("4");
  for (const [, , templateName, , remarks] of requirements) {
    expect(screen.getAllByText(templateName).length).toBeGreaterThan(0);
    expect(screen.getByText(remarks)).toBeVisible();
  }
  expect(screen.getByRole("heading", { name: "Historical webhook evidence" })).toBeVisible();
  expect(screen.getByText("Historical RFI Case #1")).toBeVisible();
  expect(screen.getByText(/not authoritative provider requests/i)).toBeVisible();
  expect(screen.queryByRole("button", { name: /submit.*nium/i })).not.toBeInTheDocument();
  expect(apiMocks.submitAdminRfiCase).not.toHaveBeenCalled();

  fireEvent.click(screen.getAllByRole("button", { name: "Inspect request" })[0]);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(requirements[0][3])).toBeVisible();
  expect(within(dialog).getByText("Original Nium remarks")).toBeVisible();
  expect(within(dialog).getByLabelText("RFI lifecycle")).toBeVisible();
  expect(within(dialog).getByText(/Provider submission is blocked/)).toBeVisible();
});

it("sends, reviews an authenticated document, approves, and requests revision", async () => {
  const objectUrl = vi.mocked(URL.createObjectURL).mockReturnValue("blob:https://admin.example.test/rfi");
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Send to customer" }));
  await waitFor(() => expect(apiMocks.sendAdminRfiToUser).toHaveBeenCalledWith(1, "admin-token"));
  fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /supporting-evidence.pdf/ }));
  await waitFor(() => expect(apiMocks.requestApiBlob).toHaveBeenCalledWith("/api/kyc-documents/20/evidence", { token: "admin-token" }));
  expect(objectUrl).toHaveBeenCalled();
  expect(open).toHaveBeenCalledWith("blob:https://admin.example.test/rfi", "_blank", "noopener,noreferrer");
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve Documents" }));
  await waitFor(() => expect(apiMocks.approveAdminRfiUserSubmission).toHaveBeenCalledWith(2, "admin-token"));
  fireEvent.change(within(dialog).getByLabelText("Revision reason 2"), { target: { value: "Provide the complete statement period." } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Request Revision" }));
  await waitFor(() => expect(apiMocks.requestAdminRfiRevision).toHaveBeenCalledWith(2, "Provide the complete statement period.", "admin-token"));
});

it("shows query, action, and document failures without opening a blank tab", async () => {
  apiMocks.getAdminRfiCases.mockRejectedValueOnce(new Error("RFI unavailable"));
  const first = renderPanel();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load Corporate RFI requests.");
  first.unmount();

  apiMocks.sendAdminRfiToUser.mockRejectedValueOnce(new Error("Forbidden"));
  apiMocks.requestApiBlob.mockRejectedValueOnce(new Error("Document unavailable"));
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Send to customer" }));
  expect(await screen.findByText("Forbidden")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /supporting-evidence.pdf/ }));
  expect(await screen.findByText("Document unavailable")).toBeVisible();
  expect(open).not.toHaveBeenCalled();
});

it("supports accessible searching, filtering, retry and permission-denied states", async () => {
  const view = renderPanel();
  const search = await screen.findByLabelText("Search Corporate RFI requests");
  fireEvent.change(search, { target: { value: "personal source of wealth" } });
  expect(await screen.findByRole("heading", { name: "Personal Source of Wealth" })).toBeVisible();
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Personal Source of Funds" })).not.toBeInTheDocument());
  view.unmount();

  apiMocks.getAdminRfiCases.mockRejectedValueOnce(new Error("Unavailable"));
  renderPanel();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load Corporate RFI requests.");
  expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
});

it("renders loading, empty and permission-denied states without exposing actions", async () => {
  apiMocks.getAdminRfiCases.mockReturnValueOnce(new Promise(() => undefined));
  const loading = renderPanel();
  expect(screen.getByLabelText("Loading Corporate RFI requests")).toBeVisible();
  loading.unmount();

  apiMocks.getAdminRfiCases.mockResolvedValueOnce({ ...page, total: 0, data: [] });
  const empty = renderPanel();
  expect(await screen.findByText("No authoritative Corporate RFI requests")).toBeVisible();
  empty.unmount();

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CorporateRfiPanel userId={20} token={null} /></QueryClientProvider>);
  expect(screen.getByRole("alert")).toHaveTextContent("Permission required");
  expect(screen.queryByRole("button", { name: /send|approve/i })).not.toBeInTheDocument();
});
