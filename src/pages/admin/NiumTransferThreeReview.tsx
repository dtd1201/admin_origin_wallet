import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type { AdminTransfer, AdminWalletAccount } from "@/types/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NIUM_UNCAPPED_RISK, hasCurrentPilotDetail, hasCurrentPilotFx } from "./niumTransferThree";

type Props = {
  transfer: AdminTransfer;
  fetchedAt: number;
  now: number;
  refreshing: boolean;
  detailError: boolean;
  submissionAttempted: boolean;
  refreshDetail: () => Promise<unknown>;
  onFeedback: (message: string) => void;
};

const timestamp = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? value : "Unavailable";

export default function NiumTransferThreeReview({ transfer, fetchedAt, now, refreshing, detailError, submissionAttempted, refreshDetail, onFeedback }: Props) {
  const { token, user } = useAuth();
  const preview = transfer.pilot_authorization_renewal;
  const [accepted, setAccepted] = useState(false);
  const [reference, setReference] = useState("");
  const started = useRef(false);
  const current = !refreshing && !detailError && hasCurrentPilotDetail(fetchedAt, now);
  const currentFx = hasCurrentPilotFx(transfer, now);
  const independent = user?.status === "active" && user.id !== transfer.user_id;
  const recognized = preview?.policy === "one_time_uncapped" && preview.risk_acknowledgement === NIUM_UNCAPPED_RISK;
  const canRenew = current && currentFx && independent && recognized && preview?.renewal_allowed === true
    && /^[a-f0-9]{64}$/.test(preview.confirmation_token ?? "") && !submissionAttempted;

  const wallets = useQuery({
    queryKey: ["admin", "transfer-3-funding", transfer.provider_id, transfer.user_id, token],
    enabled: !!token,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: () => requestApi<PaginatedResponse<AdminWalletAccount>>(
      `${adminEndpointConfig.wallets}?user_id=${transfer.user_id}&provider_id=${transfer.provider_id}&currency=USD`,
      { method: "GET", token },
    ),
  });

  const renewal = useMutation({
    retry: false,
    mutationFn: async () => {
      // Check wall time again: a suspended tab may not have rendered its expiry timer yet.
      if (!canRenew || !hasCurrentPilotDetail(fetchedAt, Date.now()) || !hasCurrentPilotFx(transfer, Date.now())) {
        throw new Error("FX or confirmation preview is stale. Refresh transfer detail and review the current terms.");
      }
      return requestApi<{ message?: string }>(`${adminEndpointConfig.transfers}/3/pilot-authorization/renew`, {
        method: "POST", token,
        body: {
          request_id: crypto.randomUUID(),
          confirmation_token: preview.confirmation_token,
          authorization_reference: reference.trim(),
          accept_uncapped_charges: true,
          risk_acknowledgement: NIUM_UNCAPPED_RISK,
        },
      });
    },
    onSuccess: () => onFeedback("New risk acceptance recorded for Transfer 3. Review the current Maker and Admin workflow status."),
    onError: (error) => onFeedback(`${error instanceof Error ? error.message : "Risk renewal could not be confirmed."} Fresh transfer detail is required before any further action; review the fetched terms and acknowledge again.`),
    onSettled: async () => {
      setAccepted(false);
      setReference("");
      // A rejected token or an uncertain response never triggers another POST.
      await refreshDetail();
    },
  });

  const walletRows = wallets.data?.data.filter((wallet) => wallet.user_id === transfer.user_id
    && wallet.provider_id === transfer.provider_id && wallet.currency === "USD") ?? [];

  return <section aria-label="NIUM Transfer 3 pilot review" className="space-y-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
    <h3 className="font-semibold">Transfer 3 — USD 5 to SGD LOCAL</h3>
    <p>Additional NIUM payout and bank charges are unknown, uncapped and not reserved. The expected USD 0 fee is internal only, not NIUM-confirmed. Actual fees and wallet debit require reconciliation afterward.</p>
    <dl className="grid gap-2 sm:grid-cols-2">
      <div><dt>Locked FX rate</dt><dd>{transfer.payout_amounts?.fx_rate ?? preview?.fx_rate ?? "Unavailable"}</dd></div>
      <div><dt>FX expiry</dt><dd>{timestamp(transfer.payout_amounts?.fx_lock_expires_at)}</dd></div>
      <div><dt>Pilot authorization</dt><dd>{preview?.state?.replace(/_/g, " ") ?? "Preview unavailable — refresh transfer detail"}</dd></div>
      <div><dt>Authorization ID</dt><dd className="break-all">{preview?.authorization_id ?? "Unavailable"}</dd></div>
      <div><dt>Risk acceptance expiry</dt><dd>{timestamp(preview?.expires_at)}</dd></div>
      <div><dt>Provider fee status</dt><dd>{preview?.provider_fee_status ?? "Unverified"}</dd></div>
      <div><dt>Internal expected fee (not provider verified)</dt><dd>{preview?.expected_fee ? `${preview.expected_fee.amount} ${preview.expected_fee.currency}` : "Unavailable"}</dd></div>
      <div><dt>Total wallet debit</dt><dd>Unverified</dd></div>
    </dl>
    {preview?.reason && <p role="status">{preview.reason}</p>}
    {transfer.payout_workflow?.blockers?.map((blocker) => <p key={blocker}>{blocker}</p>)}
    {!current && <p role="alert">Transfer detail or confirmation preview is stale or refreshing. Fetch fresh detail and review the terms again.</p>}
    {!currentFx && <p role="alert">FX is expired or unavailable. The Maker must restart the expired review, request a fresh FX lock, and explicitly confirm the new terms in their authenticated user workflow.</p>}
    {!independent && <p role="alert">An active independent Admin is required. The Maker cannot accept risk or approve their own transfer.</p>}
    {!submissionAttempted && transfer.payout_workflow?.checker_approval_allowed !== true && <p role="status">Maker action required: after risk acceptance, the Maker must confirm the current financial terms in their authenticated user workflow and click Submit. Admin cannot provide customer consent.</p>}
    {!submissionAttempted && transfer.payout_workflow?.checker_approval_allowed === true && <p role="status">Current Maker review is present. Admin approval is available when all backend permissions and current FX checks pass.</p>}
    {submissionAttempted && <p role="alert">An approval/submission was attempted. Do not resubmit. Refresh detail and use the existing outcome reconciliation process if the NIUM result is unknown.</p>}
    <div className="space-y-2 rounded-xl border border-amber-200 bg-white p-3">
      <h4 className="font-medium">Funding balance freshness</h4>
      <p>Wallet snapshots for this customer/provider are shown below. The backend verifies the bound source wallet and available principal; a fresh snapshot does not guarantee all NIUM charges are covered.</p>
      {wallets.isFetching && <p>Loading wallet snapshots…</p>}
      {wallets.isError && <p role="status">Wallet balance freshness unavailable. Refresh snapshots or ask an authorized wallet operator to synchronize the source balance separately.</p>}
      {!wallets.isFetching && !wallets.isError && walletRows.length === 0 && <p>Source-wallet balance snapshot unavailable.</p>}
      {walletRows.map((wallet) => {
        const asOf = Date.parse(wallet.last_reconciled_at ?? "");
        const fresh = Number.isFinite(asOf) && asOf <= now && now - asOf < 300_000;
        return <div key={wallet.id}>
          <p>Wallet {wallet.account_reference || wallet.id}: {String(wallet.available_balance)} USD available</p>
          <p>Balance as of: {timestamp(wallet.last_reconciled_at)} — {fresh ? "Fresh (under 5 minutes)" : "Stale or unverified — synchronize separately"}</p>
        </div>;
      })}
      {(wallets.data?.last_page ?? 1) > 1 && <p>Additional wallet snapshots are available in Wallets. No source wallet is inferred from this page.</p>}
      <Button variant="outline" disabled={wallets.isFetching} onClick={() => void wallets.refetch()}>Refresh balance snapshots</Button>
    </div>
    {preview?.renewal_allowed === true && <div className="space-y-3">
      <label className="block">Authorization reference
        <Input value={reference} maxLength={200} disabled={!canRenew || started.current} onChange={(event) => setReference(event.target.value)} />
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={accepted} disabled={!canRenew || started.current} onChange={(event) => setAccepted(event.target.checked)} />
        <span>I am an independent Admin. I reviewed the current FX rate and expiry and explicitly accept unknown, uncapped additional NIUM charges for Transfer 3. USD 0 is only an expectation.</span>
      </label>
      <Button disabled={!canRenew || !accepted || !reference.trim() || renewal.isPending || started.current} onClick={() => {
        if (started.current || !accepted || !reference.trim() || !canRenew) return;
        started.current = true;
        renewal.mutate();
      }}>Record new risk acceptance</Button>
    </div>}
    <Button variant="outline" disabled={refreshing || renewal.isPending} onClick={() => void refreshDetail()}>Refresh transfer detail</Button>
  </section>;
}
