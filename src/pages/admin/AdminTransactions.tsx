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
import NiumTransferThreeReview from "./NiumTransferThreeReview";
import { canApproveNiumTransferThree, hasCurrentPilotDetail, isNiumTransferThree } from "./niumTransferThree";

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

const isSgdLocal = (transfer: AdminTransfer) => transfer.provider?.code?.toLowerCase() === "nium" && transfer.target_currency === "SGD";

const canApprove = (transfer: AdminTransfer) =>
  (!isSgdLocal(transfer) || (transfer.allowed_actions?.approve === true && transfer.payout_workflow?.checker_approval_allowed === true)) &&
  ["draft", "approval_required"].includes(transfer.status.toLowerCase()) &&
  !transfer.approvals?.some((approval) => approval.action === "approved");

const canReject = (transfer: AdminTransfer) =>
  ["draft", "approval_required", "approved"].includes(transfer.status.toLowerCase());

const canSync = (transfer: AdminTransfer) =>
  Boolean(transfer.external_transfer_id || transfer.external_payment_id) &&
  ["submitted", "pending", "completed", "failed"].includes(transfer.status.toLowerCase());

const AdminTransactions = () => {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [selectedTransferId, setSelectedTransferId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<TransferAction | null>(null);
  const [now, setNow] = useState(Date.now);
  const pilotDispatchStarted = useRef(false);
  const attemptedApprovals = useRef(new Set<number>());
  const pilotApprovalSnapshot = useRef<{ fetchedAt: number; transfer: AdminTransfer } | null>(null);
  const [pilotSubmissionAttempted, setPilotSubmissionAttempted] = useState(false);
  const [pilotFeedback, setPilotFeedback] = useState("");

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
      await queryClient.invalidateQueries({ queryKey: ["admin", "transfer", selectedTransferId, token] });
      toast({
        title: transferId === 3 && response.transfer?.status === "submission_unknown" ? "Submission outcome unknown"
          : response.transfer?.status === "pending" ? "Transfer approved and submitted" : "Transfer approved",
        description: transferId === 3 && response.transfer?.status === "submission_unknown"
          ? "Do not submit again. Refresh detail and follow the existing outcome reconciliation process."
          : response.message || "The transfer approval was recorded.",
      });
    },
    onError: (error, transferId) => {
      {
        // Refresh locally captured state only; never repeat a possibly dispatched payout.
        void queryClient.invalidateQueries({ queryKey: ["admin", "transfer", transferId, token] });
      }
      toast({
        variant: "destructive",
        title: "Approval outcome requires review",
        description: `${error instanceof Error ? error.message : "Approval could not be confirmed."} Do not resubmit; refresh detail and reconcile the outcome.`,
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (transferId: number) =>
      requestApi<{ message?: string }>(`${adminEndpointConfig.transfers}/${transferId}/reject`, {
        method: "POST",
        token,
        body: {},
      }),
    onSuccess: async (response) => {
      await invalidateTransfers();
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
    mutationFn: async (transferId: number) =>
      requestApi<{ message?: string }>(`${adminEndpointConfig.transfers}/${transferId}/sync-status`, {
        method: "POST",
        token,
        body: {},
      }),
    onSuccess: async (response) => {
      await invalidateTransfers();
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
  const mutationPending = approveMutation.isPending || rejectMutation.isPending || syncMutation.isPending;
  const currentPage = responseMeta?.current_page ?? transfersQuery.data?.current_page ?? page;
  const lastPage = responseMeta?.last_page ?? transfersQuery.data?.last_page ?? 1;
  const totalTransfers = responseMeta?.total ?? transfersQuery.data?.total ?? rows.length;
  const awaitingApprovalOnPage = rows.filter(canApprove).length;
  const inProviderFlowOnPage = rows.filter((row) =>
    ["submitted", "pending"].includes(row.status.toLowerCase()),
  ).length;
  const selectedTransfer = transferDetailQuery.data;
  const reviewNow = Math.max(now, Date.now());
  const pilot = selectedTransfer?.id === 3;
  const pilotApprovalAllowed = pilot && user?.status === "active" && !pilotSubmissionAttempted && !transferDetailQuery.isFetching && !transferDetailQuery.isError
    && canApproveNiumTransferThree(selectedTransfer, user?.id, transferDetailQuery.dataUpdatedAt, reviewNow);
  const controlledSgd = selectedTransfer && isSgdLocal(selectedTransfer);
  const sgdApprovalAllowed = !!controlledSgd && user?.status === "active" && user.id !== selectedTransfer.user_id
    && !attemptedApprovals.current.has(selectedTransfer.id) && !transferDetailQuery.isFetching && !transferDetailQuery.isError
    && selectedTransfer.allowed_actions?.approve === true && selectedTransfer.payout_workflow?.checker_approval_allowed === true
    && ["approval_required", "approved"].includes(selectedTransfer.status)
    && hasCurrentPilotDetail(transferDetailQuery.dataUpdatedAt, reviewNow)
    && Date.parse(selectedTransfer.payout_amounts?.fx_lock_expires_at ?? "") > reviewNow
    && (!pilot || pilotApprovalAllowed);

  const approveSelected = () => {
    if (!selectedTransfer || mutationPending || attemptedApprovals.current.has(selectedTransfer.id)) return;
    if (isSgdLocal(selectedTransfer) && (!sgdApprovalAllowed
      || !hasCurrentPilotDetail(transferDetailQuery.dataUpdatedAt, Date.now())
      || Date.parse(selectedTransfer.payout_amounts?.fx_lock_expires_at ?? "") <= Date.now())) {
      void transferDetailQuery.refetch();
      return;
    }
    attemptedApprovals.current.add(selectedTransfer.id); // Synchronous fence, including ambiguous responses.
    if (pilot) { pilotDispatchStarted.current = true; setPilotSubmissionAttempted(true); setPilotFeedback(""); }
    approveMutation.mutate(selectedTransfer.id);
  };
  const pilotConfirmationMatches = pilotApprovalSnapshot.current?.fetchedAt === transferDetailQuery.dataUpdatedAt
    && pilotApprovalSnapshot.current?.transfer === selectedTransfer;

  useEffect(() => {
    if (pilot && pendingAction === "approve" && !pilotConfirmationMatches) {
      setPendingAction(null);
      setPilotFeedback("Transfer detail changed. Review the current FX and financial terms before confirming approval again.");
    }
  }, [pilot, pendingAction, pilotConfirmationMatches]);

  const confirmAction = () => {
    if (!pendingAction || !selectedTransfer) return;
    if (pilot && pendingAction === "approve") {
      if (pilotDispatchStarted.current || !pilotConfirmationMatches || user?.status !== "active" || transferDetailQuery.isFetching || transferDetailQuery.isError
        || !canApproveNiumTransferThree(selectedTransfer, user?.id, transferDetailQuery.dataUpdatedAt, Date.now())) {
        setPendingAction(null);
        void transferDetailQuery.refetch();
        return;
      }
      pilotDispatchStarted.current = true;
      setPilotSubmissionAttempted(true);
      setPilotFeedback("");
    }
    if (pendingAction === "approve") approveSelected();
    else rejectMutation.mutate(selectedTransfer.id);
    setPendingAction(null);
    if (!pilot) setSelectedTransferId(null);
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

                    <TransferActions transfer={row} disabled={mutationPending} onReview={() => setSelectedTransferId(row.id)} onSync={() => void syncMutation.mutateAsync(row.id)} />
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
                            onSync={() => void syncMutation.mutateAsync(row.id)}
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
          {pilot && !isNiumTransferThree(selectedTransfer) && <p role="alert">Pilot transfer binding does not match Transfer 3, GREENTECH to Andy, USD 5 to SGD LOCAL. Refresh detail and resolve the mismatch before approval.</p>}
          {pilot && isNiumTransferThree(selectedTransfer) && <NiumTransferThreeReview key={`${selectedTransfer.id}:${transferDetailQuery.dataUpdatedAt}:${user?.id}`}
            transfer={selectedTransfer} fetchedAt={transferDetailQuery.dataUpdatedAt} now={reviewNow}
            refreshing={transferDetailQuery.isFetching} detailError={transferDetailQuery.isError}
            submissionAttempted={pilotSubmissionAttempted} refreshDetail={() => transferDetailQuery.refetch()} onFeedback={setPilotFeedback} />}
          {pilot && pilotFeedback && <p role="status">{pilotFeedback}</p>}
          {selectedTransfer && (
            <DialogFooter className="gap-2 sm:gap-0">
              {canReject(selectedTransfer) && <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={mutationPending} onClick={() => setPendingAction("reject")}>Reject</Button>}
              {(controlledSgd || pilot || canApprove(selectedTransfer)) && <Button className="bg-emerald-700 text-white hover:bg-emerald-800" disabled={mutationPending || attemptedApprovals.current.has(selectedTransfer.id) || (controlledSgd && !sgdApprovalAllowed) || (pilot && !pilotApprovalAllowed)} onClick={() => {
                if (controlledSgd) { approveSelected(); return; }
                if (pilot) pilotApprovalSnapshot.current = { fetchedAt: transferDetailQuery.dataUpdatedAt, transfer: selectedTransfer };
                setPendingAction("approve");
              }}>{selectedTransfer.provider?.code?.toLowerCase() === "nium" ? "Approve & submit" : "Approve"}</Button>}
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
            <AlertDialogAction disabled={mutationPending || (pilot && pendingAction === "approve" && (!pilotApprovalAllowed || !pilotConfirmationMatches))} onClick={confirmAction}>{pendingAction === "approve" ? (selectedTransfer?.provider?.code?.toLowerCase() === "nium" ? "Approve & submit" : "Confirm approval") : "Confirm rejection"}</AlertDialogAction>
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
    ["Source amount", formatAmount(transfer.source_amount, transfer.source_currency)],
    ["Target amount", formatAmount(transfer.target_amount, transfer.target_currency)],
    ["Provider status", transfer.provider_status ? transferStatusLabel(transfer.provider_status) : "-"],
    ["Failure reason", transfer.failure_reason || "-"],
    ["Created", formatDate(transfer.created_at)],
    ["Submitted", formatDate(transfer.submitted_at)],
  ];
  return <div className="space-y-4">
    <dl className="grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-900">{value}</dd></div>)}</dl>
    {beneficiaryName && <div className="rounded-2xl border border-slate-200 p-4"><div className="text-xs font-medium uppercase tracking-wide text-slate-500">Beneficiary summary</div><div className="mt-2 font-medium text-slate-900">{beneficiaryName}</div><div className="mt-1 text-sm text-slate-600">{[transfer.beneficiary?.bank_name, transfer.beneficiary?.country_code, transfer.beneficiary?.currency, transfer.beneficiary?.status].filter(Boolean).join(" · ")}</div></div>}
    {transfer.payout_workflow && <section aria-label="Customer payment instruction" className="space-y-2 rounded-2xl border p-4">
      <h3 className="font-medium">Customer payment instruction</h3>
      {transfer.payout_workflow.customer_authorization ? <>
        <p>Accepted by customer {transfer.payout_workflow.customer_authorization.accepted_by} at {transfer.payout_workflow.customer_authorization.accepted_at}</p>
        <p>{transfer.payout_workflow.customer_authorization.instruction.source_amount} USD → SGD LOCAL · Purpose: {transfer.payout_workflow.customer_authorization.instruction.purpose_code}</p>
        <p>Receiving account: {transfer.payout_workflow.customer_authorization.instruction.receiving_account.name} · {transfer.payout_workflow.customer_authorization.instruction.receiving_account.bank} · ending {transfer.payout_workflow.customer_authorization.instruction.receiving_account.last_four}</p>
        <p>Accepted FX: {transfer.payout_workflow.customer_authorization.instruction.rate} SGD per USD · Expires {transfer.payout_workflow.customer_authorization.instruction.expires_at}</p>
        {transfer.payout_workflow.customer_authorization.risk_acknowledgement && <p>Customer explicitly accepted unknown, uncapped additional NIUM charges. Total wallet debit remains unverified.</p>}
      </> : <p>Customer acceptance of current payment terms is required. Admin cannot supply customer consent.</p>}
      {transfer.payout_workflow.blockers?.map((blocker) => <p key={blocker} role="status">{blocker}</p>)}
      {transfer.status === "submission_unknown" && <p role="alert">Provider outcome unknown. Do not submit again; reconcile the existing operation.</p>}
    </section>}
    {(transfer.external_transfer_id || transfer.external_payment_id) && <div className="text-xs text-slate-500">Provider reference: {displayTransferIdentifier(transfer.external_transfer_id || transfer.external_payment_id)}</div>}
  </div>;
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
