import type { AdminTransfer } from "@/types/admin";

export const NIUM_UNCAPPED_RISK = "additional_nium_charges_are_unknown_uncapped_and_not_reserved";

const decimal = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return (whole.replace(/^0+(?=\d)/, "") || "0") + (trimmed ? "." + trimmed : "");
};
const present = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const sameDecimal = (a: unknown, b: unknown) => decimal(a) !== null && decimal(a) === decimal(b);
const future = (value: unknown, now: number) => typeof value === "string" && Date.parse(value) > now;

// Compare every snapshot field without depending on JSON object key order.
export const sameSnapshot = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every((key) => Object.prototype.hasOwnProperty.call(b, key)
    && sameSnapshot((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
};

export const hasCurrentTransferDetail = (fetchedAt: number, now: number) =>
  fetchedAt > 0 && now >= fetchedAt && now - fetchedAt < 60_000;

export const isSgdLocal = (transfer: AdminTransfer) =>
  transfer.provider?.code?.toLowerCase() === "nium" && transfer.target_currency === "SGD";

export const canApproveSgdLocal = (transfer: AdminTransfer, adminId: number | undefined, fetchedAt: number, now: number): boolean => {
  const workflow = transfer.payout_workflow;
  const receipt = workflow?.customer_authorization;
  const instruction = receipt?.instruction;
  const terms = instruction?.financial_terms;
  const amounts = transfer.payout_amounts;
  if (adminId === undefined || adminId === transfer.user_id || !isSgdLocal(transfer)
    || transfer.source_currency !== "USD" || !["approval_required", "approved"].includes(transfer.status)
    || transfer.allowed_actions?.approve !== true || workflow?.checker_approval_allowed !== true
    || workflow.fx_lock_active !== true || workflow.state !== transfer.status
    || workflow.dispatch_owner !== "checker_approval" || workflow.dispatch_allowed !== false
    || workflow.recovery_kind != null
    || !Array.isArray(workflow.blockers) || workflow.blockers.length > 0
    || transfer.external_transfer_id || transfer.external_payment_id
    || !hasCurrentTransferDetail(fetchedAt, now)
    || !receipt || receipt.accepted_by !== transfer.user_id || receipt.basis !== "authenticated_customer_submit"
    || receipt.payment_terms_accepted !== true || receipt.purpose_confirmed !== true
    || !present(receipt.accepted_at) || !Number.isFinite(Date.parse(receipt.accepted_at!)) || Date.parse(receipt.accepted_at!) > now
    || !hash(receipt.submission_token) || receipt.submission_token !== workflow.submission_token
    || !instruction || !workflow.customer_instruction || !sameSnapshot(instruction, workflow.customer_instruction)
    || instruction.transfer_id !== transfer.id || instruction.transfer_no !== transfer.transfer_no
    || instruction.user_id !== transfer.user_id || instruction.provider_id !== transfer.provider_id
    || instruction.beneficiary_id !== transfer.beneficiary_id || !present(instruction.external_beneficiary_id)
    || !instruction.provider_context || !["client", "customer", "wallet", "base_url"].every((key) => present(instruction.provider_context?.[key]))
    || instruction.source_currency !== transfer.source_currency || instruction.destination_currency !== transfer.target_currency
    || instruction.payout_method !== "LOCAL" || !sameDecimal(instruction.source_amount, transfer.source_amount)
    || decimal(instruction.source_amount) === "0" || !present(instruction.purpose_code) || instruction.purpose_code !== transfer.purpose_code
    || (instruction.reference_text ?? null) !== (transfer.reference_text ?? null)
    || instruction.client_reference !== transfer.client_reference
    || !instruction.fx_quote_id || !present(instruction.audit_id)
    || !present(instruction.receiving_account?.name) || !present(instruction.receiving_account?.last_four)
    || !hash(instruction.receiving_account?.sha256) || !future(instruction.expires_at, now)
    || !amounts || !sameDecimal(amounts.fx_rate, instruction.rate) || decimal(instruction.rate) === "0"
    || Date.parse(amounts.fx_lock_expires_at ?? "") !== Date.parse(instruction.expires_at!)
    || !sameDecimal(amounts.source_amount, instruction.source_amount)
    || amounts.source_currency !== instruction.source_currency || amounts.destination_currency !== instruction.destination_currency
    || !terms || !future(terms.expires_at, now) || terms.fee_currency !== transfer.source_currency) return false;

  // The Backend checker capability validates the existing approval and unused FX lock.
  // actual_debit is not a dispatch flag: an uncapped approval can already project it.
  if (transfer.status === "approved" && !transfer.approvals?.some((approval) => approval.action === "approved"
    && approval.approver_user_id != null && approval.approver_user_id !== transfer.user_id)) return false;

  if (terms.funding_basis === "principal_only_pilot") {
    if (!present(terms.authorization_id) || !sameDecimal(terms.reservation_amount, instruction.source_amount)
      || terms.fee_status !== "unverified" || terms.fee_amount !== null || terms.total_wallet_debit !== null
      || workflow.provider_fee_status !== "unavailable" || amounts.transfer_fee !== null || amounts.total_wallet_debit !== null) return false;
    if (terms.policy === "one_time_uncapped") return terms.risk_acknowledgement === NIUM_UNCAPPED_RISK
      && receipt.risk_acknowledgement === NIUM_UNCAPPED_RISK && terms.pilot_reserve === null && terms.charge_ceiling === null;
    return terms.policy === undefined && terms.pilot_reserve?.currency === transfer.source_currency
      && decimal(terms.pilot_reserve.amount) !== null && decimal(terms.pilot_reserve.amount) !== "0"
      && sameDecimal(terms.pilot_reserve.amount, terms.pilot_reserve.charge_ceiling);
  }
  return present(terms.pricing_version) && hash(terms.intent_sha256)
    && workflow.provider_fee_status === "confirmed" && decimal(terms.fee_amount) === "0"
    && sameDecimal(terms.total_wallet_debit, instruction.source_amount)
    && sameDecimal(amounts.transfer_fee?.amount, terms.fee_amount) && amounts.transfer_fee?.currency === terms.fee_currency
    && sameDecimal(amounts.total_wallet_debit, terms.total_wallet_debit);
};

export const canApprove = (transfer: AdminTransfer) => present(transfer.provider?.code) && transfer.allowed_actions?.approve === true
  && (isSgdLocal(transfer) ? transfer.payout_workflow?.checker_approval_allowed === true
    && ["approval_required", "approved"].includes(transfer.status)
    : ["draft", "approval_required"].includes(transfer.status.toLowerCase())
      && !transfer.approvals?.some((approval) => approval.action === "approved"));

export const canReject = (transfer: AdminTransfer) => transfer.allowed_actions?.reject === true
  && ["draft", "approval_required", "approved"].includes(transfer.status.toLowerCase());

export const canSync = (transfer: AdminTransfer) => transfer.allowed_actions?.sync === true
  && (isSgdLocal(transfer) ? transfer.payout_workflow?.can_reconcile_status === true
    : Boolean(transfer.external_transfer_id || transfer.external_payment_id)
      && ["submitted", "pending", "completed", "failed"].includes(transfer.status.toLowerCase()));
