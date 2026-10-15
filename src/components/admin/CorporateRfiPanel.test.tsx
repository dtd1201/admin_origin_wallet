import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  [1, "businessRegistrationDocument", "Certificate of Incorporation", "Upload the incorporation certificate."],
  [2, "otherDocument", "Personal Source of Wealth", "Explain and evidence personal source of wealth."],
  [3, "otherDocument", "Personal Source of Funds", "Provide personal source of funds evidence."],
  [4, "otherDocument", "Company Source of Funds and Source of Wealth", "Provide company source of funds and wealth evidence."],
] as const;

const cases: AdminRfiCase[] = requirements.map(([id, name, label, remarks]) => ({
  id, scope: "customer", origin: "authoritative_fetch", status: "requested",
  submission_state: id === 1 ? "new" : id === 2 ? "user_submitted" : "sent_to_user",
  contract_gate: "provider_contract_unconfirmed",
  evidence: { remarks, template: { name, documentType: "document", requiredFields: [{ fieldLabel: label, fieldValue: "document", type: "document" }] } },
  documents: id === 2 ? [{ id: 91, original_name: "supporting-evidence.pdf", file_url: "/api/kyc-documents/20/evidence" }] : [],
}));

const page = { current_page: 1, last_page: 1, total: 4, data: cases.map(({ id, scope, origin, status, submission_state, contract_gate }) => ({ id, scope, origin, status, submission_state, contract_gate })) };
const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><CorporateRfiPanel userId={20} token="admin-token" /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn() });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  apiMocks.getAdminRfiCases.mockResolvedValue(page);
  apiMocks.getAdminRfiCase.mockImplementation((id: number) => Promise.resolve(cases.find((item) => item.id === id)));
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

it("renders four authoritative requests with exact remarks and document requirements", async () => {
  renderPanel();
  expect(await screen.findByText("4 open Nium request(s)")).toBeVisible();
  for (const [, name, label, remarks] of requirements) {
    expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(remarks)).toBeVisible();
  }
  expect(screen.getAllByText(/Submission to Nium: blocked/)).toHaveLength(4);
  expect(screen.queryByRole("button", { name: /submit.*nium/i })).not.toBeInTheDocument();
  expect(apiMocks.submitAdminRfiCase).not.toHaveBeenCalled();
});

it("sends, reviews an authenticated document, approves, and requests revision", async () => {
  const objectUrl = vi.mocked(URL.createObjectURL).mockReturnValue("blob:https://admin.example.test/rfi");
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  renderPanel();
  fireEvent.click(await screen.findByRole("button", { name: "Send RFI Request to User" }));
  await waitFor(() => expect(apiMocks.sendAdminRfiToUser).toHaveBeenCalledWith(1, "admin-token"));
  fireEvent.click(screen.getByRole("button", { name: "supporting-evidence.pdf" }));
  await waitFor(() => expect(apiMocks.requestApiBlob).toHaveBeenCalledWith("/api/kyc-documents/20/evidence", { token: "admin-token" }));
  expect(objectUrl).toHaveBeenCalled();
  expect(open).toHaveBeenCalledWith("blob:https://admin.example.test/rfi", "_blank", "noopener,noreferrer");
  fireEvent.click(screen.getByRole("button", { name: "Approve Documents" }));
  await waitFor(() => expect(apiMocks.approveAdminRfiUserSubmission).toHaveBeenCalledWith(2, "admin-token"));
  fireEvent.change(screen.getByLabelText("Revision reason 2"), { target: { value: "Provide the complete statement period." } });
  fireEvent.click(screen.getByRole("button", { name: "Request Revision" }));
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
  fireEvent.click(await screen.findByRole("button", { name: "Send RFI Request to User" }));
  expect(await screen.findByText("Forbidden")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "supporting-evidence.pdf" }));
  expect(await screen.findByText("Document unavailable")).toBeVisible();
  expect(open).not.toHaveBeenCalled();
});
