import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, CheckCircle2, Clock3, ReceiptText, RefreshCcw, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type { AdminTransfer } from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const terminalStatuses = ["completed", "failed", "cancelled", "rejected"];

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

  if (["completed", "approved"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  }

  if (["failed", "cancelled", "rejected"].includes(normalized)) {
    return "bg-red-100 text-red-700 hover:bg-red-100";
  }

  if (["approval_required", "pending", "submitted"].includes(normalized)) {
    return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  }

  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

const canApprove = (transfer: AdminTransfer) =>
  ["draft", "approval_required"].includes(transfer.status.toLowerCase()) &&
  !transfer.approvals?.some((approval) => approval.action === "approved");

const canReject = (transfer: AdminTransfer) =>
  ["draft", "approval_required", "approved"].includes(transfer.status.toLowerCase());

const canSync = (transfer: AdminTransfer) =>
  Boolean(transfer.external_transfer_id || transfer.external_payment_id) &&
  ["submitted", "pending", "completed", "failed"].includes(transfer.status.toLowerCase());

const AdminTransactions = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const transfersQuery = useQuery({
    queryKey: ["admin", "transfers", token],
    enabled: !!token,
    queryFn: async () =>
      requestApi<PaginatedResponse<AdminTransfer>>(adminEndpointConfig.transfers, { method: "GET", token }),
  });

  const invalidateTransfers = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "transfers"] });
  };

  const approveMutation = useMutation({
    mutationFn: async (transferId: number) =>
      requestApi<{ message?: string }>(`${adminEndpointConfig.transfers}/${transferId}/approve`, {
        method: "POST",
        token,
        body: {},
      }),
    onSuccess: async (response) => {
      await invalidateTransfers();
      toast({
        title: "Transfer approved",
        description: response.message || "The transfer can now be submitted to the provider.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Approval failed",
        description: error instanceof Error ? error.message : "Unable to approve this transfer.",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (transferId: number) =>
      requestApi<{ message?: string }>(`${adminEndpointConfig.transfers}/${transferId}/reject`, {
        method: "POST",
        token,
        body: { note: "Rejected from admin transfer queue." },
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
  const mutationPending = approveMutation.isPending || rejectMutation.isPending || syncMutation.isPending;

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-2xl">Transfer queue</CardTitle>
              <CardDescription>Approve, reject, and sync provider payout status before money moves through Nium.</CardDescription>
            </div>
            <Button
              variant="outline"
              className="rounded-2xl border-slate-200"
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
                        <div className="font-medium text-slate-900">{row.transfer_no}</div>
                        <div className="text-xs text-slate-500">{formatDate(row.created_at || row.submitted_at)}</div>
                      </div>
                      <Badge className={statusClassName(row.status)}>{row.status}</Badge>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-600">
                      <div>{row.user?.email || `User #${row.user_id}`}</div>
                      <div className="font-medium text-slate-900">
                        {formatAmount(row.source_amount, row.source_currency)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatAmount(row.target_amount, row.target_currency)}
                      </div>
                      {row.failure_reason && <div className="text-xs text-red-600">{row.failure_reason}</div>}
                    </div>

                    <TransferActions
                      transfer={row}
                      disabled={mutationPending}
                      onApprove={() => void approveMutation.mutateAsync(row.id)}
                      onReject={() => void rejectMutation.mutateAsync(row.id)}
                      onSync={() => void syncMutation.mutateAsync(row.id)}
                    />
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 py-12 text-center text-slate-500">
                  {transfersQuery.isLoading ? "Loading transfers..." : "No transfers are available right now."}
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>User / Provider</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length > 0 ? (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{row.transfer_no}</div>
                          <div className="text-xs text-slate-500">{formatDate(row.created_at || row.submitted_at)}</div>
                          {(row.external_transfer_id || row.external_payment_id) && (
                            <div className="mt-1 max-w-[240px] truncate text-xs text-slate-400">
                              {row.external_transfer_id || row.external_payment_id}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-slate-900">{row.user?.email || `User #${row.user_id}`}</div>
                          <div className="text-xs text-slate-500">{row.provider?.name || `Provider #${row.provider_id}`}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-900">
                            {formatAmount(row.source_amount, row.source_currency)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatAmount(row.target_amount, row.target_currency)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusClassName(row.status)}>{row.status}</Badge>
                          {row.failure_reason && <div className="mt-2 max-w-[260px] truncate text-xs text-red-600">{row.failure_reason}</div>}
                        </TableCell>
                        <TableCell>
                          <TransferActions
                            transfer={row}
                            disabled={mutationPending}
                            compact
                            onApprove={() => void approveMutation.mutateAsync(row.id)}
                            onReject={() => void rejectMutation.mutateAsync(row.id)}
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
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Queue signals</CardTitle>
              <CardDescription>Operational summary for payout readiness.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  icon: ArrowRightLeft,
                  title: "Total transfers",
                  description: String(transfersQuery.data?.total ?? 0),
                },
                {
                  icon: Clock3,
                  title: "Need approval",
                  description: String(rows.filter((row) => row.status === "approval_required").length),
                },
                {
                  icon: ReceiptText,
                  title: "In provider flow",
                  description: String(rows.filter((row) => ["submitted", "pending"].includes(row.status)).length),
                },
              ].map((item) => (
                <div key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-lg font-semibold text-slate-950">{item.title}</div>
                  <div className="mt-2 text-sm leading-7 text-slate-600">{item.description}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

const TransferActions = ({
  compact = false,
  disabled,
  onApprove,
  onReject,
  onSync,
  transfer,
}: {
  compact?: boolean;
  disabled?: boolean;
  onApprove: () => void;
  onReject: () => void;
  onSync: () => void;
  transfer: AdminTransfer;
}) => (
  <div className={compact ? "flex justify-end gap-2" : "mt-4 flex flex-wrap gap-2"}>
    {canApprove(transfer) && (
      <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={disabled} onClick={onApprove}>
        <CheckCircle2 className="h-4 w-4" />
        Approve
      </Button>
    )}
    {canReject(transfer) && (
      <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" disabled={disabled} onClick={onReject}>
        <XCircle className="h-4 w-4" />
        Reject
      </Button>
    )}
    {canSync(transfer) && (
      <Button size="sm" variant="outline" disabled={disabled} onClick={onSync}>
        <RefreshCcw className="h-4 w-4" />
        Sync
      </Button>
    )}
  </div>
);

export default AdminTransactions;
