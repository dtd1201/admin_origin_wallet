import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminDashboard from "@/pages/admin/AdminDashboard";

const apiMocks = vi.hoisted(() => ({ requestApi: vi.fn() }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, requestApi: apiMocks.requestApi };
});
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    token: "admin-token",
    user: { id: 1, full_name: "Admin User", email: "admin@example.test", roles: [{ role_code: "admin" }] },
  }),
}));

const page = (data: unknown[], total: number) => ({ current_page: 1, last_page: Math.max(1, Math.ceil(total / 15)), total, data });
const users = [
  { id: 11, full_name: "Loaded User One", email: "one@example.test", status: "active", kyc_status: "approved" },
  { id: 12, full_name: "Loaded User Two", email: "two@example.test", status: "active", kyc_status: "pending" },
];

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><AdminDashboard /></QueryClientProvider></MemoryRouter>);
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.requestApi.mockImplementation((url: string) => {
    if (url === "/admin/users") return Promise.resolve(page(users, 240));
    if (url === "/admin/integration-providers") return Promise.resolve(page([
      { id: 1, code: "active-provider", name: "Active Provider", status: "active" },
      { id: 2, code: "inactive-provider", name: "Inactive Provider", status: "inactive" },
    ], 75));
    if (url === "/admin/transfers") return Promise.resolve(page([{ id: 21, transfer_no: "TR-21", user_id: 11, status: "pending", source_amount: "10", source_currency: "USD" }], 630));
    if (url === "/admin/users/11/integration-links") return Promise.resolve({ data: [{ provider: { code: "active-provider", name: "Active Provider" }, integration_request: { id: 31, status: "pending", requested_at: "2026-08-24T10:00:00Z" } }] });
    if (url === "/admin/users/12/integration-links") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

it("labels dashboard metrics according to backend and loaded-record scope", async () => {
  renderPage();
  expect(await screen.findByText("NIUM Operations Review")).toBeInTheDocument();
  expect(screen.queryByText("NIUM Sandbox review path")).not.toBeInTheDocument();
  expect(screen.getByText("User records")).toBeInTheDocument();
  expect(await screen.findByText("240")).toBeInTheDocument();
  expect(screen.getByText("Transfer records")).toBeInTheDocument();
  expect(screen.getByText("630")).toBeInTheDocument();
  expect(screen.getAllByText("Backend API total")).toHaveLength(2);
  expect(screen.getByText("Active providers")).toBeInTheDocument();
  expect(screen.getByText("Current page count")).toBeInTheDocument();
  expect(screen.getByText("Pending requests found")).toBeInTheDocument();
  expect(screen.getByText("Loaded records only")).toBeInTheDocument();
});

it("does not infer provider, pending queue, or financial totals", async () => {
  renderPage();
  expect(await screen.findByText("240")).toBeInTheDocument();
  expect(screen.getByText("Active providers")).toBeInTheDocument();
  expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(2);
  expect(screen.queryByText("75")).not.toBeInTheDocument();
  expect(screen.queryByText("10 USD total")).not.toBeInTheDocument();
  expect(screen.getByText("Up to four records from the currently loaded transfers API page; no ordering is inferred.")).toBeInTheDocument();
});

it("handles empty API pages without implying system-wide emptiness", async () => {
  apiMocks.requestApi.mockImplementation((url: string) => {
    if (url === "/admin/users" || url === "/admin/integration-providers" || url === "/admin/transfers") return Promise.resolve(page([], 0));
    return Promise.resolve({ data: [] });
  });
  renderPage();
  expect(await screen.findByText("No user records are present in the loaded page.")).toBeInTheDocument();
  expect(screen.getByText("No transfer records are present in the loaded page.")).toBeInTheDocument();
  expect(screen.getByText("No pending integration requests were found in the loaded user records.")).toBeInTheDocument();
  expect(screen.getByText("Loaded records only")).toBeInTheDocument();
});
