import type { AdminTransfer } from "@/types/admin";

export const NIUM_UNCAPPED_RISK = "additional_nium_charges_are_unknown_uncapped_and_not_reserved";
export const PILOT_DETAIL_MAX_AGE_MS = 60_000;

export const isNiumTransferThree = (transfer: AdminTransfer) => transfer.id === 3
  && transfer.user_id === 12 && transfer.beneficiary_id === 9
  && transfer.provider?.code?.toLowerCase() === "nium"
  && transfer.source_currency === "USD" && transfer.target_currency === "SGD"
  && /^5(?:\.0+)?$/.test(String(transfer.source_amount));

export const hasCurrentPilotDetail = (fetchedAt: number, now: number) => fetchedAt > 0
  && now >= fetchedAt && now - fetchedAt < PILOT_DETAIL_MAX_AGE_MS;

export const hasCurrentPilotFx = (transfer: AdminTransfer, now: number) => {
  // The attached lock remains authoritative even if the renewal preview has a later expiry.
  const expiry = Date.parse(transfer.payout_amounts?.fx_lock_expires_at ?? "");
  const preview = transfer.pilot_authorization_renewal;
  const previewExpiry = preview?.expires_at;
  return typeof transfer.payout_amounts?.fx_rate === "string" && expiry > now
    && (!previewExpiry || Date.parse(previewExpiry) > now)
    && (!preview?.fx_rate || preview.fx_rate === transfer.payout_amounts.fx_rate)
    && (preview?.renewal_allowed !== true || (Date.parse(previewExpiry ?? "") === expiry && !!preview.fx_rate));
};

export const canApproveNiumTransferThree = (transfer: AdminTransfer, adminId: number | undefined, fetchedAt: number, now: number) =>
  isNiumTransferThree(transfer) && adminId !== undefined && adminId !== transfer.user_id
  && ["approval_required", "approved"].includes(transfer.status)
  && transfer.allowed_actions?.approve === true
  && transfer.payout_workflow?.checker_approval_allowed === true
  && transfer.pilot_authorization_renewal?.policy === "one_time_uncapped"
  && transfer.pilot_authorization_renewal?.risk_acknowledgement === NIUM_UNCAPPED_RISK
  && transfer.pilot_authorization_renewal?.renewal_allowed === false
  && !transfer.external_transfer_id && !transfer.external_payment_id
  && hasCurrentPilotDetail(fetchedAt, now) && hasCurrentPilotFx(transfer, now);
