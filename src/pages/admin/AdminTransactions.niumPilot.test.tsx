import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminTransactions from "./AdminTransactions";
import { ApiRequestError } from "@/lib/api";
import type { AdminTransfer } from "@/types/admin";
import { canApproveNiumTransferThree, hasCurrentPilotDetail, hasCurrentPilotFx, NIUM_UNCAPPED_RISK } from "./niumTransferThree";

const mocks = vi.hoisted(() => ({ requestApi: vi.fn(), user: { id: 20, status: "active" } }));
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), requestApi: mocks.requestApi }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "existing-admin-session", user: mocks.user }) }));

let detail: AdminTransfer;
let now: number;
const future = () => new Date(now + 600_000).toISOString();
const postCalls = () => mocks.requestApi.mock.calls.filter(([, options]) => options?.method === "POST");
const detailCalls = () => mocks.requestApi.mock.calls.filter(([url]) => url === "/admin/transfers/3");

beforeEach(() => {
  vi.resetAllMocks();
  now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "106b0fcb-f928-47d0-b2fb-46d99b75985c") });
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unmocked HTTP is forbidden"))));
  mocks.user.id = 20;
  mocks.user.status = "active";
  detail = {
    id: 3, transfer_no: "TRF-PILOT-3", user_id: 12, provider_id: 10, beneficiary_id: 9,
    provider: { id: 10, code: "nium", name: "Nium", status: "active" },
    beneficiary: { full_name: "Andy", currency: "SGD", country_code: "SG", status: "active" },
    source_currency: "USD", target_currency: "SGD", source_amount: "5.00000000", transfer_type: "payout", status: "draft",
    approvals: [{ id: 1, transfer_id: 3, action: "approved" }], // Historical approval never enables a new dispatch.
    allowed_actions: { approve: false },
    payout_workflow: { state: "locked", checker_approval_allowed: false },
    payout_amounts: { fx_rate: "1.275939120", fx_lock_expires_at: future(), transfer_fee: null, total_wallet_debit: null },
    pilot_authorization_renewal: {
      policy: "one_time_uncapped", risk_acknowledgement: NIUM_UNCAPPED_RISK,
      expected_fee: { amount: "0", currency: "USD", basis: "internal_expectation_not_provider_verified" },
      provider_fee_status: "unverified", total_wallet_debit: null, renewal_allowed: true,
      state: "explicit_risk_renewal_required", authorization_id: "original-grant", fx_quote_id: 4,
      fx_rate: "1.275939120", expires_at: future(), confirmation_token: "a".repeat(64),
    },
  };
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => {
    if (url === "/admin/transfers?page=1") return Promise.resolve({ data: [detail] });
    if (url === "/admin/transfers/3" && options?.method === "GET") return Promise.resolve(detail);
    if (url === "/admin/wallets?user_id=12&provider_id=10&currency=USD") return Promise.resolve({
      data: [{ id: 1, user_id: 12, provider_id: 10, currency: "USD", available_balance: "5.00000000",
        account_reference: "pilot-wallet", last_reconciled_at: new Date(now - 30_000).toISOString() }], last_page: 1,
    });
    throw new Error(`Unexpected mocked request: ${options?.method} ${url}`);
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const openReview = async () => {
  // Deliberately enable global mutation retries; payout and renewal must override them.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 2, retryDelay: 0 } } });
  render(<QueryClientProvider client={client}><AdminTransactions /></QueryClientProvider>);
  fireEvent.click((await screen.findAllByRole("button", { name: "Review" }))[0]);
  await screen.findByRole("region", { name: "NIUM Transfer 3 pilot review" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh transfer detail" })).toBeEnabled());
  return client;
};

const acceptRisk = () => {
  fireEvent.change(screen.getByRole("textbox", { name: "Authorization reference" }), { target: { value: "RISK-REVIEW-3" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /I am an independent Admin/ }));
};

const markMakerReviewed = () => {
  detail = { ...detail, status: "approval_required", allowed_actions: { approve: true },
    payout_workflow: { state: "approval_required", checker_approval_allowed: true },
    pilot_authorization_renewal: { ...detail.pilot_authorization_renewal!, renewal_allowed: false,
      state: "blocked", reason: "Current maker review is present", confirmation_token: undefined } };
};

it("uses the existing Admin session and exact server token, then refreshes without Maker or dispatch requests", async () => {
  const initial = mocks.requestApi.getMockImplementation()!;
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => {
    if (url.endsWith("/pilot-authorization/renew")) {
      now += 1;
      detail = { ...detail, pilot_authorization_renewal: { ...detail.pilot_authorization_renewal!, renewal_allowed: false, state: "current_authorization", confirmation_token: undefined } };
      return Promise.resolve({ message: "Risk acceptance recorded" });
    }
    return initial(url, options);
  });
  await openReview();
  expect(screen.getByText("1.275939120")).toBeInTheDocument();
  expect(screen.getByText(/5.00000000 USD available/)).toBeInTheDocument();
  expect(await screen.findByText(/Fresh \(under 5 minutes\)/)).toBeInTheDocument();
  expect(screen.getByText(/expected USD 0 fee is internal only/)).toBeInTheDocument();
  const renew = screen.getByRole("button", { name: "Record new risk acceptance" });
  expect(renew).toBeDisabled();
  expect(screen.getByRole("button", { name: "Approve & submit" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Authorization reference" }), { target: { value: "RISK-REVIEW-3" } });
  expect(renew).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(renew);
  fireEvent.click(renew);
  await waitFor(() => expect(detailCalls()).toHaveLength(2));
  expect(postCalls()).toEqual([["/admin/transfers/3/pilot-authorization/renew", {
    method: "POST", token: "existing-admin-session", body: {
      request_id: "106b0fcb-f928-47d0-b2fb-46d99b75985c", confirmation_token: "a".repeat(64),
      authorization_reference: "RISK-REVIEW-3", accept_uncapped_charges: true, risk_acknowledgement: NIUM_UNCAPPED_RISK,
    },
  }]]);
  expect(screen.getByText(/Maker action required/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve & submit" })).toBeDisabled();
});

it.each(["expired", "mismatched_rate", "missing_token", "unknown_risk", "maker", "inactive_admin"])("blocks unsafe renewal: %s", async (failure) => {
  if (failure === "expired") detail.payout_amounts!.fx_lock_expires_at = new Date(now - 1).toISOString();
  if (failure === "mismatched_rate") detail.pilot_authorization_renewal!.fx_rate = "1.999999999";
  if (failure === "missing_token") delete detail.pilot_authorization_renewal!.confirmation_token;
  if (failure === "unknown_risk") detail.pilot_authorization_renewal!.risk_acknowledgement = "zero_fees_verified";
  if (failure === "maker") mocks.user.id = 12;
  if (failure === "inactive_admin") mocks.user.status = "inactive";
  await openReview();
  expect(screen.getByRole("button", { name: "Record new risk acceptance" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Approve & submit" })).toBeDisabled();
  expect(postCalls()).toHaveLength(0);
});

it("rejects a preview that ages while the tab is suspended and fetches fresh detail before another acknowledgement", async () => {
  await openReview();
  acceptRisk();
  now += 60_001;
  fireEvent.click(screen.getByRole("button", { name: "Record new risk acceptance" }));
  await waitFor(() => expect(detailCalls()).toHaveLength(2));
  expect(postCalls()).toHaveLength(0);
  await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
});

it("refreshes rejected confirmation tokens, clears acknowledgement, and never retries the renewal POST", async () => {
  const initial = mocks.requestApi.getMockImplementation()!;
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => {
    if (url.endsWith("/pilot-authorization/renew")) {
      now += 1;
      detail = { ...detail, pilot_authorization_renewal: { ...detail.pilot_authorization_renewal!, confirmation_token: "b".repeat(64) } };
      return Promise.reject(new ApiRequestError("Confirmation token changed", 422));
    }
    return initial(url, options);
  });
  await openReview();
  acceptRisk();
  fireEvent.click(screen.getByRole("button", { name: "Record new risk acceptance" }));
  await waitFor(() => expect(detailCalls()).toHaveLength(2));
  await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
  expect(screen.getByRole("button", { name: "Record new risk acceptance" })).toBeDisabled();
  expect(postCalls()).toHaveLength(1);
});

it.each(["timeout", "submission_unknown", "pending"])("fences double approval and never retries %s", async (outcome) => {
  markMakerReviewed();
  const initial = mocks.requestApi.getMockImplementation()!;
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => {
    if (url.endsWith("/approve")) {
      if (outcome === "timeout") return Promise.reject(new Error("Network timeout; outcome unknown"));
      detail = { ...detail, status: outcome, allowed_actions: { approve: false } };
      return Promise.resolve({ transfer: detail });
    }
    return initial(url, options);
  });
  await openReview();
  const approve = screen.getByRole("button", { name: "Approve & submit" });
  expect(approve).toBeEnabled();
  fireEvent.click(approve);
  expect(postCalls()).toHaveLength(0);
  const confirm = await screen.findByRole("button", { name: "Approve & submit" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(postCalls()).toHaveLength(1));
  await waitFor(() => expect(detailCalls().length).toBeGreaterThanOrEqual(2));
  expect(screen.getByRole("button", { name: "Approve & submit" })).toBeDisabled();
  expect(screen.getByText(/An approval\/submission was attempted/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh transfer detail" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Refresh transfer detail" }));
  await waitFor(() => expect(detailCalls().length).toBeGreaterThanOrEqual(3));
  expect(postCalls()).toHaveLength(1);
});

it("disables approval again if FX expires while the confirmation dialog is open", async () => {
  markMakerReviewed();
  await openReview();
  fireEvent.click(screen.getByRole("button", { name: "Approve & submit" }));
  now += 600_001;
  fireEvent.click(screen.getByRole("button", { name: "Approve & submit" }));
  await waitFor(() => expect(detailCalls()).toHaveLength(2));
  expect(postCalls()).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Approve & submit" })).toBeDisabled();
});

it("closes an old confirmation when a detail refresh changes the reviewed FX terms", async () => {
  markMakerReviewed();
  const client = await openReview();
  fireEvent.click(screen.getByRole("button", { name: "Approve & submit" }));
  expect(await screen.findByRole("heading", { name: "Approve and submit this transfer?" })).toBeInTheDocument();
  const changed = { ...detail, payout_amounts: { ...detail.payout_amounts, fx_rate: "1.300000001" },
    pilot_authorization_renewal: { ...detail.pilot_authorization_renewal!, fx_rate: "1.300000001", authorization_revision: "new-risk-revision" } };
  act(() => { client.setQueryData(["admin", "transfer", 3, "existing-admin-session"], changed); });
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Approve and submit this transfer?" })).not.toBeInTheDocument());
  expect(screen.getByText("1.300000001")).toBeInTheDocument();
  expect(screen.getByText(/Transfer detail changed/)).toBeInTheDocument();
  expect(postCalls()).toHaveLength(0);
});

it("shows stale funding as stale without synchronizing balances or enabling a backend-blocked approval", async () => {
  const initial = mocks.requestApi.getMockImplementation()!;
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => url.startsWith("/admin/wallets?")
    ? Promise.resolve({ data: [{ id: 1, user_id: 12, provider_id: 10, currency: "USD", available_balance: "4.99", last_reconciled_at: new Date(now - 600_000).toISOString() }] })
    : initial(url, options));
  await openReview();
  expect(await screen.findByText(/Stale or unverified/)).toBeInTheDocument();
  expect(screen.getByText(/4.99 USD available/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve & submit" })).toBeDisabled();
  expect(postCalls()).toHaveLength(0);
});

it("blocks cached approval permissions when a fresh detail fetch fails", async () => {
  markMakerReviewed();
  await openReview();
  const initial = mocks.requestApi.getMockImplementation()!;
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => url === "/admin/transfers/3"
    ? Promise.reject(new Error("Fresh detail unavailable")) : initial(url, options));
  fireEvent.click(screen.getByRole("button", { name: "Refresh transfer detail" }));
  await screen.findByText("Fresh detail unavailable");
  expect(screen.getByRole("button", { name: "Approve & submit" })).toBeDisabled();
  expect(postCalls()).toHaveLength(0);
});

it("blocks a mismatched Transfer 3 binding instead of falling back to legacy approval", async () => {
  markMakerReviewed();
  detail = { ...detail, beneficiary_id: 8 };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AdminTransactions /></QueryClientProvider>);
  fireEvent.click((await screen.findAllByRole("button", { name: "Review" }))[0]);
  await screen.findByText(/Pilot transfer binding does not match/);
  expect(screen.getByRole("button", { name: "Approve & submit" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Record new risk acceptance" })).not.toBeInTheDocument();
  expect(postCalls()).toHaveLength(0);
});

it("does not expose pilot renewal for another transfer", async () => {
  detail = { ...detail, id: 4 };
  const initial = mocks.requestApi.getMockImplementation()!;
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => url === "/admin/transfers/4"
    ? Promise.resolve(detail) : initial(url, options));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AdminTransactions /></QueryClientProvider>);
  fireEvent.click((await screen.findAllByRole("button", { name: "Review" }))[0]);
  await screen.findByText("Andy");
  expect(screen.queryByRole("region", { name: "NIUM Transfer 3 pilot review" })).not.toBeInTheDocument();
  expect(mocks.requestApi.mock.calls.some(([url]) => url.startsWith("/admin/wallets?"))).toBe(false);
  expect(postCalls()).toHaveLength(0);
});

it("requires independent backend approval flags and exact fresh FX, preserving historical approvals", () => {
  markMakerReviewed();
  expect(canApproveNiumTransferThree(detail, 20, now, now)).toBe(true);
  expect(canApproveNiumTransferThree(detail, 12, now, now)).toBe(false);
  expect(canApproveNiumTransferThree({ ...detail, allowed_actions: undefined }, 20, now, now)).toBe(false);
  expect(canApproveNiumTransferThree({ ...detail, payout_workflow: { checker_approval_allowed: false } }, 20, now, now)).toBe(false);
  expect(canApproveNiumTransferThree({ ...detail, beneficiary_id: 8 }, 20, now, now)).toBe(false);
  expect(canApproveNiumTransferThree({ ...detail, provider: null }, 20, now, now)).toBe(false);
  expect(canApproveNiumTransferThree({ ...detail, pilot_authorization_renewal: null }, 20, now, now)).toBe(false);
  expect(canApproveNiumTransferThree({ ...detail, external_transfer_id: "already-dispatched" }, 20, now, now)).toBe(false);
  expect(hasCurrentPilotDetail(now, now + 60_000)).toBe(false);
  expect(hasCurrentPilotFx(detail, now + 600_000)).toBe(false);
});
