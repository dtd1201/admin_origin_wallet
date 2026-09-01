import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import AdminAuditLogs from "@/pages/admin/AdminAuditLogs";
import AdminFxOrders from "@/pages/admin/AdminFxOrders";
import AdminProviderOperations from "@/pages/admin/AdminProviderOperations";

const apiMocks = vi.hoisted(() => ({ requestApi: vi.fn() }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, requestApi: apiMocks.requestApi };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "admin-token" }) }));

const page = (data: unknown[]) => ({ current_page: 1, last_page: 1, total: data.length, data });

const renderPage = (component: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
};

beforeEach(() => vi.clearAllMocks());

it("loads provider operations with masked references and no provider payload", async () => {
  apiMocks.requestApi.mockImplementation((url: string) => {
    if (url === "/admin/integration-providers") return Promise.resolve(page([{ id: 1, code: "safe-provider", name: "Safe Provider", status: "active" }]));
    if (url.startsWith("/admin/provider-health")) return Promise.resolve(page([]));
    if (url.startsWith("/admin/provider-webhook-events")) return Promise.resolve(page([{
      id: 7, provider_code: "safe-provider", event_id: "external-event-9876", event_type: "payment.updated",
      status: "failed", attempts: 2, received_at: "2026-08-24T10:00:00Z",
      error_message: "provider timeout token=provider-secret-token", payload: { token: "raw-provider-token", account_number: "123456789" },
    }]));
    return Promise.resolve(page([]));
  });

  renderPage(<AdminProviderOperations />);
  expect(await screen.findByText("payment.updated")).toBeInTheDocument();
  expect(screen.getByText("****9876")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
  expect(screen.getByText("Failure")).toBeInTheDocument();
  expect(screen.getByText("Timeout")).toBeInTheDocument();
  for (const secret of ["external-event-9876", "provider-secret-token", "raw-provider-token", "123456789"]) {
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  }
});

it("presents masked NIUM virtual account assignment evidence from the webhook projection", async () => {
  apiMocks.requestApi.mockImplementation((url: string) => {
    if (url === "/admin/integration-providers") return Promise.resolve(page([{ id: 1, code: "nium", name: "NIUM", status: "active" }]));
    if (url.startsWith("/admin/provider-health")) return Promise.resolve(page([]));
    if (url.startsWith("/admin/provider-webhook-events")) return Promise.resolve(page([{
      id: 21,
      provider_code: "nium",
      event_id: "provider-event-4321",
      event_type: "VIRTUAL_ACCOUNT_ASSIGNED",
      status: "processed",
      received_at: "2026-08-24T10:00:00Z",
      processed_at: "2026-08-24T10:00:01Z",
      payload: {
        template: "VIRTUAL_ACCOUNT_ASSIGNED",
        uniquePaymentId: "payment-id-9876",
        customerHashId: "customer-hash-2468",
        walletHashId: "wallet-hash-1357",
        currencyCode: "USD",
      },
    }]));
    return Promise.resolve(page([]));
  });

  renderPage(<AdminProviderOperations />);
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
  expect(screen.getByText("NIUM Virtual Account Assignment Evidence")).toBeInTheDocument();
  expect(screen.getByText("****9876")).toBeInTheDocument();
  expect(screen.getByText("****2468")).toBeInTheDocument();
  expect(screen.getByText("****1357")).toBeInTheDocument();
  expect(screen.queryByText("payment-id-9876")).not.toBeInTheDocument();
  expect(screen.queryByText("customer-hash-2468")).not.toBeInTheDocument();
  expect(screen.queryByText("wallet-hash-1357")).not.toBeInTheDocument();
  expect(screen.queryByText(/current van inventory/i)).not.toBeInTheDocument();
});

it("loads FX orders with customer identifiers masked and raw submission data excluded", async () => {
  apiMocks.requestApi.mockImplementation((url: string) => {
    if (url === "/admin/integration-providers") return Promise.resolve(page([]));
    if (url.startsWith("/admin/fx-orders")) return Promise.resolve(page([{
      id: 9, order_no: "FX-SECRET-4321", user_id: 31, provider_id: 1, source_currency: "USD", target_currency: "EUR",
      source_amount: "100", target_amount: "92", fx_rate: "0.92", fee_amount: "1", status: "pending",
      created_at: "2026-08-24T10:00:00Z", user: { full_name: "Sensitive Customer", email: "customer-secret@example.com", phone: "+66812345678", kyc_status: "approved" },
      provider: { id: 1, code: "safe-provider", name: "Safe Provider", status: "active" },
      raw_data: { api_token: "fx-provider-token", account_number: "9988776655", provider_hash: "provider-hash-secret" },
    }]));
    return Promise.resolve(page([]));
  });

  renderPage(<AdminFxOrders />);
  expect(await screen.findByText("****4321")).toBeInTheDocument();
  expect(screen.getByText("100 USD")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Detail" }));
  expect(screen.getAllByText("Safe Provider").length).toBeGreaterThan(0);
  for (const secret of ["FX-SECRET-4321", "Sensitive Customer", "customer-secret@example.com", "+66812345678", "fx-provider-token", "9988776655", "provider-hash-secret"]) {
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  }
});

it("loads audit logs and renders only whitelisted safe summary fields", async () => {
  apiMocks.requestApi.mockResolvedValue(page([{
    id: 12, actor_email: "admin@example.com", action: "provider.webhook.retry", entity_type: "provider", entity_id: "provider-record-2468",
    created_at: "2026-08-24T10:00:00Z", ip_address: "10.20.30.40",
    before: { token: "audit-secret-token", request_body: { account_number: "11223344" } },
    after: { operation: "Webhook retry", status: "completed", http_status: 202, success: true, provider_reference: "provider-ref-1357", response_body: { secret: "raw-response-secret" } },
    metadata: { provider_hash: "audit-provider-hash" },
  }]));

  renderPage(<AdminAuditLogs />);
  expect(await screen.findByText("provider.webhook.retry")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
  for (const safeValue of ["Webhook retry", "completed", "202", "Success", "****1357"]) expect(screen.getByText(safeValue)).toBeInTheDocument();
  for (const secret of ["provider-record-2468", "10.20.30.40", "audit-secret-token", "11223344", "raw-response-secret", "audit-provider-hash"]) {
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  }
});
