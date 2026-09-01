import { useQuery } from "@tanstack/react-query";
import { Eye, RefreshCcw, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { getAdminLedgerEntries, getAdminLedgerEntry, getAdminWallet, getAdminWallets } from "@/lib/api";

const ledgerStatuses = ["all", "pending", "posted", "reversed", "failed"] as const;
const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};
const formatAmount = (value?: string | number | null, currency?: string | null) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  const amount = Number.isFinite(numeric) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(numeric) : String(value);
  return `${amount} ${currency || ""}`.trim();
};
const maskIdentifier = (value?: string | number | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";
  return normalized.length <= 4 ? "****" : `****${normalized.slice(-4)}`;
};
const safeWalletStatus = (status: string) => status === "active" ? "active" : "unknown";
const statusClassName = (status: string) => {
  if (["active", "posted"].includes(status)) return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  if (["failed", "reversed"].includes(status)) return "bg-red-100 text-red-700 hover:bg-red-100";
  if (status === "pending") return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

const AdminLedger = () => {
  const { token } = useAuth();
  const [walletPage, setWalletPage] = useState(1);
  const [walletUserId, setWalletUserId] = useState("");
  const [walletCurrency, setWalletCurrency] = useState("");
  const [walletSearch, setWalletSearch] = useState("");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerStatus, setLedgerStatus] = useState("all");
  const [ledgerCurrency, setLedgerCurrency] = useState("");
  const [ledgerEntryType, setLedgerEntryType] = useState("");
  const [ledgerProviderId, setLedgerProviderId] = useState("");
  const [ledgerUserId, setLedgerUserId] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [selectedLedgerId, setSelectedLedgerId] = useState<number | null>(null);

  const walletQuery = useMemo(() => {
    const params = new URLSearchParams({ page: String(walletPage) });
    if (walletUserId.trim()) params.set("user_id", walletUserId.trim());
    if (walletCurrency.trim()) params.set("currency", walletCurrency.trim().toUpperCase());
    if (walletSearch.trim()) params.set("search", walletSearch.trim());
    return params.toString();
  }, [walletCurrency, walletPage, walletSearch, walletUserId]);
  const ledgerQuery = useMemo(() => {
    const params = new URLSearchParams({ page: String(ledgerPage) });
    if (ledgerStatus !== "all") params.set("status", ledgerStatus);
    if (ledgerCurrency.trim()) params.set("currency", ledgerCurrency.trim().toUpperCase());
    if (ledgerEntryType.trim()) params.set("entry_type", ledgerEntryType.trim());
    if (ledgerProviderId.trim()) params.set("provider_id", ledgerProviderId.trim());
    if (ledgerUserId.trim()) params.set("user_id", ledgerUserId.trim());
    if (ledgerSearch.trim()) params.set("search", ledgerSearch.trim());
    return params.toString();
  }, [ledgerCurrency, ledgerEntryType, ledgerPage, ledgerProviderId, ledgerSearch, ledgerStatus, ledgerUserId]);

  const walletsQuery = useQuery({ queryKey: ["admin", "wallets", walletQuery, token], enabled: !!token, queryFn: () => getAdminWallets(walletQuery, token) });
  const ledgerEntriesQuery = useQuery({ queryKey: ["admin", "ledger-entries", ledgerQuery, token], enabled: !!token, queryFn: () => getAdminLedgerEntries(ledgerQuery, token) });
  const walletDetailQuery = useQuery({ queryKey: ["admin", "wallets", "detail", selectedWalletId, token], enabled: !!token && selectedWalletId !== null, queryFn: () => getAdminWallet(selectedWalletId as number, token) });
  const ledgerDetailQuery = useQuery({ queryKey: ["admin", "ledger-entries", "detail", selectedLedgerId, token], enabled: !!token && selectedLedgerId !== null, queryFn: () => getAdminLedgerEntry(selectedLedgerId as number, token) });
  const wallets = walletsQuery.data?.data ?? [];
  const entries = ledgerEntriesQuery.data?.data ?? [];

  return <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
    <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><CardTitle className="flex items-center gap-2 text-2xl"><Wallet className="h-6 w-6 text-emerald-600" />Wallet accounts</CardTitle><CardDescription>Provider-reported wallet balances shown independently by wallet and currency.</CardDescription></div><Button type="button" variant="outline" onClick={() => void walletsQuery.refetch()} disabled={walletsQuery.isFetching}><RefreshCcw className={walletsQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Refresh wallets</Button></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3"><Input aria-label="Filter wallets by user" inputMode="numeric" value={walletUserId} onChange={(event) => { setWalletUserId(event.target.value); setWalletPage(1); }} placeholder="User ID" className="rounded-2xl" /><Input aria-label="Filter wallets by currency" maxLength={3} value={walletCurrency} onChange={(event) => { setWalletCurrency(event.target.value); setWalletPage(1); }} placeholder="Currency" className="rounded-2xl" /><Input aria-label="Search wallets" value={walletSearch} onChange={(event) => { setWalletSearch(event.target.value); setWalletPage(1); }} placeholder="Search user or wallet" className="rounded-2xl" /></div>
        {walletsQuery.isError ? <ErrorPanel message={walletsQuery.error instanceof Error ? walletsQuery.error.message : "Unable to load wallets."} /> : null}
        <div className="rounded-2xl bg-slate-950 p-4 text-white"><div className="text-xs uppercase tracking-[0.18em] text-emerald-300">Current page</div><div className="mt-1 text-xl font-semibold">{wallets.length} wallets visible</div><div className="mt-1 text-xs text-slate-400">Not a global balance or wallet total.</div></div>
        <div className="overflow-hidden rounded-3xl border border-slate-200"><div className="overflow-x-auto"><Table className="min-w-[960px]"><TableHeader><TableRow><TableHead>Wallet</TableHead><TableHead>User</TableHead><TableHead>Currency</TableHead><TableHead>Available balance</TableHead><TableHead>Ledger balance</TableHead><TableHead>Reserved balance</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Detail</TableHead></TableRow></TableHeader><TableBody>{wallets.length ? wallets.map((wallet) => <TableRow key={wallet.id}><TableCell className="font-semibold">{maskIdentifier(wallet.account_reference)}</TableCell><TableCell>{wallet.user?.email || "-"}</TableCell><TableCell>{wallet.currency || "-"}</TableCell><TableCell>{formatAmount(wallet.available_balance, wallet.currency)}</TableCell><TableCell>{formatAmount(wallet.ledger_balance, wallet.currency)}</TableCell><TableCell>{formatAmount(wallet.hold_balance, wallet.currency)}</TableCell><TableCell><Badge className={statusClassName(safeWalletStatus(wallet.status))}>{safeWalletStatus(wallet.status)}</Badge></TableCell><TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => setSelectedWalletId(wallet.id)}><Eye className="h-4 w-4" />Inspect wallet</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-500">{walletsQuery.isLoading ? "Loading wallet accounts..." : "No wallet accounts found."}</TableCell></TableRow>}</TableBody></Table></div></div>
        <Pagination page={walletsQuery.data?.current_page ?? walletPage} lastPage={walletsQuery.data?.last_page ?? 1} prefix="wallet" onBack={() => setWalletPage((value) => Math.max(1, value - 1))} onNext={() => setWalletPage((value) => value + 1)} />
      </CardContent>
    </Card>

    <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><CardTitle className="text-2xl">Ledger entries</CardTitle><CardDescription>Authoritative posted amounts and balances without inferred transaction direction.</CardDescription></div><Button type="button" variant="outline" onClick={() => void ledgerEntriesQuery.refetch()} disabled={ledgerEntriesQuery.isFetching}><RefreshCcw className={ledgerEntriesQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Refresh ledger</Button></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><Select value={ledgerStatus} onValueChange={(value) => { setLedgerStatus(value); setLedgerPage(1); }}><SelectTrigger aria-label="Filter ledger by status" className="rounded-2xl"><SelectValue /></SelectTrigger><SelectContent>{ledgerStatuses.map((value) => <SelectItem key={value} value={value}>{value === "all" ? "All statuses" : value}</SelectItem>)}</SelectContent></Select><Input aria-label="Filter ledger by entry type" value={ledgerEntryType} onChange={(event) => { setLedgerEntryType(event.target.value); setLedgerPage(1); }} placeholder="Entry type" className="rounded-2xl" /><Input aria-label="Filter ledger by provider" inputMode="numeric" value={ledgerProviderId} onChange={(event) => { setLedgerProviderId(event.target.value); setLedgerPage(1); }} placeholder="Provider ID" className="rounded-2xl" /><Input aria-label="Filter ledger by user" inputMode="numeric" value={ledgerUserId} onChange={(event) => { setLedgerUserId(event.target.value); setLedgerPage(1); }} placeholder="User ID" className="rounded-2xl" /><Input aria-label="Filter ledger by currency" maxLength={3} value={ledgerCurrency} onChange={(event) => { setLedgerCurrency(event.target.value); setLedgerPage(1); }} placeholder="Currency" className="rounded-2xl" /><Input aria-label="Search ledger" value={ledgerSearch} onChange={(event) => { setLedgerSearch(event.target.value); setLedgerPage(1); }} placeholder="Search ledger" className="rounded-2xl" /></div>
        {ledgerEntriesQuery.isError ? <ErrorPanel message={ledgerEntriesQuery.error instanceof Error ? ledgerEntriesQuery.error.message : "Unable to load ledger entries."} /> : null}
        <div className="overflow-hidden rounded-3xl border border-slate-200"><div className="overflow-x-auto"><Table className="min-w-[980px]"><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Wallet</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Balance after</TableHead><TableHead>Status</TableHead><TableHead>Posted</TableHead><TableHead className="text-right">Detail</TableHead></TableRow></TableHeader><TableBody>{entries.length ? entries.map((entry) => <TableRow key={entry.id}><TableCell className="font-semibold">{maskIdentifier(entry.reference)}</TableCell><TableCell>{maskIdentifier(entry.wallet?.account_reference)}</TableCell><TableCell>{entry.entry_type}</TableCell><TableCell>{formatAmount(entry.amount, entry.currency)}</TableCell><TableCell>{formatAmount(entry.balance_after, entry.currency)}</TableCell><TableCell><Badge className={statusClassName(entry.status)}>{entry.status}</Badge></TableCell><TableCell>{formatDate(entry.posted_at || entry.created_at)}</TableCell><TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => setSelectedLedgerId(entry.id)}><Eye className="h-4 w-4" />Inspect entry</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-500">{ledgerEntriesQuery.isLoading ? "Loading ledger entries..." : "No ledger entries found."}</TableCell></TableRow>}</TableBody></Table></div></div>
        <Pagination page={ledgerEntriesQuery.data?.current_page ?? ledgerPage} lastPage={ledgerEntriesQuery.data?.last_page ?? 1} prefix="ledger" onBack={() => setLedgerPage((value) => Math.max(1, value - 1))} onNext={() => setLedgerPage((value) => value + 1)} />
      </CardContent>
    </Card>

    <Dialog open={selectedWalletId !== null} onOpenChange={(open) => { if (!open) setSelectedWalletId(null); }}><DialogContent className="rounded-3xl"><DialogHeader><DialogTitle>Wallet detail</DialogTitle><DialogDescription>Provider-reported balances remain separate and no derived total is shown.</DialogDescription></DialogHeader>{walletDetailQuery.isLoading ? <Loading text="Loading wallet detail..." /> : walletDetailQuery.isError ? <ErrorPanel message={walletDetailQuery.error instanceof Error ? walletDetailQuery.error.message : "Unable to load wallet detail."} /> : walletDetailQuery.data ? <div className="grid gap-3 sm:grid-cols-2"><Detail label="Wallet" value={maskIdentifier(walletDetailQuery.data.account_reference)} /><Detail label="User" value={walletDetailQuery.data.user?.email || "-"} /><Detail label="Provider" value={walletDetailQuery.data.provider?.name || "-"} /><Detail label="Currency" value={walletDetailQuery.data.currency || "-"} /><Detail label="Available balance" value={formatAmount(walletDetailQuery.data.available_balance, walletDetailQuery.data.currency)} /><Detail label="Ledger balance" value={formatAmount(walletDetailQuery.data.ledger_balance, walletDetailQuery.data.currency)} /><Detail label="Reserved balance" value={formatAmount(walletDetailQuery.data.hold_balance, walletDetailQuery.data.currency)} /><Detail label="Status" value={safeWalletStatus(walletDetailQuery.data.status)} /><Detail label="Provider balance timestamp" value={formatDate(walletDetailQuery.data.last_reconciled_at)} /><Detail label="Record updated at" value={formatDate(walletDetailQuery.data.updated_at)} /></div> : null}</DialogContent></Dialog>
    <Dialog open={selectedLedgerId !== null} onOpenChange={(open) => { if (!open) setSelectedLedgerId(null); }}><DialogContent className="rounded-3xl"><DialogHeader><DialogTitle>Ledger entry detail</DialogTitle><DialogDescription>Operational references and wallet identifiers remain masked.</DialogDescription></DialogHeader>{ledgerDetailQuery.isLoading ? <Loading text="Loading ledger entry detail..." /> : ledgerDetailQuery.isError ? <ErrorPanel message={ledgerDetailQuery.error instanceof Error ? ledgerDetailQuery.error.message : "Unable to load ledger entry detail."} /> : ledgerDetailQuery.data ? <div className="grid gap-3 sm:grid-cols-2"><Detail label="Reference" value={maskIdentifier(ledgerDetailQuery.data.reference)} /><Detail label="Wallet" value={maskIdentifier(ledgerDetailQuery.data.wallet?.account_reference)} /><Detail label="User" value={ledgerDetailQuery.data.user?.email || "-"} /><Detail label="Provider" value={ledgerDetailQuery.data.provider?.name || "-"} /><Detail label="Entry type" value={ledgerDetailQuery.data.entry_type} /><Detail label="Status" value={ledgerDetailQuery.data.status} /><Detail label="Amount" value={formatAmount(ledgerDetailQuery.data.amount, ledgerDetailQuery.data.currency)} /><Detail label="Balance after" value={formatAmount(ledgerDetailQuery.data.balance_after, ledgerDetailQuery.data.currency)} /><Detail label="Source" value={ledgerDetailQuery.data.source_type || "-"} /><Detail label="Source reference" value={maskIdentifier(ledgerDetailQuery.data.source_id)} /><Detail label="Posted" value={formatDate(ledgerDetailQuery.data.posted_at)} /><Detail label="Created" value={formatDate(ledgerDetailQuery.data.created_at)} /></div> : null}</DialogContent></Dialog>
  </div>;
};

const Pagination = ({ page, lastPage, prefix, onBack, onNext }: { page: number; lastPage: number; prefix: string; onBack: () => void; onNext: () => void }) => <div className="flex items-center justify-between text-sm text-slate-500"><span>{prefix === "wallet" ? "Wallet page" : "Ledger page"} {page} of {lastPage}</span><div className="flex gap-2"><Button aria-label={`Previous ${prefix} page`} type="button" size="sm" variant="outline" disabled={page <= 1} onClick={onBack}>Previous</Button><Button aria-label={`Next ${prefix} page`} type="button" size="sm" variant="outline" disabled={page >= lastPage} onClick={onNext}>Next</Button></div></div>;
const Detail = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl border border-slate-200 p-3"><div className="text-xs uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-1 break-words font-medium text-slate-900">{value}</div></div>;
const Loading = ({ text }: { text: string }) => <div className="rounded-3xl border border-dashed border-slate-300 py-14 text-center text-slate-500">{text}</div>;
const ErrorPanel = ({ message }: { message: string }) => <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>;
export default AdminLedger;
