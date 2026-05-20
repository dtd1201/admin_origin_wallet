import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type { ManagedExchangeRate } from "@/types/admin";
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

type RateFormState = {
  rate_type: "provider" | "bank";
  audience: "public" | "authenticated";
  source_code: string;
  source_name: string;
  source_currency: string;
  target_currency: string;
  buy_rate: string;
  sell_rate: string;
  mid_rate: string;
  fee_amount: string;
  status: "active" | "inactive";
  display_order: string;
  notes: string;
};

const emptyForm: RateFormState = {
  rate_type: "bank",
  audience: "public",
  source_code: "",
  source_name: "",
  source_currency: "USD",
  target_currency: "VND",
  buy_rate: "",
  sell_rate: "",
  mid_rate: "",
  fee_amount: "0",
  status: "active",
  display_order: "0",
  notes: "",
};

const numberOrNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
};

const formatRate = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(numeric)
    : String(value);
};

const AdminExchangeRates = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [rateTypeFilter, setRateTypeFilter] = useState<"all" | "provider" | "bank">("all");
  const [audienceFilter, setAudienceFilter] = useState<"all" | "public" | "authenticated">("all");
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [selectedRate, setSelectedRate] = useState<ManagedExchangeRate | null>(null);
  const [formState, setFormState] = useState<RateFormState>(emptyForm);
  const [formError, setFormError] = useState("");

  const queryPath = [
    adminEndpointConfig.exchangeRates,
    "?",
    rateTypeFilter !== "all" ? `rate_type=${rateTypeFilter}&` : "",
    audienceFilter !== "all" ? `audience=${audienceFilter}&` : "",
  ].join("");

  const ratesQuery = useQuery({
    queryKey: ["admin", "exchange-rates", rateTypeFilter, audienceFilter, token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<ManagedExchangeRate>>(queryPath, { method: "GET", token }),
  });

  const rows = ratesQuery.data?.data ?? [];

  const invalidateRates = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "exchange-rates"] });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      requestApi<ManagedExchangeRate>(adminEndpointConfig.exchangeRates, {
        method: "POST",
        token,
        body: payload,
      }),
    onSuccess: async () => {
      await invalidateRates();
      setDialogMode(null);
      setFormState(emptyForm);
      setFormError("");
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "Unable to create exchange rate."),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      requestApi<ManagedExchangeRate>(`${adminEndpointConfig.exchangeRates}/${id}`, {
        method: "PUT",
        token,
        body: payload,
      }),
    onSuccess: async () => {
      await invalidateRates();
      setDialogMode(null);
      setSelectedRate(null);
      setFormState(emptyForm);
      setFormError("");
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "Unable to update exchange rate."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      requestApi<null>(`${adminEndpointConfig.exchangeRates}/${id}`, {
        method: "DELETE",
        token,
      }),
    onSuccess: invalidateRates,
    onError: (error) => setFormError(error instanceof Error ? error.message : "Unable to delete exchange rate."),
  });

  const openCreateDialog = () => {
    setSelectedRate(null);
    setFormState(emptyForm);
    setFormError("");
    setDialogMode("create");
  };

  const openEditDialog = (rate: ManagedExchangeRate) => {
    setSelectedRate(rate);
    setFormState({
      rate_type: rate.rate_type,
      audience: rate.audience,
      source_code: rate.source_code,
      source_name: rate.source_name,
      source_currency: rate.source_currency,
      target_currency: rate.target_currency,
      buy_rate: rate.buy_rate === null ? "" : String(rate.buy_rate),
      sell_rate: rate.sell_rate === null ? "" : String(rate.sell_rate),
      mid_rate: rate.mid_rate === null ? "" : String(rate.mid_rate),
      fee_amount: String(rate.fee_amount ?? 0),
      status: rate.status === "inactive" ? "inactive" : "active",
      display_order: String(rate.display_order ?? 0),
      notes: rate.notes ?? "",
    });
    setFormError("");
    setDialogMode("edit");
  };

  const submitForm = async () => {
    setFormError("");

    if (!formState.source_code.trim() || !formState.source_name.trim()) {
      setFormError("Source code and source name are required.");
      return;
    }

    if (!formState.buy_rate.trim() && !formState.sell_rate.trim() && !formState.mid_rate.trim()) {
      setFormError("Enter at least one buy, sell, or mid rate.");
      return;
    }

    const payload = {
      rate_type: formState.rate_type,
      audience: formState.audience,
      source_code: formState.source_code.trim(),
      source_name: formState.source_name.trim(),
      source_currency: formState.source_currency.trim().toUpperCase(),
      target_currency: formState.target_currency.trim().toUpperCase(),
      buy_rate: numberOrNull(formState.buy_rate),
      sell_rate: numberOrNull(formState.sell_rate),
      mid_rate: numberOrNull(formState.mid_rate),
      fee_amount: Number(formState.fee_amount || 0),
      status: formState.status,
      display_order: Number(formState.display_order || 0),
      notes: formState.notes.trim() || null,
    };

    if (dialogMode === "create") {
      await createMutation.mutateAsync(payload);
      return;
    }

    if (selectedRate) {
      await updateMutation.mutateAsync({ id: selectedRate.id, payload });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-2xl">Exchange rates</CardTitle>
            <CardDescription>
              Maintain provider and Vietnam bank rates for public visitors and signed-in users.
            </CardDescription>
          </div>
          <Button onClick={openCreateDialog} className="rounded-2xl bg-slate-950 text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            Add rate
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={rateTypeFilter} onValueChange={(value: "all" | "provider" | "bank") => setRateTypeFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Rate type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="provider">Providers</SelectItem>
                <SelectItem value="bank">Vietnam banks</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={audienceFilter}
              onValueChange={(value: "all" | "public" | "authenticated") => setAudienceFilter(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Audience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All audiences</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="authenticated">Signed-in</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{formError}</div>}

          <div className="overflow-x-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead>Buy</TableHead>
                  <TableHead>Sell</TableHead>
                  <TableHead>Mid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{row.source_name}</div>
                        <div className="text-xs text-slate-500">{row.source_code}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.rate_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.audience === "authenticated" ? "default" : "secondary"}>
                          {row.audience === "authenticated" ? "signed-in" : "public"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.source_currency}/{row.target_currency}
                      </TableCell>
                      <TableCell>{formatRate(row.buy_rate)}</TableCell>
                      <TableCell>{formatRate(row.sell_rate)}</TableCell>
                      <TableCell>{formatRate(row.mid_rate)}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(row)}>
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => {
                              if (window.confirm(`Delete rate for ${row.source_name}?`)) {
                                void deleteMutation.mutateAsync(row.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-slate-500">
                      {ratesQuery.isLoading ? "Loading exchange rates..." : "No exchange rates are configured."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[28px] border-slate-200 bg-white text-slate-950 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Add exchange rate" : "Edit exchange rate"}</DialogTitle>
            <DialogDescription>
              Provider rates override provider quotes. Bank rates appear in the mobile Overview screen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Rate type</Label>
              <Select
                value={formState.rate_type}
                onValueChange={(value: "provider" | "bank") => setFormState((current) => ({ ...current, rate_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="provider">Provider</SelectItem>
                  <SelectItem value="bank">Vietnam bank</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Audience</Label>
              <Select
                value={formState.audience}
                onValueChange={(value: "public" | "authenticated") => setFormState((current) => ({ ...current, audience: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public visitors</SelectItem>
                  <SelectItem value="authenticated">Signed-in users</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Source code</Label>
              <Input
                value={formState.source_code}
                onChange={(event) => setFormState((current) => ({ ...current, source_code: event.target.value }))}
                placeholder={formState.rate_type === "provider" ? "wise" : "vcb"}
              />
            </div>

            <div className="grid gap-2">
              <Label>Source name</Label>
              <Input
                value={formState.source_name}
                onChange={(event) => setFormState((current) => ({ ...current, source_name: event.target.value }))}
                placeholder={formState.rate_type === "provider" ? "Wise" : "Vietcombank"}
              />
            </div>

            <div className="grid gap-2">
              <Label>Source currency</Label>
              <Input
                value={formState.source_currency}
                onChange={(event) => setFormState((current) => ({ ...current, source_currency: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Target currency</Label>
              <Input
                value={formState.target_currency}
                onChange={(event) => setFormState((current) => ({ ...current, target_currency: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Buy rate</Label>
              <Input
                inputMode="decimal"
                value={formState.buy_rate}
                onChange={(event) => setFormState((current) => ({ ...current, buy_rate: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Sell rate</Label>
              <Input
                inputMode="decimal"
                value={formState.sell_rate}
                onChange={(event) => setFormState((current) => ({ ...current, sell_rate: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Mid rate</Label>
              <Input
                inputMode="decimal"
                value={formState.mid_rate}
                onChange={(event) => setFormState((current) => ({ ...current, mid_rate: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Display order</Label>
              <Input
                inputMode="numeric"
                value={formState.display_order}
                onChange={(event) => setFormState((current) => ({ ...current, display_order: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={formState.status}
                onValueChange={(value: "active" | "inactive") => setFormState((current) => ({ ...current, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Fee amount</Label>
              <Input
                inputMode="decimal"
                value={formState.fee_amount}
                onChange={(event) => setFormState((current) => ({ ...current, fee_amount: event.target.value }))}
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={formState.notes}
                onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
          </div>

          {formError && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{formError}</div>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitForm()} disabled={isSubmitting} className="bg-slate-950 text-white hover:bg-slate-800">
              {isSubmitting ? "Saving..." : "Save rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminExchangeRates;
