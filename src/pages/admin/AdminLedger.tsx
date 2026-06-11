import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, ReceiptText, RefreshCcw, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type { AdminLedgerEntry, AdminWalletAccount } from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "posted", label: "Posted" },
  { value: "reversed", label: "Reversed" },
  { value: "failed", label: "Failed" },
] as const;

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

const statusClassName = (status: string) => {
  const normalized = status.toLowerCase();

  if (["active", "posted"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  }

  if (["failed", "closed", "reversed"].includes(normalized)) {
    return "bg-red-100 text-red-700 hover:bg-red-100";
  }

  if (["pending", "frozen", "hold"].includes(normalized)) {
    return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  }

  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

const getEntrySign = (entryType: string) => {
  const normalized = entryType.toLowerCase();
  if (["debit", "hold", "fee"].includes(normalized)) {
    return "-";
  }

  if (["credit", "release", "reversal"].includes(normalized)) {
    return "+";
  }

  return "";
};

const AdminLedger = () => {
  const { token } = useAuth();
  const [ledgerPage, setLedgerPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [search, setSearch] = useState("");

  const ledgerQueryPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(ledgerPage));

    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }

    if (currencyFilter !== "all") {
      params.set("currency", currencyFilter);
    }

    if (search.trim()) {
      params.set("search", search.trim());
    }

    return `${adminEndpointConfig.ledgerEntries}?${params.toString()}`;
  }, [currencyFilter, ledgerPage, search, statusFilter]);

  const walletsQuery = useQuery({
    queryKey: ["admin", "wallets", token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<AdminWalletAccount>>(adminEndpointConfig.wallets, { method: "GET", token }),
  });

  const ledgerQuery = useQuery({
    queryKey: ["admin", "ledger-entries", statusFilter, currencyFilter, search, ledgerPage, token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<AdminLedgerEntry>>(ledgerQueryPath, { method: "GET", token }),
  });

  const wallets = useMemo(() => walletsQuery.data?.data ?? [], [walletsQuery.data?.data]);
  const ledgerRows = useMemo(() => ledgerQuery.data?.data ?? [], [ledgerQuery.data?.data]);
  const currencies = useMemo(
    () => Array.from(new Set([...wallets.map((wallet) => wallet.currency), ...ledgerRows.map((entry) => entry.currency)])).sort(),
    [ledgerRows, wallets],
  );
  const canGoBack = (ledgerQuery.data?.current_page ?? ledgerPage) > 1;
  const canGoNext = (ledgerQuery.data?.current_page ?? ledgerPage) < (ledgerQuery.data?.last_page ?? ledgerPage);
  const totalAvailableByCurrency = wallets.reduce<Record<string, number>>((accumulator, wallet) => {
    const value = Number(wallet.available_balance);
    accumulator[wallet.currency] = (accumulator[wallet.currency] ?? 0) + (Number.isFinite(value) ? value : 0);
    return accumulator;
  }, {});

  const refreshAll = async () => {
    await Promise.all([walletsQuery.refetch(), ledgerQuery.refetch()]);
  };

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
        <div className="space-y-6">
          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Wallet className="h-6 w-6 text-emerald-600" />
                  Wallet ledger
                </CardTitle>
                <CardDescription>Review balances, holds, posted entries, and reconciliation signals by wallet and currency.</CardDescription>
              </div>
              <Button
                variant="outline"
                className="rounded-2xl border-slate-200"
                onClick={() => void refreshAll()}
                disabled={walletsQuery.isFetching || ledgerQuery.isFetching}
              >
                <RefreshCcw className={walletsQuery.isFetching || ledgerQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              {(walletsQuery.isError || ledgerQuery.isError) && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {walletsQuery.error instanceof Error
                    ? walletsQuery.error.message
                    : ledgerQuery.error instanceof Error
                      ? ledgerQuery.error.message
                      : "Unable to load ledger data."}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <SignalCard icon={Wallet} title="Wallets" value={walletsQuery.data?.total ?? 0} />
                <SignalCard icon={ReceiptText} title="Ledger entries" value={ledgerQuery.data?.total ?? 0} />
                <SignalCard icon={ArrowRightLeft} title="Pending visible" value={ledgerRows.filter((entry) => entry.status === "pending").length} />
              </div>

              <div className="grid gap-3 md:grid-cols-[180px_180px_1fr]">
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value);
                    setLedgerPage(1);
                  }}
                >
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

                <Select
                  value={currencyFilter}
                  onValueChange={(value) => {
                    setCurrencyFilter(value);
                    setLedgerPage(1);
                  }}
                >
                  <SelectTrigger className="h-11 rounded-2xl border-slate-200">
                    <SelectValue placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All currencies</SelectItem>
                    {currencies.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setLedgerPage(1);
                  }}
                  placeholder="Search reference, user, source"
                  className="h-11 rounded-2xl border-slate-200"
                />
              </div>

              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <Table className="min-w-[980px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>User / Wallet</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Balance after</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Posted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerRows.length > 0 ? (
                        ledgerRows.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              <div className="font-semibold text-slate-950">{entry.reference}</div>
                              <div className="text-xs text-slate-500">
                                {entry.source_type || "source"} {entry.source_id ?? ""}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-slate-900">
                                {entry.user?.email || (entry.user_id ? `User #${entry.user_id}` : "-")}
                              </div>
                              <div className="text-xs text-slate-500">
                                {entry.wallet?.account_reference || (entry.wallet_id ? `Wallet #${entry.wallet_id}` : "-")}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{entry.entry_type}</Badge>
                              {entry.description && <div className="mt-2 max-w-[260px] truncate text-xs text-slate-500">{entry.description}</div>}
                            </TableCell>
                            <TableCell>
                              <div className="font-semibold text-slate-950">
                                {getEntrySign(entry.entry_type)}
                                {formatAmount(entry.amount, entry.currency)}
                              </div>
                            </TableCell>
                            <TableCell>{formatAmount(entry.balance_after, entry.currency)}</TableCell>
                            <TableCell>
                              <Badge className={statusClassName(entry.status)}>{entry.status}</Badge>
                            </TableCell>
                            <TableCell>{formatDate(entry.posted_at || entry.created_at)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="h-36 text-center text-slate-500">
                            {ledgerQuery.isLoading ? "Loading ledger entries..." : "No ledger entries found."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                <div>
                  Page {ledgerQuery.data?.current_page ?? ledgerPage} of {ledgerQuery.data?.last_page ?? 1}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={!canGoBack} onClick={() => setLedgerPage((current) => Math.max(1, current - 1))}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={!canGoNext} onClick={() => setLedgerPage((current) => current + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Balances by currency</CardTitle>
              <CardDescription>Available balances from visible wallet accounts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.keys(totalAvailableByCurrency).length ? (
                Object.entries(totalAvailableByCurrency).map(([currency, value]) => (
                  <div key={currency} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">{currency}</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(value)}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
                  {walletsQuery.isLoading ? "Loading wallet balances..." : "No wallet balances found."}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Wallet accounts</CardTitle>
              <CardDescription>Current wallet accounts visible to operations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {wallets.length ? (
                wallets.slice(0, 8).map((wallet) => (
                  <div key={wallet.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">
                          {wallet.account_reference || `Wallet #${wallet.id}`}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {wallet.user?.email || (wallet.user_id ? `User #${wallet.user_id}` : "Platform wallet")}
                        </div>
                      </div>
                      <Badge className={statusClassName(wallet.status)}>{wallet.status}</Badge>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <DetailLine label="Available" value={formatAmount(wallet.available_balance, wallet.currency)} />
                      <DetailLine label="Ledger" value={formatAmount(wallet.ledger_balance, wallet.currency)} />
                      <DetailLine label="Hold" value={formatAmount(wallet.hold_balance, wallet.currency)} />
                      <DetailLine label="Reconciled" value={formatDate(wallet.last_reconciled_at)} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
                  {walletsQuery.isLoading ? "Loading wallet accounts..." : "No wallet accounts found."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

function SignalCard({ icon: Icon, title, value }: { icon: typeof Wallet; title: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-sm text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 break-words font-medium text-slate-900">{value}</div>
    </div>
  );
}

export default AdminLedger;
