import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import AdminComplianceEvents from "@/pages/admin/AdminComplianceEvents";
import type { AdminComplianceEvent } from "@/types/admin";

const apiMocks = vi.hoisted(() => ({
  getAdminComplianceEvents: vi.fn(),
  getAdminComplianceEvent: vi.fn(),
  reviewAdminComplianceEvent: vi.fn(),
}));

vi.mock("@/lib/api", () => apiMocks);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "admin-token" }) }));

const event: AdminComplianceEvent = {
  id: 7,
  event_id: "event-sensitive-12345678",
  request_id: "request-sensitive-12345678",
  reference: "payment-sensitive-12345678",
  customer_reference: "customer-sensitive-12345678",
  event_type: "TRANSACTION_COMPLIANCE",
  compliance_status: "ACTION_REQUIRED",
  match_status: "matched_transaction",
  review_status: "pending",
  requires_action: true,
  processing_status: "processed",
  duplicate_count: 0,
  provider: { id: 1, code: "nium", name: "Nium", status: "active" },
  transaction_id: 91,
  received_at: "2026-08-24T10:00:00Z",
  processed_at: "2026-08-24T10:01:00Z",
};

const pageResponse = (data: AdminComplianceEvent[] = [event]) => ({
  current_page: 1,
  data,
  first_page_url: null,
  from: data.length ? 1 : null,
  last_page: 1,
  last_page_url: null,
  links: [],
  next_page_url: null,
  path: "/api/admin/nium-compliance-events",
  per_page: 15,
  prev_page_url: null,
  to: data.length,
  total: data.length,
});

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AdminComplianceEvents /></QueryClientProvider>);
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getAdminComplianceEvents.mockResolvedValue(pageResponse());
  apiMocks.getAdminComplianceEvent.mockResolvedValue(event);
  apiMocks.reviewAdminComplianceEvent.mockResolvedValue({ message: "Reviewed", event: { ...event, review_status: "resolved" } });
});

it("shows the list loading state", () => {
  apiMocks.getAdminComplianceEvents.mockReturnValue(new Promise(() => undefined));
  renderPage();
  expect(screen.getByText("Loading compliance events...")).toBeInTheDocument();
});

it("shows the empty state", async () => {
  apiMocks.getAdminComplianceEvents.mockResolvedValue(pageResponse([]));
  renderPage();
  expect(await screen.findByText("No compliance events found.")).toBeInTheDocument();
});

it("passes filters to the list API", async () => {
  renderPage();
  await screen.findByText("TRANSACTION_COMPLIANCE");
  fireEvent.change(screen.getByLabelText("Search compliance events"), { target: { value: "event-42" } });
  await waitFor(() => expect(apiMocks.getAdminComplianceEvents).toHaveBeenLastCalledWith(expect.stringContaining("search=event-42"), "admin-token"));
  expect(apiMocks.getAdminComplianceEvents).toHaveBeenLastCalledWith(expect.stringContaining("review_status=pending"), "admin-token");
});

it("loads detail without rendering raw identifiers", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: /inspect/i }));
  await waitFor(() => expect(apiMocks.getAdminComplianceEvent).toHaveBeenCalledWith(7, "admin-token"));
  expect(await screen.findByText("transaction")).toBeInTheDocument();
  expect(screen.queryByText("event-sensitive-12345678")).not.toBeInTheDocument();
});

it("resolves an event with a required note", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: /inspect/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Resolve" }));
  fireEvent.change(screen.getByLabelText("Resolution note"), { target: { value: "Verified against the transaction record." } });
  fireEvent.click(screen.getByRole("button", { name: "Resolve event" }));
  await waitFor(() => expect(apiMocks.reviewAdminComplianceEvent).toHaveBeenCalledWith(7, { status: "resolved", resolution_note: "Verified against the transaction record." }, "admin-token"));
});

it("ignores an event with a required note", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: /inspect/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Ignore" }));
  fireEvent.change(screen.getByLabelText("Resolution note"), { target: { value: "Duplicate operational notification." } });
  fireEvent.click(screen.getByRole("button", { name: "Ignore event" }));
  await waitFor(() => expect(apiMocks.reviewAdminComplianceEvent).toHaveBeenCalledWith(7, { status: "ignored", resolution_note: "Duplicate operational notification." }, "admin-token"));
});

it("shows a validation error when the note is empty", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: /inspect/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Resolve" }));
  fireEvent.click(screen.getByRole("button", { name: "Resolve event" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Resolution note is required.");
  expect(apiMocks.reviewAdminComplianceEvent).not.toHaveBeenCalled();
});

it("shows a permission error returned by the API", async () => {
  apiMocks.reviewAdminComplianceEvent.mockRejectedValue(new Error("You are not allowed to access admin resources."));
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: /inspect/i }));
  fireEvent.click(await screen.findByRole("button", { name: "Resolve" }));
  fireEvent.change(screen.getByLabelText("Resolution note"), { target: { value: "Reviewed." } });
  fireEvent.click(screen.getByRole("button", { name: "Resolve event" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("You are not allowed to access admin resources.");
});
