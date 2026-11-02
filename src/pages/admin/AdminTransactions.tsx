import { ProviderLogo } from "@/components/shared/ProviderLogo";
import { getProviderDisplayName } from "@/lib/providerDisplay";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Clock3, Eye, ReceiptText, RefreshCcw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi } from "@/lib/api";
import type { AdminTransfer } from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { canApprove, canApproveSgdLocal, canReject, canSync, hasCurrentTransferDetail, isSgdLocal, sameSnapshot } from "./niumTransferApproval";

type TransferAction = "approve" | "reject";

const transferProviderLabel = (provider: AdminTransfer["provider"]) => provider
  ? getProviderDisplayName({ ...provider, name: provider.name?.trim() || provider.code?.trim() || "Unknown provider" })
  : "Unknown provider";

const workflowStatusLabels: Record<string, string> = {
  approval_required: "Approval required",
  pending: "Pending",
  submitted: "Submitted",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  submission_unknown: "Submission unknown",
};

export const displayTransferIdentifier = (value?: string | number | null) => {
  const text = String(value ?? "").trim();
  return text || "-";
};

export const transferStatusLabel = (status: string) =>
  workflowStatusLabels[status.toLowerCase()] ?? status.replace(/_/g, " ");

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const formatAmount = (amount?: string | number | null, currency?: string | null) => {
  if (amount === null || amount === undefined || amount === "") return "-";
  const numeric = Number(amount);
  const formatted = Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(numeric)
    : String(amount);

  return `${formatted} ${currency || ""}`.trim();
};

const statusClassName = (status: string) => {
  const normalized = status.toLowerCase();

  if (normalized === "approval_required") return "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-50";

  if (["completed", "approved"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50";
  }

  if (["failed", "cancelled", "rejected"].includes(normalized)) {
    return "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-50";
  }

  if (["approval_required", "pending", "submitted"].includes(normalized)) {
    return "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-50";
  }

  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

type TransferListResponse = {
  data: AdminTransfer[];
  current_page?: number;
  last_page?: number;
  total?: number;
  meta?: {
    current_page?: number;
    last_page?: number;
    total?: number;
  };
};

const AdminTransactions = () => {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [selectedTransferId, setSelectedTransferId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<TransferAction | null>(null);
  const [now, setNow] = useState(Date.now);
  const attemptedApprovals = useRef(new Set<number>());
  const actionInFlight = useRef(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [failedPreflightId, setFailedPreflightId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedTransferId === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selectedTransferId]);

  const transfersQuery = useQuery({
    queryKey: ["admin", "transfers", page, token],
    enabled: !!token,
    queryFn: async () =>
      requestApi<TransferListResponse>(`${adminEndpointConfig.transfers}?page=${page}`, { method: "GET", token }),
  });

  const transferDetailQuery = useQuery({
    queryKey: ["admin", "transfer", selectedTransferId, token],
    enabled: !!token && selectedTransferId !== null,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => requestApi<AdminTransfer>(`${adminEndpointConfig.transfers}/${selectedTransferId}`, { method: "GET", token }),
  });

  const invalidateTransfers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "transfers"] });
  };

  const approveMutation = useMutation({
    retry: false,
    mutationFn: async (transferId: number) =>
      requestApi<{ message?: string; transfer?: AdminTransfer }>(`${adminEndpointConfig.transfers}/${transferId}/approve`, {
        method: "POST",
        token,
        body: {},
      }),
    onSuccess: async (response, transferId) => {
      await invalidateTransfers();
      await queryClient.invalidateQueries({ queryKey: ["admin", "transfer", transferId, token] });
      toast({
        title: response.transfer?.status === "submission_unknown" ? "Submission outcome unknown"
          : response.transfer?.status === "pending" ? "Transfer approved and submitted" : "Transfer approved",
        description: response.transfer?.status === "submission_unknown"
          ? "Do not submit again. Refresh detail and follow the existing outcome reconciliation process."
          : response.message || "The transfer approval was recorded.",
      });
    },
    onError: (error, transferId) => {
      // Read the outcome; never repeat a possibly dispatched payout.
      void queryClient.invalidateQueries({ queryKey: ["admin", "transfer", transferId, token] });
      toast({
        variant: "destructive",
        title: "Approval outcome requires review",
        description: `${error instanceof Error ? error.message : "Approval could not be confirmed."} Do not resubmit; refresh detail and reconcile the outcome.`,
      });
    },
  });

  const rejectMutation = useMutation({
    retry: false,
    mutationFn: async (transferId: number) =>
      requestApi<{ message?: string }>(`${adminEndpointConfig.transfers}/${transferId}/reject`, {
        method: "POST",
        token,
        body: {},
      }),
    onSuccess: async (response, transferId) => {
      await invalidateTransfers();
      await queryClient.invalidateQueries({ queryKey: ["admin", "transfer", transferId, token] });
      toast({
        title: "Transfer rejected",
        description: response.message || "The transfer has been rejected.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Rejection failed",
        description: error instanceof Error ? error.message : "Unable to reject this transfer.",
      });
    },
  });

  const syncMutation = useMutation({
    retry: false,
    mutationFn: async (transferId: number) =>
      requestApi<{ message?: string }>(`${adminEndpointConfig.transfers}/${transferId}/sync-status`, {
        method: "POST",
        token,
        body: {},
      }),
    onSuccess: async (response, transferId) => {
      await invalidateTransfers();
      await queryClient.invalidateQueries({ queryKey: ["admin", "transfer", transferId, token] });
      toast({
        title: "Status synced",
        description: response.message || "Provider status has been synced.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unable to sync provider status.",
      });
    },
  });

  const rows = transfersQuery.data?.data ?? [];
  const responseMeta = transfersQuery.data?.meta;
  const mutationPending = actionBusy || approveMutation.isPending || rejectMutation.isPending || syncMutation.isPending;
  const currentPage = responseMeta?.current_page ?? transfersQuery.data?.current_page ?? page;
  const lastPage = responseMeta?.last_page ?? transfersQuery.data?.last_page ?? 1;
  const totalTransfers = responseMeta?.total ?? transfersQuery.data?.total ?? rows.length;
  const awaitingApprovalOnPage = rows.filter(canApprove).length;
  const inProviderFlowOnPage = rows.filter((row) =>
    ["submitted", "pending"].includes(row.status.toLowerCase()),
  ).length;
  const selectedTransfer = transferDetailQuery.data;
  const reviewNow = Math.max(now, Date.now());
  const controlledSgd = selectedTransfer && isSgdLocal(selectedTransfer);
  const detailReady = failedPreflightId !== selectedTransferId && !transferDetailQuery.isFetching && !transferDetailQuery.isError
    && hasCurrentTransferDetail(transferDetailQuery.dataUpdatedAt, reviewNow);
  const isResume = !!controlledSgd && selectedTransfer.status === "approved";
  const alreadyAttempted = !!selectedTransfer && attemptedApprovals.current.has(selectedTransfer.id);
  const approvalAllowed = !!selectedTransfer && detailReady && user?.status === "active"
    && user.id !== selectedTransfer.user_id && canApprove(selectedTransfer)
    && (!alreadyAttempted || isResume)
    && (!controlledSgd || (user?.status === "active"
      && canApproveSgdLocal(selectedTransfer, user.id, transferDetailQuery.dataUpdatedAt, reviewNow)));

  const runAction = async (action: TransferAction | "sync", transfer: AdminTransfer) => {
    // This ref closes the gap before React renders pending state, including the detail GET.
    if (actionInFlight.current || mutationPending || !token) return;
    const resume = isSgdLocal(transfer) && transfer.status === "approved";
    if (action === "approve" && attemptedApprovals.current.has(transfer.id) && !resume) return;
    actionInFlight.current = true;
    setActionBusy(true);
    try {
      const fresh = await requestApi<AdminTransfer>(`${adminEndpointConfig.transfers}/${transfer.id}`, { method: "GET", token });
      const fetchedAt = Date.now();
      if (fresh.id !== transfer.id) throw new Error("Transfer detail does not match the selected transfer.");
      queryClient.setQueryData(["admin", "transfer", transfer.id, token], fresh);
      setFailedPreflightId(null);
      if (action === "approve") {
        const unchanged = isSgdLocal(transfer)
          ? sameSnapshot(transfer.payout_workflow?.customer_authorization, fresh.payout_workflow?.customer_authorization)
            && sameSnapshot(transfer.payout_workflow?.customer_instruction, fresh.payout_workflow?.customer_instruction)
          : sameSnapshot([transfer.user_id, transfer.provider_id, transfer.beneficiary_id, transfer.beneficiary,
            transfer.source_amount, transfer.source_currency, transfer.target_amount, transfer.target_currency,
            transfer.purpose_code, transfer.reference_text, transfer.client_reference],
          [fresh.user_id, fresh.provider_id, fresh.beneficiary_id, fresh.beneficiary,
            fresh.source_amount, fresh.source_currency, fresh.target_amount, fresh.target_currency,
            fresh.purpose_code, fresh.reference_text, fresh.client_reference]);
        if (user?.status !== "active" || user.id === fresh.user_id || !canApprove(fresh) || fresh.status !== transfer.status || !unchanged
          || (isSgdLocal(fresh) && (user?.status !== "active" || !canApproveSgdLocal(fresh, user?.id, fetchedAt, Date.now())))) {
          throw new Error("Approval is unavailable or the instruction changed. Review the refreshed transfer details.");
        }
        attemptedApprovals.current.add(transfer.id);
        // No retry, even when global mutation defaults enable retries.
        await approveMutation.mutateAsync(transfer.id).catch(() => undefined);
      } else if (action === "reject") {
        if (!canReject(fresh)) throw new Error("Rejection is not authorized for this transfer.");
        await rejectMutation.mutateAsync(transfer.id).catch(() => undefined);
      } else {
        if (!canSync(fresh)) throw new Error("Status sync is not authorized for this transfer.");
        await syncMutation.mutateAsync(transfer.id).catch(() => undefined);
      }
    } catch (error) {
      // A failed preflight must not leave cached authorization enabled.
      setFailedPreflightId(transfer.id);
      await queryClient.invalidateQueries({ queryKey: ["admin", "transfer", transfer.id, token], refetchType: "none" });
      toast({ variant: "destructive", title: "Fresh transfer review required",
        description: error instanceof Error ? error.message : "Unable to verify the current transfer authorization." });
    } finally {
      actionInFlight.current = false;
      setActionBusy(false);
    }
  };

  const refreshDetail = async () => {
    const result = await transferDetailQuery.refetch();
    if (!result.isError && result.data?.id === selectedTransferId) setFailedPreflightId(null);
  };

  const approveSelected = () => {
    if (!selectedTransfer || mutationPending) return;
    if (!approvalAllowed || !hasCurrentTransferDetail(transferDetailQuery.dataUpdatedAt, Date.now())
      || (isSgdLocal(selectedTransfer) && !canApproveSgdLocal(selectedTransfer, user?.id, transferDetailQuery.dataUpdatedAt, Date.now()))) {
      void refreshDetail();
      return;
    }
    void runAction("approve", selectedTransfer);
  };

  const confirmAction = () => {
    if (!pendingAction || !selectedTransfer || mutationPending) return;
    if (pendingAction === "approve") approveSelected();
    else void runAction("reject", selectedTransfer);
    setPendingAction(null);
  };

  return (
    <div className="wallet-ui px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,0.65fr)]">
        <Card className="wallet-card min-w-0 rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-2xl">Transfer queue</CardTitle>
              <CardDescription>Approve, reject, and sync payout status before money moves through Origin Wallet.</CardDescription>
            </div>
            <Button
              variant="outline"
              className="h-10 rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-emerald-50"
              onClick={() => void transfersQuery.refetch()}
              disabled={transfersQuery.isFetching}
            >
              <RefreshCcw className={transfersQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {transfersQuery.isError && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {transfersQuery.error instanceof Error ? transfersQuery.error.message : "Unable to load transfer queue."}
              </div>
            )}

            <div className="space-y-4 lg:hidden">
              {rows.length > 0 ? (
                rows.map((row) => (
                  <div key={row.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="break-all font-medium leading-5 text-slate-900">{displayTransferIdentifier(row.transfer_no)}</div>
                        <div className="text-xs text-slate-500">{formatDate(row.created_at || row.submitted_at)}</div>
                      </div>
                      <Badge className={statusClassName(row.status)}>{transferStatusLabel(row.status)}</Badge>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-600">
                      <div className="break-words [overflow-wrap:anywhere]">{row.user?.email || `User #${row.user_id}`}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <ProviderLogo provider={row.provider} className="h-6 w-6 rounded-md" />
                        <span>{transferProviderLabel(row.provider)}</span>
                      </div>
                      <div className="font-medium text-slate-900">
                        <CurrencyDisplay currency={row.source_currency}>{formatAmount(row.source_amount, row.source_currency)}</CurrencyDisplay>
                      </div>
                      <div className="text-xs text-slate-500">
                        {row.target_amount == null ? formatAmount(row.target_amount, row.target_currency) : <CurrencyDisplay currency={row.target_currency}>{formatAmount(row.target_amount, row.target_currency)}</CurrencyDisplay>}
                      </div>
                      {row.failure_reason && <div className="text-xs text-red-600">{row.failure_reason}</div>}
                    </div>

                    <TransferActions transfer={row} disabled={mutationPending} onReview={() => setSelectedTransferId(row.id)} onSync={() => void runAction("sync", row)} />
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 py-12 text-center text-slate-500">
                  {transfersQuery.isLoading ? "Loading transfers..." : "No transfers are available right now."}
                </div>
              )}
            </div>

            <div role="region" aria-label="Transfer queue" tabIndex={0} className="wallet-table-scroll hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white lg:block">
              <Table className="min-w-[760px] table-fixed 2xl:min-w-0">
                <TableHeader className="bg-slate-50/90">
                  <TableRow className="border-slate-200 hover:bg-slate-50/90">
                    <TableHead className="w-[29%] py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Reference
                    </TableHead>
                    <TableHead className="w-[25%] py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      User / Provider
                    </TableHead>
                    <TableHead className="w-[17%] py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Amount
                    </TableHead>
                    <TableHead className="w-[15%] py-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Status
                    </TableHead>
                    <TableHead className="w-[14%] py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length > 0 ? (
                    rows.map((row) => (
                      <TableRow key={row.id} className="border-slate-100 transition-colors hover:bg-slate-50/70">
                        <TableCell className="py-4 align-top">
                          <div className="break-all text-sm font-semibold leading-5 text-slate-950">
                            {displayTransferIdentifier(row.transfer_no)}
                          </div>
                          <div className="mt-1 text-[11px] leading-4 text-slate-500">
                            {formatDate(row.created_at || row.submitted_at)}
                          </div>
                          {(row.external_transfer_id || row.external_payment_id) && (
                            <div className="mt-2 inline-flex max-w-full rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] leading-4 text-slate-500">
                              <span className="break-all [overflow-wrap:anywhere]">
                                {displayTransferIdentifier(row.external_transfer_id || row.external_payment_id)}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <div className="break-all text-sm font-medium leading-5 text-slate-900">
                            {row.user?.email || `User #${row.user_id}`}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-600">
                            <ProviderLogo provider={row.provider} className="h-6 w-6 rounded-md" />
                            <span>{transferProviderLabel(row.provider)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-right align-top">
                          <div className="text-sm font-semibold tabular-nums text-slate-950">
                            <CurrencyDisplay currency={row.source_currency}>{formatAmount(row.source_amount, row.source_currency)}</CurrencyDisplay>
                          </div>
                          <div className="mt-2 text-xs tabular-nums text-slate-500">
                            {row.target_amount == null ? formatAmount(row.target_amount, row.target_currency) : <CurrencyDisplay currency={row.target_currency}>{formatAmount(row.target_amount, row.target_currency)}</CurrencyDisplay>}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-center align-top">
                          <Badge
                            className={`${statusClassName(row.status)} justify-center whitespace-nowrap px-2.5 py-1 text-[11px] font-medium`}
                          >
                            {transferStatusLabel(row.status)}
                          </Badge>
                          {row.failure_reason && (
                            <div className="mt-2 break-words text-left text-[11px] leading-4 text-red-600 [overflow-wrap:anywhere]">
                              {row.failure_reason}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <TransferActions
                            transfer={row}
                            disabled={mutationPending}
                            compact
                            onReview={() => setSelectedTransferId(row.id)}
                            onSync={() => void runAction("sync", row)}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-slate-500">
                        {transfersQuery.isLoading ? "Loading transfers..." : "No transfers are available right now."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
              <span>Page {currentPage} of {lastPage}</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                <Button type="button" size="sm" variant="outline" disabled={currentPage >= lastPage} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="wallet-card min-w-0 rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Queue signals</CardTitle>
              <CardDescription>Operational summary for payout readiness.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3 2xl:grid-cols-1">
              {[
                {
                  icon: ArrowRightLeft,
                  title: "Total transfers",
                  description: String(totalTransfers),
                },
                {
                  icon: Clock3,
                  title: "Awaiting admin approval on page",
                  description: String(awaitingApprovalOnPage),
                },
                {
                  icon: ReceiptText,
                  title: "In provider flow on page",
                  description: String(inProviderFlowOnPage),
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="mt-3 text-sm font-medium text-slate-600">{item.title}</div>
                  <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-950">{item.description}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={selectedTransferId !== null} onOpenChange={(open) => { if (!open) { setSelectedTransferId(null); setPendingAction(null); } }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transfer review</DialogTitle>
            <DialogDescription>Review the transfer lifecycle and customer-safe payment details before taking action.</DialogDescription>
          </DialogHeader>
          {transferDetailQuery.isLoading && <div className="py-8 text-center text-slate-500">Loading transfer detail...</div>}
          {transferDetailQuery.isError && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{transferDetailQuery.error instanceof Error ? transferDetailQuery.error.message : "Unable to load transfer detail."}</div>}
          {selectedTransfer && <TransferReview transfer={selectedTransfer} />}
          {selectedTransfer && (!controlledSgd || !approvalAllowed || alreadyAttempted || isResume) && <Button variant="outline" disabled={mutationPending || transferDetailQuery.isFetching} onClick={() => void refreshDetail()}>Refresh transfer detail</Button>}
          {controlledSgd && approvalAllowed && !isResume && <p className="text-sm text-slate-600">Approve &amp; submit automatically sends this payment using the customer's accepted terms. No separate dispatch step is required.</p>}
          {alreadyAttempted && <p role="status">An approval/submission was attempted. Refresh detail to review the outcome. Only an authorized approval recorded before dispatch can be explicitly resumed.</p>}
          {controlledSgd && !approvalAllowed && !mutationPending && <p role="status">Approval unavailable. Current customer acceptance, FX, financial terms and independent checker authorization are required. Review blockers and refresh transfer detail.</p>}
          {selectedTransfer && (
            <DialogFooter className="gap-2 sm:gap-0">
              {canReject(selectedTransfer) && <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={mutationPending || !detailReady} onClick={() => setPendingAction("reject")}>Reject</Button>}
              {(controlledSgd || canApprove(selectedTransfer)) && <Button className="bg-emerald-700 text-white hover:bg-emerald-800" disabled={mutationPending || !approvalAllowed} onClick={() => {
                if (controlledSgd) { approveSelected(); return; }
                setPendingAction("approve");
              }}>{isResume ? "Resume approved transfer" : selectedTransfer.provider?.code?.toLowerCase() === "nium" ? "Approve & submit" : "Approve"}</Button>}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction === "approve" ? (selectedTransfer?.provider?.code?.toLowerCase() === "nium" ? "Approve and submit this transfer?" : "Approve this transfer?") : "Reject this transfer?"}</AlertDialogTitle>
            <AlertDialogDescription>This action changes the transfer workflow. Confirm only after reviewing the transfer details.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={mutationPending || !detailReady || (pendingAction === "approve" ? !approvalAllowed : !selectedTransfer || !canReject(selectedTransfer))} onClick={confirmAction}>{pendingAction === "approve" ? (selectedTransfer?.provider?.code?.toLowerCase() === "nium" ? "Approve & submit" : "Confirm approval") : "Confirm rejection"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const TransferReview = ({ transfer }: { transfer: AdminTransfer }) => {
  const beneficiaryName = transfer.beneficiary?.company_name || transfer.beneficiary?.full_name;
  const fields = [
    ["Transfer ID", displayTransferIdentifier(transfer.transfer_no || transfer.id)],
    ["Status", transferStatusLabel(transfer.status)],
    ["Customer", [transfer.user?.full_name, transfer.user?.email].filter(Boolean).join(" · ") || `User #${transfer.user_id}`],
    ["Source amount", formatAmount(transfer.source_amount, transfer.source_currency)],
    ["Destination currency", transfer.target_currency],
    ["Purpose", transfer.purpose_code || "Unavailable"],
    ["Payment reference", transfer.reference_text || transfer.client_reference || "Unavailable"],
    ["Target amount", formatAmount(transfer.target_amount, transfer.target_currency)],
    ["Provider status", transfer.provider_status ? transferStatusLabel(transfer.provider_status) : "-"],
    ["Failure reason", transfer.failure_reason || "-"],
    ["Created", formatDate(transfer.created_at)],
    ["Submitted", formatDate(transfer.submitted_at)],
  ];
  return <div className="space-y-4">
    <dl className="grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-900">{value}</dd></div>)}</dl>
    {beneficiaryName && <div className="rounded-2xl border border-slate-200 p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Beneficiary summary</div><div className="mt-2 font-medium text-slate-900">{beneficiaryName}</div><div className="mt-1 text-sm text-slate-600">{[transfer.beneficiary?.bank_name, transfer.beneficiary?.country_code, transfer.beneficiary?.currency, transfer.beneficiary?.status].filter(Boolean).join(" · ")}</div></div>}
    {(isSgdLocal(transfer) || transfer.payout_workflow) && <PayoutInstructionReview transfer={transfer} />}
    {["pending", "submitting", "processing"].includes(transfer.status) && <p role="status">Payment is {transfer.status}. Follow the existing operation status; do not approve it again.</p>}
    {["failed", "cancelled", "rejected", "completed"].includes(transfer.status) && <p role="status">Payment is {transfer.status}. This operation cannot be approved or resumed.</p>}
    {transfer.status === "submission_unknown" && <p role="alert">Provider outcome unknown. Do not submit again; reconcile the existing operation.</p>}
    {(transfer.external_transfer_id || transfer.external_payment_id) && <div className="text-xs text-slate-500">Provider reference: {displayTransferIdentifier(transfer.external_transfer_id || transfer.external_payment_id)}</div>}
  </div>;
};

const PayoutInstructionReview = ({ transfer }: { transfer: AdminTransfer }) => {
  const workflow = transfer.payout_workflow;
  const receipt = workflow?.customer_authorization;
  const instruction = receipt?.instruction;
  const terms = instruction?.financial_terms;
  const amounts = transfer.payout_amounts;
  const confirmed = workflow?.provider_fee_status === "confirmed" && terms?.fee_status !== "unverified"
    && !!instruction && sameSnapshot(instruction, workflow?.customer_instruction);
  const fee = confirmed && terms?.fee_amount != null && amounts?.transfer_fee
    && terms.fee_amount === amounts.transfer_fee.amount && terms.fee_currency === amounts.transfer_fee.currency
    ? formatAmount(terms.fee_amount, terms.fee_currency) : "Unavailable / unverified";
  const debit = confirmed && terms?.total_wallet_debit != null && terms.total_wallet_debit === amounts?.total_wallet_debit
    ? formatAmount(terms.total_wallet_debit, terms.fee_currency) : "Unavailable / unverified";
  const fields = [
    ["Accepted by", receipt?.accepted_by == null ? "Unavailable" : `Customer #${receipt.accepted_by}`],
    ["Customer accepted at", receipt?.accepted_at ? formatDate(receipt.accepted_at) : "Acceptance unavailable"],
    ["Accepted beneficiary", instruction?.receiving_account?.name || "Unavailable"],
    ["Receiving bank", instruction?.receiving_account?.bank || "Unavailable"],
    ["Receiving account ending", instruction?.receiving_account?.last_four || "Unavailable"],
    ["Accepted corridor", instruction ? `${instruction.source_currency || "Unavailable"} → ${instruction.destination_currency || "Unavailable"} · ${transfer.beneficiary?.country_code || "Country unavailable"} · ${instruction.payout_method || "Method unavailable"}` : "Unavailable"],
    ["Accepted source amount", instruction ? formatAmount(instruction.source_amount, instruction.source_currency) : "Unavailable"],
    ["Accepted destination currency", instruction?.destination_currency || "Unavailable"],
    ["Accepted FX rate", instruction?.rate || "Unavailable"],
    ["FX expiration", instruction?.expires_at ? formatDate(instruction.expires_at) : "Unavailable"],
    ["Current quoted FX rate", amounts?.fx_rate || "Unavailable"],
    ["Current FX expiration", amounts?.fx_lock_expires_at ? formatDate(amounts.fx_lock_expires_at) : "Unavailable"],
    ["Accepted purpose", instruction?.purpose_code || "Unavailable"],
    ["Accepted payment reference", instruction?.reference_text || instruction?.client_reference || "Not provided"],
    ["Financial terms", terms ? terms.policy || terms.funding_basis || terms.pricing_version || "Unavailable" : "Unavailable"],
    ["Accepted authorization reference", terms?.authorization_reference || "Not provided"],
    ["Financial terms expiration", terms?.expires_at ? formatDate(terms.expires_at) : "Unavailable"],
    ["Provider fee status", workflow?.provider_fee_status || "Unavailable"],
    ["NIUM fee", fee],
    ["Total wallet debit", debit],
    ["Workflow state", workflow?.state || "Unavailable"],
    ["Recovery", workflow?.recovery_kind || "None reported"],
    ["Recovery review requested", formatDate(workflow?.recovery_review_requested_at)],
    ["Status reconciliation", workflow?.can_reconcile_status === true ? "Available to authorized Admins" : "Unavailable; authoritative outcome evidence may be required"],
  ];
  return <section aria-label="Customer payment instruction" className="space-y-3 rounded-2xl border p-4">
    <h3 className="font-medium">Customer payment instruction</h3>
    {!instruction && <p role="alert">Accepted customer instruction unavailable. Approval is blocked.</p>}
    {instruction && !sameSnapshot(instruction, workflow?.customer_instruction) && <p role="alert">The accepted instruction conflicts with or is unavailable in the current workflow. Approval is blocked.</p>}
    <dl className="grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words text-sm">{value}</dd></div>)}</dl>
    {terms?.funding_basis === "principal_only_pilot" && <p>Accepted pilot reservation: {formatAmount(terms.reservation_amount, terms.fee_currency)}. Provider fees and total debit remain unverified.</p>}
    {terms?.policy === "one_time_uncapped" && <p>Accepted financial risk: additional NIUM charges are unknown, uncapped and not reserved.</p>}
    {terms?.pilot_reserve && <p>Accepted protected reserve: {formatAmount(terms.pilot_reserve.amount, terms.pilot_reserve.currency)} · Charge ceiling: {formatAmount(terms.pilot_reserve.charge_ceiling, terms.pilot_reserve.currency)}</p>}
    {workflow?.blockers?.map((blocker) => <p key={blocker} role="status">{blocker}</p>)}
    {workflow?.can_restart_review && <p>A new customer review is available through the existing customer workflow.</p>}
  </section>;
};

const TransferActions = ({
  compact = false,
  disabled,
  onReview,
  onSync,
  transfer,
}: {
  compact?: boolean;
  disabled?: boolean;
  onReview: () => void;
  onSync: () => void;
  transfer: AdminTransfer;
}) => (
  <div className={compact ? "flex flex-col items-end gap-1.5" : "mt-4 flex flex-wrap gap-2"}>
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={onReview}
      className={compact ? "h-10 min-w-[86px] justify-center rounded-xl border-slate-300 bg-white px-3 text-xs text-slate-700 hover:border-emerald-600 hover:bg-emerald-50" : "h-10 rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-emerald-50"}
    >
      <Eye className="h-3.5 w-3.5" />
      Review
    </Button>
    {canSync(transfer) && (
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={onSync}
        className={compact ? "h-10 min-w-[86px] justify-center rounded-xl border-slate-300 bg-white px-3 text-xs text-slate-700 hover:border-emerald-600 hover:bg-emerald-50" : "h-10 rounded-xl border-slate-300 bg-white text-slate-700 hover:bg-emerald-50"}
      >
        <RefreshCcw className="h-3.5 w-3.5" />
        Sync
      </Button>
    )}
  </div>
);

export default AdminTransactions;
