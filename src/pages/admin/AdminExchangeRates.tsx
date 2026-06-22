import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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

type AdminExchangeRatesProps = {
  mode?: "provider" | "customer";
};

type ProviderRateGroup = {
  key: string;
  sourceCode: string;
  sourceName: string;
  rows: ManagedExchangeRate[];
  pairs: string[];
  currencies: string[];
  publicCount: number;
  signedInCount: number;
  activeCount: number;
};

const providerEmptyForm: RateFormState = {
  rate_type: "provider",
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

const customerEmptyForm: RateFormState = {
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

const groupProviderRates = (rows: ManagedExchangeRate[]): ProviderRateGroup[] => {
  const groups = new Map<string, ManagedExchangeRate[]>();

  rows.forEach((row) => {
    const key = row.source_code.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return Array.from(groups.entries())
    .map(([key, groupRows]) => {
      const sortedRows = [...groupRows].sort((left, right) => {
        const leftPair = `${left.source_currency}/${left.target_currency}`;
        const rightPair = `${right.source_currency}/${right.target_currency}`;
        return leftPair.localeCompare(rightPair) || left.audience.localeCompare(right.audience);
      });
      const pairs = Array.from(
        new Set(sortedRows.map((row) => `${row.source_currency}/${row.target_currency}`)),
      ).sort();
      const currencies = Array.from(
        new Set(sortedRows.flatMap((row) => [row.source_currency, row.target_currency])),
      ).sort();

      return {
        key,
        sourceCode: sortedRows[0]?.source_code ?? key,
        sourceName: sortedRows[0]?.source_name ?? key,
        rows: sortedRows,
        pairs,
        currencies,
        publicCount: sortedRows.filter((row) => row.audience === "public").length,
        signedInCount: sortedRows.filter((row) => row.audience === "authenticated").length,
        activeCount: sortedRows.filter((row) => row.status === "active").length,
      };
    })
    .sort((left, right) => left.sourceName.localeCompare(right.sourceName));
};

const AdminExchangeRates = ({ mode = "provider" }: AdminExchangeRatesProps) => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const isProviderMode = mode === "provider";
  const [rateTypeFilter, setRateTypeFilter] = useState<"all" | "provider" | "bank">("all");
  const [audienceFilter, setAudienceFilter] = useState<"all" | "public" | "authenticated">("all");
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [selectedRate, setSelectedRate] = useState<ManagedExchangeRate | null>(null);
  const [formState, setFormState] = useState<RateFormState>(isProviderMode ? providerEmptyForm : customerEmptyForm);
  const [formError, setFormError] = useState("");

  const effectiveRateTypeFilter = isProviderMode ? "provider" : rateTypeFilter;
  const queryPath = useMemo(() => {
    const params = new URLSearchParams();

    if (effectiveRateTypeFilter !== "all") {
      params.set("rate_type", effectiveRateTypeFilter);
    }

    if (audienceFilter !== "all") {
      params.set("audience", audienceFilter);
    }

    const query = params.toString();
    return query ? `${adminEndpointConfig.exchangeRates}?${query}` : adminEndpointConfig.exchangeRates;
  }, [audienceFilter, effectiveRateTypeFilter]);

  const ratesQuery = useQuery({
    queryKey: ["admin", "exchange-rates", mode, effectiveRateTypeFilter, audienceFilter, token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<ManagedExchangeRate>>(queryPath, { method: "GET", token }),
  });

  const rows = useMemo(() => ratesQuery.data?.data ?? [], [ratesQuery.data?.data]);
  const providerGroups = useMemo(() => groupProviderRates(rows), [rows]);
  const title = isProviderMode ? "Provider exchange rates" : "Customer display rates";
  const description = isProviderMode
    ? "Manage each provider by supported currency pair. Add one row for every currency pair the provider supports."
    : "Manage rates that are published to public visitors and signed-in customers in the mobile app.";

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
      setFormState(isProviderMode ? providerEmptyForm : customerEmptyForm);
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
      setFormState(isProviderMode ? providerEmptyForm : customerEmptyForm);
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
    setFormState(isProviderMode ? providerEmptyForm : customerEmptyForm);
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
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button onClick={openCreateDialog} className="rounded-2xl bg-slate-950 text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            {isProviderMode ? "Add provider pair" : "Add display rate"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {!isProviderMode && (
              <Select value={rateTypeFilter} onValueChange={(value: "all" | "provider" | "bank") => setRateTypeFilter(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Rate type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All display types</SelectItem>
                  <SelectItem value="provider">Provider overrides</SelectItem>
                  <SelectItem value="bank">Vietnam banks</SelectItem>
                </SelectContent>
              </Select>
            )}
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

          {isProviderMode ? (
            <div className="space-y-4">
              {providerGroups.length > 0 ? (
                providerGroups.map((group) => (
                  <div key={group.key} className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-slate-950">{group.sourceName}</h3>
                          <Badge variant="outline">{group.sourceCode}</Badge>
                          <Badge variant="secondary">{group.pairs.length} pairs</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {group.currencies.map((currency) => (
                            <span key={currency} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                              {currency}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500 sm:min-w-[320px]">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <div className="text-base font-semibold text-slate-950">{group.activeCount}</div>
                          <div>active rows</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <div className="text-base font-semibold text-slate-950">{group.publicCount}</div>
                          <div>public</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <div className="text-base font-semibold text-slate-950">{group.signedInCount}</div>
                          <div>signed-in</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <Table className="min-w-[880px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Audience</TableHead>
                            <TableHead>Currency pair</TableHead>
                            <TableHead>Buy</TableHead>
                            <TableHead>Sell</TableHead>
                            <TableHead>Mid</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.rows.map((row) => (
                            <TableRow key={row.id}>
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
                                      if (window.confirm(`Delete rate for ${row.source_name} ${row.source_currency}/${row.target_currency}?`)) {
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
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
                  {ratesQuery.isLoading ? "Loading provider rates..." : "No provider currency pairs are configured."}
                </div>
              )}
            </div>
          ) : (
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
                        {ratesQuery.isLoading ? "Loading customer display rates..." : "No customer display rates are configured."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && setDialogMode(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[28px] border-slate-200 bg-white text-slate-950 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create"
                ? isProviderMode
                  ? "Add provider currency pair"
                  : "Add customer display rate"
                : "Edit exchange rate"}
            </DialogTitle>
            <DialogDescription>
              {isProviderMode
                ? "Create one configured rate row for each currency pair supported by a provider."
                : "These rates are published to customer-facing mobile screens and quote previews."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            {!isProviderMode && (
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
                    <SelectItem value="provider">Provider override</SelectItem>
                    <SelectItem value="bank">Vietnam bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

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
                placeholder={isProviderMode || formState.rate_type === "provider" ? "nium" : "vcb"}
              />
            </div>

            <div className="grid gap-2">
              <Label>Source name</Label>
              <Input
                value={formState.source_name}
                onChange={(event) => setFormState((current) => ({ ...current, source_name: event.target.value }))}
                placeholder={isProviderMode || formState.rate_type === "provider" ? "Nium" : "Vietcombank"}
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
