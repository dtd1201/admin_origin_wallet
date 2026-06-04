import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Eye, RefreshCcw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type { AdminFxOrder, AdminFxOrderResponse, ProviderSummary } from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type OrderStatusFilter = "all" | "pending" | "confirmed" | "rejected" | "cancelled";

type DecisionDialogState = {
  mode: "confirm" | "reject";
  order: AdminFxOrder;
} | null;

type DecisionFormState = {
  target_amount: string;
  fx_rate: string;
  fee_amount: string;
  fee_currency: string;
  admin_note: string;
};

const emptyDecisionForm: DecisionFormState = {
  target_amount: "",
  fx_rate: "",
  fee_amount: "0",
  fee_currency: "VND",
  admin_note: "",
};

const statusOptions: Array<{ value: OrderStatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const numberOrNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
};

const formatNumber = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(numeric)
    : String(value);
};

const formatAmount = (amount?: string | number | null, currency?: string | null) => {
  const formattedAmount = formatNumber(amount);
  return formattedAmount === "-" ? "-" : `${formattedAmount} ${currency || ""}`.trim();
};

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

const statusClassName = (status: string) => {
  const normalized = status.toLowerCase();

  if (normalized === "confirmed") {
    return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  }

  if (normalized === "rejected") {
    return "bg-red-100 text-red-700 hover:bg-red-100";
  }

  if (normalized === "pending") {
    return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  }

  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

const getCustomerName = (order: AdminFxOrder) =>
  order.customer_snapshot?.user?.full_name ||
  order.user?.full_name ||
  order.customer_snapshot?.kyc_profile?.business_name ||
  order.customer_snapshot?.kyc_profile?.legal_name ||
  `User #${order.user_id}`;

const getCustomerEmail = (order: AdminFxOrder) =>
  order.customer_snapshot?.user?.email || order.user?.email || "No email snapshot";

const getSnapshotValue = (record: Record<string, string | number | boolean | null | undefined> | null | undefined, key: string) => {
  const value = record?.[key];

  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
};

const DetailLine = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
    <div className="mt-1 break-words text-sm font-semibold text-slate-950">{value || "-"}</div>
  </div>
);

const AdminFxOrders = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("pending");
  const [providerFilter, setProviderFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<AdminFxOrder | null>(null);
  const [decisionDialog, setDecisionDialog] = useState<DecisionDialogState>(null);
  const [decisionForm, setDecisionForm] = useState<DecisionFormState>(emptyDecisionForm);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    setPage(1);
  }, [providerFilter, statusFilter]);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));

    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }

    if (providerFilter !== "all") {
      params.set("provider_id", providerFilter);
    }

    return `${adminEndpointConfig.fxOrders}?${params.toString()}`;
  }, [page, providerFilter, statusFilter]);

  const ordersQuery = useQuery({
    queryKey: ["admin", "fx-orders", statusFilter, providerFilter, page, token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<AdminFxOrder>>(queryPath, { method: "GET", token }),
  });

  const providersQuery = useQuery({
    queryKey: ["admin", "providers", "fx-orders-filter", token],
    enabled: !!token,
    queryFn: async () =>
      requestApi<PaginatedResponse<ProviderSummary>>(adminEndpointConfig.providers, { method: "GET", token }),
  });

  const rows = ordersQuery.data?.data ?? [];
  const providers = providersQuery.data?.data ?? [];

  useEffect(() => {
    if (!selectedOrder) {
      return;
    }

    const refreshed = rows.find((row) => row.id === selectedOrder.id);

    if (refreshed) {
      setSelectedOrder(refreshed);
    }
  }, [rows, selectedOrder?.id]);

  const stats = useMemo(
    () => [
      { label: "Total results", value: ordersQuery.data?.total ?? 0 },
      { label: "Pending visible", value: rows.filter((row) => row.status === "pending").length },
      { label: "Confirmed visible", value: rows.filter((row) => row.status === "confirmed").length },
      { label: "Rejected visible", value: rows.filter((row) => row.status === "rejected").length },
    ],
    [ordersQuery.data?.total, rows],
  );

  const invalidateOrders = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "fx-orders"] });
  };

  const confirmMutation = useMutation({
    mutationFn: async ({ orderId, payload }: { orderId: number; payload: Record<string, unknown> }) =>
      requestApi<AdminFxOrderResponse>(`${adminEndpointConfig.fxOrders}/${orderId}/confirm`, {
        method: "POST",
        token,
        body: payload,
      }),
    onSuccess: async (response) => {
      await invalidateOrders();
      setSelectedOrder(response.order);
      setDecisionDialog(null);
      setDecisionForm(emptyDecisionForm);
      setActionError("");
      toast({
        title: "FX order confirmed",
        description: response.message || `${response.order.order_no} has been confirmed.`,
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to confirm this FX order.";
      setActionError(message);
      toast({ variant: "destructive", title: "Confirmation failed", description: message });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ orderId, payload }: { orderId: number; payload: Record<string, unknown> }) =>
      requestApi<AdminFxOrderResponse>(`${adminEndpointConfig.fxOrders}/${orderId}/reject`, {
        method: "POST",
        token,
        body: payload,
      }),
    onSuccess: async (response) => {
      await invalidateOrders();
      setSelectedOrder(response.order);
      setDecisionDialog(null);
      setDecisionForm(emptyDecisionForm);
      setActionError("");
      toast({
        title: "FX order rejected",
        description: response.message || `${response.order.order_no} has been rejected.`,
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to reject this FX order.";
      setActionError(message);
      toast({ variant: "destructive", title: "Rejection failed", description: message });
    },
  });

  const openDecisionDialog = (mode: "confirm" | "reject", order: AdminFxOrder) => {
    setSelectedOrder(order);
    setDecisionDialog({ mode, order });
    setDecisionForm({
      target_amount: order.target_amount === null || order.target_amount === undefined ? "" : String(order.target_amount),
      fx_rate: order.fx_rate === null || order.fx_rate === undefined ? "" : String(order.fx_rate),
      fee_amount: order.fee_amount === null || order.fee_amount === undefined ? "0" : String(order.fee_amount),
      fee_currency: order.fee_currency || order.target_currency || "VND",
      admin_note: order.admin_note || "",
    });
    setActionError("");
  };

  const submitDecision = async () => {
    if (!decisionDialog) {
      return;
    }

    setActionError("");

    if (decisionDialog.mode === "confirm") {
      const payload = {
        target_amount: numberOrNull(decisionForm.target_amount),
        fx_rate: numberOrNull(decisionForm.fx_rate),
        fee_amount: numberOrNull(decisionForm.fee_amount) ?? 0,
        fee_currency: decisionForm.fee_currency.trim().toUpperCase() || decisionDialog.order.target_currency || "VND",
        admin_note: decisionForm.admin_note.trim() || null,
      };

      await confirmMutation.mutateAsync({ orderId: decisionDialog.order.id, payload });
      return;
    }

    await rejectMutation.mutateAsync({
      orderId: decisionDialog.order.id,
      payload: { admin_note: decisionForm.admin_note.trim() || null },
    });
  };

  const isSubmitting = confirmMutation.isPending || rejectMutation.isPending;
  const canGoBack = (ordersQuery.data?.current_page ?? page) > 1;
  const canGoNext = (ordersQuery.data?.current_page ?? page) < (ordersQuery.data?.last_page ?? page);
  const selectedProfile = selectedOrder?.customer_snapshot?.profile;
  const selectedKycProfile = selectedOrder?.customer_snapshot?.kyc_profile;

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-6">
          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <ClipboardList className="h-6 w-6 text-emerald-600" />
                  FX orders
                </CardTitle>
                <CardDescription>
                  Review customer FX requests submitted after KYC/KYB verification and decide whether to confirm or reject them.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                className="rounded-2xl border-slate-200"
                onClick={() => void ordersQuery.refetch()}
                disabled={ordersQuery.isFetching}
              >
                <RefreshCcw className={ordersQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-4">
                {stats.map((item) => (
                  <div key={item.label} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-[220px_260px_1fr]">
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as OrderStatusFilter)}>
                  <SelectTrigger className="h-11 rounded-2xl border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={providerFilter} onValueChange={setProviderFilter}>
                  <SelectTrigger className="h-11 rounded-2xl border-slate-200">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All providers</SelectItem>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={String(provider.id)}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <Table className="min-w-[960px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Rate / Fee</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length > 0 ? (
                        rows.map((order) => {
                          const isSelected = selectedOrder?.id === order.id;
                          const isPending = order.status === "pending";

                          return (
                            <TableRow key={order.id} className={isSelected ? "bg-emerald-50/70" : undefined}>
                              <TableCell>
                                <div className="font-semibold text-slate-950">{order.order_no}</div>
                                <div className="text-xs text-slate-500">{formatDate(order.created_at)}</div>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-slate-900">{getCustomerName(order)}</div>
                                <div className="text-xs text-slate-500">{getCustomerEmail(order)}</div>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-slate-900">{order.provider?.name || `Provider #${order.provider_id}`}</div>
                                <div className="text-xs text-slate-500">{order.provider?.code || "No provider code"}</div>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-slate-900">
                                  {formatAmount(order.source_amount, order.source_currency)}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {formatAmount(order.target_amount, order.target_currency)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-slate-900">{formatNumber(order.fx_rate)}</div>
                                <div className="text-xs text-slate-500">
                                  Fee {formatAmount(order.fee_amount, order.fee_currency || order.target_currency)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={statusClassName(order.status)}>{order.status}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant={isSelected ? "default" : "outline"} onClick={() => setSelectedOrder(order)}>
                                    <Eye className="h-4 w-4" />
                                    Detail
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                    onClick={() => openDecisionDialog("confirm", order)}
                                    disabled={!isPending}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    Confirm
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={() => openDecisionDialog("reject", order)}
                                    disabled={!isPending}
                                  >
                                    <XCircle className="h-4 w-4" />
                                    Reject
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="h-36 text-center text-slate-500">
                            {ordersQuery.isLoading ? "Loading FX orders..." : "No FX orders found."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                <div>
                  Page {ordersQuery.data?.current_page ?? page} of {ordersQuery.data?.last_page ?? 1}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={!canGoBack} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={!canGoNext} onClick={() => setPage((current) => current + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle>Order detail</CardTitle>
            <CardDescription>Customer snapshot and submitted provider instruction for the selected request.</CardDescription>
          </CardHeader>
          <CardContent>
            {selectedOrder ? (
              <div className="space-y-5">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-slate-950">{selectedOrder.order_no}</div>
                      <div className="text-sm text-slate-500">{formatDate(selectedOrder.created_at)}</div>
                    </div>
                    <Badge className={statusClassName(selectedOrder.status)}>{selectedOrder.status}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <DetailLine label="Customer" value={getCustomerName(selectedOrder)} />
                    <DetailLine label="Email" value={getCustomerEmail(selectedOrder)} />
                    <DetailLine label="Phone" value={selectedOrder.customer_snapshot?.user?.phone || selectedOrder.user?.phone} />
                    <DetailLine label="KYC status" value={selectedOrder.customer_snapshot?.user?.kyc_status || selectedOrder.user?.kyc_status} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailLine label="Provider" value={selectedOrder.provider?.name || `Provider #${selectedOrder.provider_id}`} />
                  <DetailLine label="Send" value={formatAmount(selectedOrder.source_amount, selectedOrder.source_currency)} />
                  <DetailLine label="Receive" value={formatAmount(selectedOrder.target_amount, selectedOrder.target_currency)} />
                  <DetailLine label="FX rate" value={formatNumber(selectedOrder.fx_rate)} />
                  <DetailLine label="Fee" value={formatAmount(selectedOrder.fee_amount, selectedOrder.fee_currency || selectedOrder.target_currency)} />
                  <DetailLine label="Confirmed at" value={formatDate(selectedOrder.confirmed_at)} />
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="font-semibold text-slate-950">Profile snapshot</div>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <DetailLine label="User type" value={getSnapshotValue(selectedProfile, "user_type")} />
                    <DetailLine label="Company" value={getSnapshotValue(selectedProfile, "company_name")} />
                    <DetailLine label="Legal name" value={getSnapshotValue(selectedKycProfile, "legal_name")} />
                    <DetailLine label="Business name" value={getSnapshotValue(selectedKycProfile, "business_name")} />
                    <DetailLine label="Country" value={getSnapshotValue(selectedKycProfile, "country_code")} />
                    <DetailLine label="City" value={getSnapshotValue(selectedKycProfile, "city")} />
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="font-semibold text-slate-950">Admin note</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {selectedOrder.admin_note || "No admin note recorded."}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-950 p-4 text-slate-100">
                  <div className="font-semibold">Raw submission data</div>
                  <pre className="mt-3 max-h-64 overflow-auto text-xs leading-5 text-slate-300">
                    {JSON.stringify(selectedOrder.raw_data ?? {}, null, 2)}
                  </pre>
                </div>

                {selectedOrder.status === "pending" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openDecisionDialog("confirm", selectedOrder)}>
                      <CheckCircle2 className="h-4 w-4" />
                      Confirm order
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => openDecisionDialog("reject", selectedOrder)}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject order
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">
                Select an FX order to inspect the submitted customer information.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={decisionDialog !== null} onOpenChange={(open) => !open && setDecisionDialog(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[28px] border-slate-200 bg-white text-slate-950 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{decisionDialog?.mode === "confirm" ? "Confirm FX order" : "Reject FX order"}</DialogTitle>
            <DialogDescription>
              {decisionDialog?.mode === "confirm"
                ? "Confirming marks the customer instruction as accepted and stores final trade values for operations."
                : "Rejecting closes the pending customer instruction and stores the reason for follow-up."}
            </DialogDescription>
          </DialogHeader>

          {decisionDialog && (
            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-semibold text-slate-950">{decisionDialog.order.order_no}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {getCustomerName(decisionDialog.order)} - {decisionDialog.order.provider?.name || `Provider #${decisionDialog.order.provider_id}`}
                </div>
                <div className="mt-3 text-sm text-slate-700">
                  {formatAmount(decisionDialog.order.source_amount, decisionDialog.order.source_currency)} to{" "}
                  {formatAmount(decisionDialog.order.target_amount, decisionDialog.order.target_currency)}
                </div>
              </div>

              {decisionDialog.mode === "confirm" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="target_amount">Final target amount</Label>
                    <Input
                      id="target_amount"
                      inputMode="decimal"
                      value={decisionForm.target_amount}
                      onChange={(event) => setDecisionForm((current) => ({ ...current, target_amount: event.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fx_rate">Final FX rate</Label>
                    <Input
                      id="fx_rate"
                      inputMode="decimal"
                      value={decisionForm.fx_rate}
                      onChange={(event) => setDecisionForm((current) => ({ ...current, fx_rate: event.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fee_amount">Fee amount</Label>
                    <Input
                      id="fee_amount"
                      inputMode="decimal"
                      value={decisionForm.fee_amount}
                      onChange={(event) => setDecisionForm((current) => ({ ...current, fee_amount: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fee_currency">Fee currency</Label>
                    <Input
                      id="fee_currency"
                      value={decisionForm.fee_currency}
                      onChange={(event) => setDecisionForm((current) => ({ ...current, fee_currency: event.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="admin_note">{decisionDialog.mode === "confirm" ? "Admin note" : "Rejection note"}</Label>
                <Textarea
                  id="admin_note"
                  value={decisionForm.admin_note}
                  onChange={(event) => setDecisionForm((current) => ({ ...current, admin_note: event.target.value }))}
                  placeholder={decisionDialog.mode === "confirm" ? "Internal confirmation note" : "Reason for rejecting this order"}
                  rows={4}
                />
              </div>

              {actionError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {actionError}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog(null)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              className={
                decisionDialog?.mode === "reject"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }
              onClick={submitDecision}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : decisionDialog?.mode === "reject" ? "Reject order" : "Confirm order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminFxOrders;
