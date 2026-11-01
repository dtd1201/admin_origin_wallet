import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminTransactions from "./AdminTransactions";
import type { AdminPayoutFinancialTerms, AdminPayoutInstruction, AdminTransfer } from "@/types/admin";
import { canApproveSgdLocal, canReject, canSync, NIUM_UNCAPPED_RISK, sameSnapshot } from "./niumTransferApproval";

const mocks = vi.hoisted(() => ({ requestApi: vi.fn(), user: { id: 20, status: "active" } }));
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), requestApi: mocks.requestApi }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ token: "admin-session", user: mocks.user }) }));

let detail: AdminTransfer;
let now: number;
const clients: QueryClient[] = [];
const posts = () => mocks.requestApi.mock.calls.filter(([, options]) => options?.method === "POST");
const gets = () => mocks.requestApi.mock.calls.filter(([url, options]) => url === "/admin/transfers/50" && options?.method === "GET");
const future = () => new Date(now + 600_000).toISOString();
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const instruction = () => detail.payout_workflow!.customer_authorization!.instruction!;
const ready = () => screen.getByRole("button", { name: "Approve & submit" });

// Shape follows TransferDetailResource, customerInstruction(), customer Submit receipt,
// NiumPayoutFinancialControls::assertFor() and NiumSgdLocalPayoutAmounts::forTransfer().
const fixture = (): AdminTransfer => {
  const accepted: AdminPayoutInstruction = {
    transfer_id: 50, transfer_no: "SYNTHETIC-NEW-SGD", user_id: 12, provider_id: 10,
    beneficiary_id: 9, external_beneficiary_id: "synthetic-beneficiary",
    provider_context: { client: "synthetic-client", customer: "synthetic-customer", wallet: "synthetic-wallet", base_url: "synthetic-provider-base" },
    source_currency: "USD", destination_currency: "SGD", source_amount: "5", purpose_code: "IR01801",
    client_reference: "SYNTHETIC-REFERENCE", reference_text: "Invoice 50", payout_method: "LOCAL",
    fx_quote_id: 81, audit_id: "123456", rate: "1.275939120", expires_at: future(),
    receiving_account: { name: "Synthetic Individual", bank: "Synthetic SG Bank", last_four: "6789", sha256: "c".repeat(64) },
    financial_terms: { pricing_version: "synthetic-confirmed-pricing", intent_sha256: "b".repeat(64),
      fee_currency: "USD", fee_amount: "0", total_wallet_debit: "5", expires_at: future(),
    },
  };
  return {
    id: 50, transfer_no: "SYNTHETIC-NEW-SGD", user_id: 12, provider_id: 10, beneficiary_id: 9,
    user: { id: 12, full_name: "Synthetic Customer", email: "synthetic@example.test", phone: null,
      status: "active", kyc_status: "approved", profile: null, roles: [] },
    provider: { id: 10, code: "nium", name: "Nium", status: "active" },
    beneficiary: { id: 9, full_name: "Synthetic Individual", bank_name: "Synthetic SG Bank", currency: "SGD", country_code: "SG", status: "active" },
    source_currency: "USD", target_currency: "SGD", source_amount: "5.00000000", transfer_type: "payout", status: "approval_required",
    purpose_code: "IR01801", reference_text: "Invoice 50", client_reference: "SYNTHETIC-REFERENCE", approvals: [],
    allowed_actions: { approve: true, reject: true, sync: true },
    payout_workflow: {
      state: "approval_required", fx_lock_active: true, checker_approval_allowed: true, blockers: [],
      provider_fee_status: "confirmed", dispatch_owner: "checker_approval", dispatch_allowed: false,
      submission_token: "a".repeat(64), customer_instruction: copy(accepted),
      customer_authorization: { accepted_by: 12, accepted_at: new Date(now - 1000).toISOString(),
        basis: "authenticated_customer_submit", payment_terms_accepted: true, purpose_confirmed: true,
        submission_token: "a".repeat(64), risk_acknowledgement: null, instruction: accepted },
      recovery_kind: null, recovery_review_requested_at: null, can_reconcile_status: false,
    },
    payout_amounts: { source_amount: "5.00000000", source_currency: "USD", destination_currency: "SGD",
      fx_rate: "1.275939120", fx_lock_expires_at: future(), transfer_fee: { amount: "0", currency: "USD" },
      total_wallet_debit: "5", actual_debit: null },
  };
};

const setTerms = (terms: AdminPayoutFinancialTerms | null) => {
  instruction().financial_terms = terms;
  detail.payout_workflow!.customer_instruction = copy(instruction());
};
const markApproved = () => {
  detail = { ...detail, status: "approved", approvals: [{ id: 1, transfer_id: 50, action: "approved", approver_user_id: 20 }],
    payout_workflow: { ...detail.payout_workflow, state: "approved" } };
};
const markOutcome = (status: string) => {
  detail = { ...detail, status, external_transfer_id: status === "pending" ? "SYNTHETIC-REFERENCE" : null,
    allowed_actions: { ...detail.allowed_actions, approve: false },
    payout_workflow: { ...detail.payout_workflow, state: status, checker_approval_allowed: false,
      can_reconcile_status: status === "pending", recovery_kind: status === "submission_unknown" ? "provider_reference_missing" : null },
    payout_amounts: { ...detail.payout_amounts, actual_debit: { state: "awaiting_evidence" } } };
};

beforeEach(() => {
  vi.resetAllMocks();
  now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unmocked HTTP is forbidden"))));
  mocks.user.id = 20; mocks.user.status = "active";
  detail = fixture();
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => {
    if (url === "/admin/transfers?page=1") return Promise.resolve({ data: [copy(detail)] });
    if (url === "/admin/transfers/50" && options?.method === "GET") return Promise.resolve(copy(detail));
    if (url === "/admin/transfers/50/approve" && options?.method === "POST") {
      markOutcome("pending");
      return Promise.resolve({ transfer: copy(detail) });
    }
    if (["/admin/transfers/50/reject", "/admin/transfers/50/sync-status"].includes(url) && options?.method === "POST") return Promise.resolve({ message: "ok" });
    throw new Error("Unexpected request: " + url);
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const openReview = async () => {
  // Prove this flow overrides global mutation retry configuration.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 2, retryDelay: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><AdminTransactions /></QueryClientProvider>);
  fireEvent.click((await screen.findAllByRole("button", { name: "Review" }))[0]);
  await screen.findByRole("region", { name: "Customer payment instruction" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh transfer detail" })).toBeEnabled());
  return client;
};
const expectAllowed = () => canApproveSgdLocal(detail, 20, now, now);

it("renders the saved acceptance, current FX, financial terms and customer-safe receiving account", async () => {
  await openReview();
  const review = within(screen.getByRole("region", { name: "Customer payment instruction" }));
  for (const text of ["Customer #12", "6789", "Synthetic Individual", "Synthetic SG Bank", "USD → SGD · SG · LOCAL",
    "5 USD", "SGD", "synthetic-confirmed-pricing", "confirmed", "Invoice 50", "IR01801", "0 USD"]) {
    expect(review.getAllByText(text).length).toBeGreaterThan(0);
  }
  expect(review.getAllByText("1.275939120")).toHaveLength(2);
  expect(screen.getByText("Synthetic Customer · synthetic@example.test")).toBeInTheDocument();
  expect(review.getByText("FX expiration").nextElementSibling?.textContent).not.toBe("Unavailable");
  expect(review.queryByText("synthetic-wallet")).not.toBeInTheDocument();
  expect(review.queryByText("c".repeat(64))).not.toBeInTheDocument();
});

it("independently approves and submits once, fetching fresh detail before the unchanged Admin POST", async () => {
  await openReview();
  await waitFor(() => expect(ready()).toBeEnabled());
  fireEvent.click(ready()); fireEvent.click(ready());
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(posts()[0]).toEqual(["/admin/transfers/50/approve", { method: "POST", token: "admin-session", body: {} }]);
  const postIndex = mocks.requestApi.mock.calls.findIndex(([, options]) => options?.method === "POST");
  expect(mocks.requestApi.mock.calls[postIndex - 1]).toEqual(["/admin/transfers/50", { method: "GET", token: "admin-session" }]);
  expect(screen.queryByRole("button", { name: /Record new risk|FX Lock|Refresh pricing|Dispatch/ })).not.toBeInTheDocument();
});

it("suppresses duplicate clicks while the preflight GET is unresolved", async () => {
  await openReview();
  const initial = mocks.requestApi.getMockImplementation()!;
  let resolve!: (value: AdminTransfer) => void;
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => url === "/admin/transfers/50"
    ? new Promise<AdminTransfer>((done) => { resolve = done; }) : initial(url, options));
  const count = gets().length;
  fireEvent.click(ready()); fireEvent.click(ready());
  expect(gets()).toHaveLength(count + 1);
  expect(posts()).toHaveLength(0);
  await act(async () => resolve(copy(detail)));
  await waitFor(() => expect(posts()).toHaveLength(1));
});

it.each(["timeout", "submission_unknown", "pending"])("does not retry approval automatically after %s", async (outcome) => {
  const initial = mocks.requestApi.getMockImplementation()!;
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => {
    if (url.endsWith("/approve")) {
      if (outcome === "timeout") return Promise.reject(new Error("Network timeout; outcome unknown"));
      markOutcome(outcome);
      return Promise.resolve({ transfer: copy(detail) });
    }
    return initial(url, options);
  });
  await openReview();
  fireEvent.click(ready());
  await waitFor(() => expect(posts()).toHaveLength(1));
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh transfer detail" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Refresh transfer detail" }));
  await waitFor(() => expect(ready()).toBeDisabled());
  expect(posts()).toHaveLength(1);
  expect(screen.getByText(/An approval\/submission was attempted/)).toBeInTheDocument();
  if (outcome === "submission_unknown") {
    expect(screen.getByText(/Provider outcome unknown/)).toBeInTheDocument();
    expect(screen.getByText("provider_reference_missing")).toBeInTheDocument();
  }
});

it("explicitly resumes an approved-before-dispatch outcome only after another fresh detail GET", async () => {
  const initial = mocks.requestApi.getMockImplementation()!;
  let attempts = 0;
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => {
    if (url.endsWith("/approve") && ++attempts === 1) {
      markApproved();
      return Promise.reject(new Error("Response lost after approval commit"));
    }
    return initial(url, options);
  });
  await openReview();
  fireEvent.click(ready());
  const resume = await screen.findByRole("button", { name: "Resume approved transfer" });
  await waitFor(() => expect(resume).toBeEnabled());
  expect(posts()).toHaveLength(1);
  const before = gets().length;
  fireEvent.click(resume); fireEvent.click(resume);
  await waitFor(() => expect(posts()).toHaveLength(2));
  expect(gets().length).toBeGreaterThan(before);
  expect(posts().every(([url]) => url === "/admin/transfers/50/approve")).toBe(true);
  await waitFor(() => expect(ready()).toBeDisabled());
});

it.each(["permission", "unknown", "claimed", "changed_instruction"])("blocks a stale resume when fresh Backend data reports %s", async (change) => {
  markApproved();
  await openReview();
  const resume = screen.getByRole("button", { name: "Resume approved transfer" });
  await waitFor(() => expect(resume).toBeEnabled());
  if (change === "permission") detail.allowed_actions!.approve = false;
  if (change === "unknown") markOutcome("submission_unknown");
  if (change === "claimed") {
    detail.payout_workflow!.checker_approval_allowed = false;
    detail.payout_amounts!.actual_debit = { state: "awaiting_evidence" };
  }
  if (change === "changed_instruction") instruction().receiving_account!.last_four = "1111";
  fireEvent.click(resume);
  await waitFor(() => expect(gets()).toHaveLength(2));
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh transfer detail" })).toBeEnabled());
  expect(posts()).toHaveLength(0);
});

it("blocks cached authorization when the fresh action GET fails, and requires explicit refresh", async () => {
  await openReview();
  const initial = mocks.requestApi.getMockImplementation()!;
  mocks.requestApi.mockImplementation((url: string, options?: { method?: string }) => url === "/admin/transfers/50"
    ? Promise.reject(new Error("Fresh detail unavailable")) : initial(url, options));
  fireEvent.click(ready());
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh transfer detail" })).toBeEnabled());
  expect(ready()).toBeDisabled();
  expect(posts()).toHaveLength(0);
  mocks.requestApi.mockImplementation(initial);
  fireEvent.click(screen.getByRole("button", { name: "Refresh transfer detail" }));
  await waitFor(() => expect(ready()).toBeEnabled());
  expect(posts()).toHaveLength(0);
});

it("does not let a cached permission authorize a changed accepted instruction", async () => {
  await openReview();
  instruction().reference_text = "Changed reference";
  detail.reference_text = "Changed reference";
  detail.payout_workflow!.customer_instruction = copy(instruction());
  fireEvent.click(ready());
  await waitFor(() => expect(screen.getAllByText("Changed reference").length).toBeGreaterThan(0));
  expect(posts()).toHaveLength(0);
});

it("checks wall-clock expiry when a tab was suspended before the click", async () => {
  await openReview();
  now += 600_001;
  fireEvent.click(ready());
  await waitFor(() => expect(gets()).toHaveLength(2));
  expect(posts()).toHaveLength(0);
});

it.each(["draft", "pending", "submitting", "processing", "submission_unknown", "failed", "cancelled", "rejected", "completed"])("blocks %s despite stale positive flags", async (status) => {
  detail.status = status;
  await openReview();
  expect(ready()).toBeDisabled();
  expect(posts()).toHaveLength(0);
});

it.each(["missing_instruction", "missing_terms", "expired_fx", "self_checker", "denied", "inactive", "blocker"])("blocks approval in the UI for %s", async (change) => {
  if (change === "missing_instruction") detail.payout_workflow!.customer_authorization!.instruction = null;
  if (change === "missing_terms") setTerms(null);
  if (change === "expired_fx") detail.payout_amounts!.fx_lock_expires_at = new Date(now - 1).toISOString();
  if (change === "self_checker") mocks.user.id = 12;
  if (change === "denied") detail.allowed_actions!.approve = false;
  if (change === "inactive") mocks.user.status = "inactive";
  if (change === "blocker") detail.payout_workflow!.blockers = ["Verified source-wallet funding is unavailable"];
  await openReview();
  expect(ready()).toBeDisabled();
  expect(posts()).toHaveLength(0);
  if (change === "missing_instruction") expect(screen.getByText(/Accepted customer instruction unavailable/)).toBeInTheDocument();
  if (change === "missing_terms") expect(screen.queryByText("0 USD")).not.toBeInTheDocument();
  if (change === "blocker") expect(screen.getByText("Verified source-wallet funding is unavailable")).toBeInTheDocument();
});

it("renders and accepts only the Backend-authorized unknown-fee pilot without calling its fees verified or zero", async () => {
  setTerms({ funding_basis: "principal_only_pilot", policy: "one_time_uncapped", authorization_id: "synthetic-grant",
    authorization_reference: "synthetic-risk-reference", expires_at: future(), reservation_amount: "5", fee_currency: "USD",
    fee_status: "unverified", fee_amount: null, total_wallet_debit: null, pilot_reserve: null,
    charge_ceiling: null, risk_acknowledgement: NIUM_UNCAPPED_RISK });
  detail.payout_workflow!.customer_authorization!.risk_acknowledgement = NIUM_UNCAPPED_RISK;
  detail.payout_workflow!.provider_fee_status = "unavailable";
  detail.payout_amounts!.transfer_fee = null; detail.payout_amounts!.total_wallet_debit = null;
  expect(expectAllowed()).toBe(true);
  await openReview();
  expect(ready()).toBeEnabled();
  expect(screen.getByText(/additional NIUM charges are unknown, uncapped and not reserved/)).toBeInTheDocument();
  expect(screen.queryByText("0 USD")).not.toBeInTheDocument();
  expect(screen.getAllByText("Unavailable / unverified")).toHaveLength(2);
  markApproved();
  // The Backend projects uncapped exposure at approval, even before dispatch claim.
  detail.payout_amounts!.actual_debit = { state: "awaiting_evidence", pilot_charge_exposure: "uncapped" };
  expect(expectAllowed()).toBe(true);
  detail.payout_workflow!.customer_authorization!.risk_acknowledgement = null;
  expect(expectAllowed()).toBe(false);
});

it("fails closed for missing, incomplete, expired, conflicting or blocked Backend projections", () => {
  expect(expectAllowed()).toBe(true);
  expect(canApproveSgdLocal(detail, 12, now, now)).toBe(false);
  expect(canApproveSgdLocal(detail, undefined, now, now)).toBe(false);
  expect(canApproveSgdLocal(detail, 20, now - 60_000, now)).toBe(false);
  const baseline = copy(detail);
  const changes: Array<(value: AdminTransfer) => void> = [
    (t) => { t.provider = null; },
    (t) => { t.allowed_actions = undefined; },
    (t) => { t.allowed_actions!.approve = false; },
    (t) => { t.payout_workflow = undefined; },
    (t) => { t.payout_workflow!.checker_approval_allowed = false; },
    (t) => { t.payout_workflow!.customer_instruction = null; },
    (t) => { t.payout_workflow!.customer_authorization = null; },
    (t) => { t.payout_workflow!.customer_authorization!.instruction = null; },
    (t) => { t.payout_workflow!.customer_authorization!.accepted_by = 99; },
    (t) => { t.payout_workflow!.customer_authorization!.accepted_at = "invalid"; },
    (t) => { t.payout_workflow!.customer_authorization!.payment_terms_accepted = false; },
    (t) => { t.payout_workflow!.customer_authorization!.purpose_confirmed = false; },
    (t) => { t.payout_workflow!.submission_token = "d".repeat(64); },
    (t) => { t.payout_workflow!.fx_lock_active = false; },
    (t) => { t.payout_workflow!.state = "lock_unknown"; },
    (t) => { t.payout_workflow!.dispatch_owner = "customer_submit"; },
    (t) => { t.payout_workflow!.recovery_kind = "fx_outcome_unknown"; },
    (t) => { t.payout_workflow!.blockers = ["Financial admission blocked"]; },
    (t) => { t.payout_workflow!.blockers = undefined; },
    (t) => { t.payout_amounts = undefined; },
    (t) => { t.payout_amounts!.fx_rate = "1.99"; },
    (t) => { t.payout_amounts!.fx_lock_expires_at = new Date(now - 1).toISOString(); },
    (t) => { t.payout_amounts!.transfer_fee = null; },
    (t) => { t.payout_amounts!.total_wallet_debit = null; },
    (t) => { t.payout_workflow!.provider_fee_status = "unavailable"; },
    (t) => { t.external_transfer_id = "already-dispatched"; },
    (t) => { t.external_payment_id = "already-dispatched"; },
    (t) => { t.purpose_code = "changed"; },
    (t) => { t.source_amount = "10"; },
    (t) => { t.beneficiary_id = 99; },
  ];
  changes.forEach((change) => { detail = copy(baseline); change(detail); expect(expectAllowed()).toBe(false); });
  for (const change of [
    { financial_terms: null }, { expires_at: new Date(now - 1).toISOString() }, { reference_text: "changed" },
    { financial_terms: { ...baseline.payout_workflow!.customer_instruction!.financial_terms!, expires_at: new Date(now - 1).toISOString() } },
    { financial_terms: { ...baseline.payout_workflow!.customer_instruction!.financial_terms!, fee_amount: "1", total_wallet_debit: "6" } },
  ]) {
    detail = copy(baseline);
    Object.assign(instruction(), change);
    detail.payout_workflow!.customer_instruction = copy(instruction());
    expect(expectAllowed()).toBe(false);
  }
});

it.each([undefined, false])("does not infer reject/sync permission when allowed_actions is %s", async (permission) => {
  detail.status = "pending"; detail.external_transfer_id = "SYNTHETIC-REFERENCE";
  detail.allowed_actions = permission === undefined ? undefined : { reject: false, sync: false };
  detail.payout_workflow!.can_reconcile_status = true;
  await openReview();
  expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Sync" })).not.toBeInTheDocument();
  expect(posts()).toHaveLength(0);
});

it("rechecks reject permission after confirmation before posting", async () => {
  await openReview();
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  detail.allowed_actions!.reject = false;
  fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
  await waitFor(() => expect(gets()).toHaveLength(2));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument());
  expect(posts()).toHaveLength(0);
});

it("rechecks sync permission from fresh detail before posting", async () => {
  markOutcome("pending");
  const client = await openReview();
  // Close the review so the queue's status action is accessible.
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  detail.allowed_actions!.sync = false;
  fireEvent.click(screen.getAllByRole("button", { name: "Sync" })[0]);
  await waitFor(() => expect(gets()).toHaveLength(2));
  await waitFor(() => expect(client.getQueryData<AdminTransfer>(["admin", "transfer", 50, "admin-session"])?.allowed_actions?.sync).toBe(false));
  expect(posts()).toHaveLength(0);
});

it("permits status reconciliation only with both Backend capability and permission", () => {
  markOutcome("submission_unknown");
  detail.external_transfer_id = "SYNTHETIC-REFERENCE";
  detail.payout_workflow!.can_reconcile_status = true;
  expect(canSync(detail)).toBe(true);
  detail.allowed_actions!.sync = false;
  expect(canSync(detail)).toBe(false);
  detail.allowed_actions!.sync = true; detail.payout_workflow!.can_reconcile_status = false;
  expect(canSync(detail)).toBe(false);
  expect(canReject(detail)).toBe(false);
  detail.status = "approval_required";
  expect(canReject(detail)).toBe(true);
  detail.allowed_actions!.reject = false;
  expect(canReject(detail)).toBe(false);
});

it.each(["5", "10"])("preserves HK/HK/USD SWIFT approval for USD %s with confirmation and one empty-payload POST", async (amount) => {
  detail = { ...detail, source_amount: amount, target_currency: "USD", target_amount: amount,
    beneficiary: { id: 9, full_name: "Synthetic HK Beneficiary", bank_name: "Synthetic HK Bank", country_code: "HK", currency: "USD", status: "active" },
    payout_workflow: undefined, payout_amounts: undefined };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 2, retryDelay: 0 } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><AdminTransactions /></QueryClientProvider>);
  fireEvent.click((await screen.findAllByRole("button", { name: "Review" }))[0]);
  await screen.findByText("Synthetic HK Beneficiary");
  await waitFor(() => expect(ready()).toBeEnabled());
  expect(screen.queryByRole("region", { name: "Customer payment instruction" })).not.toBeInTheDocument();
  fireEvent.click(ready());
  expect(posts()).toHaveLength(0);
  const confirmation = screen.getByRole("alertdialog");
  const approve = within(confirmation).getByRole("button", { name: "Approve & submit" });
  fireEvent.click(approve); fireEvent.click(approve);
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(posts()[0]).toEqual(["/admin/transfers/50/approve", { method: "POST", token: "admin-session", body: {} }]);
  // SWIFT/SHA construction remains Backend-owned; Admin adds no rail/fee overrides.
  expect(posts()[0][1].body).toEqual({});
});

it("compares the complete immutable snapshot independently of JSON object key order", () => {
  const accepted = instruction();
  detail.payout_workflow!.customer_instruction = Object.fromEntries(Object.entries(accepted).reverse());
  expect(expectAllowed()).toBe(true);
  expect(sameSnapshot(["USD", "SGD"], { 0: "USD", 1: "SGD" })).toBe(false);
  detail.payout_workflow!.customer_instruction!.receiving_account = { ...accepted.receiving_account, sha256: "d".repeat(64) };
  expect(expectAllowed()).toBe(false);
});

it("honors the Backend-authorized funded reserve without inventing a confirmed provider fee", () => {
  setTerms({ funding_basis: "principal_only_pilot", authorization_id: "synthetic-funded-grant", expires_at: future(),
    reservation_amount: "5", fee_currency: "USD", fee_status: "unverified", fee_amount: null, total_wallet_debit: null,
    pilot_reserve: { currency: "USD", amount: "20", charge_ceiling: "20" } });
  detail.payout_workflow!.provider_fee_status = "unavailable";
  detail.payout_amounts!.transfer_fee = null; detail.payout_amounts!.total_wallet_debit = null;
  expect(expectAllowed()).toBe(true);
  setTerms({ ...instruction().financial_terms, pilot_reserve: null });
  expect(expectAllowed()).toBe(false);
});

it("posts one authorized rejection after a fresh detail check", async () => {
  await openReview();
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(posts()[0]).toEqual(["/admin/transfers/50/reject", { method: "POST", token: "admin-session", body: {} }]);
  expect(gets().length).toBeGreaterThanOrEqual(2);
});

it("posts one authorized status reconciliation without an approval or dispatch request", async () => {
  markOutcome("submission_unknown");
  detail.external_transfer_id = "SYNTHETIC-REFERENCE";
  detail.payout_workflow!.can_reconcile_status = true;
  await openReview();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  const sync = screen.getAllByRole("button", { name: "Sync" })[0];
  fireEvent.click(sync); fireEvent.click(sync);
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(posts()[0]).toEqual(["/admin/transfers/50/sync-status", { method: "POST", token: "admin-session", body: {} }]);
});

it.each(["maker", "denied", "already_approved"])("preserves SWIFT maker/checker and idempotent approval guards: %s", async (condition) => {
  detail.target_currency = "USD";
  detail.payout_workflow = undefined; detail.payout_amounts = undefined;
  detail.beneficiary = { ...detail.beneficiary, country_code: "HK", currency: "USD" };
  if (condition === "maker") mocks.user.id = detail.user_id;
  if (condition === "denied") detail.allowed_actions!.approve = false;
  if (condition === "already_approved") {
    detail.status = "approved";
    detail.approvals = [{ id: 1, transfer_id: 50, action: "approved", approver_user_id: 20 }];
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><AdminTransactions /></QueryClientProvider>);
  fireEvent.click((await screen.findAllByRole("button", { name: "Review" }))[0]);
  await screen.findByText("Synthetic Individual");
  if (condition === "maker") expect(ready()).toBeDisabled();
  else expect(screen.queryByRole("button", { name: "Approve & submit" })).not.toBeInTheDocument();
  expect(posts()).toHaveLength(0);
});
