import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, RefreshCcw, ServerCog } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { getAdminProviderAccountSubmissions, syncAdminProviderAccount } from "@/lib/api";
import { maskAdminIdentifier } from "@/lib/adminDataSafety";
import { getProviderDisplayName } from "@/lib/providerDisplay";
import type { AdminKycProviderSubmission } from "@/types/admin";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};

const statusClassName = (status?: string | null) => {
  const normalized = String(status || "unknown").toLowerCase();
  if (["active", "approved", "clear", "completed"].includes(normalized)) return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  if (["failed", "rejected", "blocked"].includes(normalized)) return "bg-red-100 text-red-700 hover:bg-red-100";
  if (["pending", "pending_review", "requested", "action_required"].includes(normalized)) return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

const safeStatus = (value?: string | null) => String(value || "unknown").replace(/_/g, " ");

const AdminProviderAccounts = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminKycProviderSubmission | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["admin", "provider-accounts", page, token],
    enabled: !!token,
    queryFn: () => getAdminProviderAccountSubmissions(page, token),
  });

  const rows = (accountsQuery.data?.data ?? []).filter((item) => item.provider_account);
  const syncMutation = useMutation({
    mutationFn: async (submission: AdminKycProviderSubmission) => {
      if (!submission.provider?.code) throw new Error("Provider code is unavailable for this account.");
      return syncAdminProviderAccount(submission.provider.code, submission.user_id, token);
    },
    onSuccess: async (response) => {
      setSelected((current) => current ? { ...current, provider: response.provider, provider_account: response.provider_account } : current);
      setActionError("");
      setActionMessage("Provider account synchronized successfully.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "provider-accounts"] });
    },
    onError: (error) => {
      setActionMessage("");
      setActionError(error instanceof Error ? error.message : "Unable to synchronize this provider account.");
    },
  });

  const lastPage = accountsQuery.data?.last_page ?? 1;

  return <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><ServerCog className="h-6 w-6 text-emerald-600" />Provider accounts</CardTitle><CardDescription>Accounts attached to loaded KYC provider submissions. This is not an exhaustive provider-account inventory.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {accountsQuery.isError ? <ErrorPanel message={accountsQuery.error instanceof Error ? accountsQuery.error.message : "Unable to load provider accounts."} /> : null}
          <div className="overflow-hidden rounded-3xl border border-slate-200"><div className="overflow-x-auto"><Table className="min-w-[880px]"><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Account</TableHead><TableHead>KYC</TableHead><TableHead>Compliance</TableHead><TableHead>RFI</TableHead><TableHead>Provider status time</TableHead><TableHead className="text-right">Detail</TableHead></TableRow></TableHeader><TableBody>
            {rows.length ? rows.map((submission) => <TableRow key={submission.id}><TableCell className="font-semibold text-slate-900">{getProviderDisplayName(submission.provider)}</TableCell><TableCell><Badge className={statusClassName(submission.provider_account?.status)}>{safeStatus(submission.provider_account?.status)}</Badge></TableCell><TableCell><Badge className={statusClassName(submission.kyc_profile?.status || submission.status)}>{safeStatus(submission.kyc_profile?.status || submission.status)}</Badge></TableCell><TableCell>{safeStatus(submission.provider_account?.compliance_status)}</TableCell><TableCell>{safeStatus(submission.provider_account?.rfi_status)}</TableCell><TableCell>{formatDate(submission.provider_account?.provider_status_updated_at)}</TableCell><TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => { setSelected(submission); setActionError(""); setActionMessage(""); }}><Eye className="h-4 w-4" />Inspect</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="h-36 text-center text-slate-500">{accountsQuery.isLoading ? "Loading provider accounts..." : "No provider accounts are attached to the loaded submissions."}</TableCell></TableRow>}
          </TableBody></Table></div></div>
          <div className="flex items-center justify-between text-sm text-slate-500"><span>Page {accountsQuery.data?.current_page ?? page} of {lastPage}</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={page >= lastPage} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader><CardTitle>Provider account detail</CardTitle><CardDescription>Backend-authoritative operational states only. Provider identifiers and internal metadata remain hidden.</CardDescription></CardHeader>
        <CardContent>{selected?.provider_account ? <div className="space-y-4">
          <div className="rounded-3xl bg-slate-950 p-5 text-white"><div className="text-xs uppercase tracking-[0.2em] text-emerald-300">{getProviderDisplayName(selected.provider)}</div><div className="mt-2 text-xl font-semibold">Account {maskAdminIdentifier(selected.provider_account.id)}</div><div className="mt-3"><Badge className={statusClassName(selected.provider_account.status)}>{safeStatus(selected.provider_account.status)}</Badge></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><Detail label="Provider" value={getProviderDisplayName(selected.provider)} /><Detail label="Customer reference" value={maskAdminIdentifier(selected.user_id)} /><Detail label="Account status" value={safeStatus(selected.provider_account.status)} /><Detail label="KYC status" value={safeStatus(selected.kyc_profile?.status || selected.status)} /><Detail label="Provider state" value={safeStatus(selected.provider_account.provider_status)} /><Detail label="Provider sub-state" value={safeStatus(selected.provider_account.provider_sub_status)} /><Detail label="Compliance state" value={safeStatus(selected.provider_account.compliance_status)} /><Detail label="RFI state" value={safeStatus(selected.provider_account.rfi_status)} /><Detail label="Provider status timestamp" value={formatDate(selected.provider_account.provider_status_updated_at)} /><Detail label="Transactions last synced" value={formatDate(selected.provider_account.transactions_last_synced_at)} /><Detail label="Record updated" value={formatDate(selected.provider_account.updated_at)} /></div>
          {actionMessage ? <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{actionMessage}</div> : null}
          {actionError ? <ErrorPanel message={actionError} /> : null}
          <Button type="button" className="w-full" disabled={syncMutation.isPending || !selected.provider?.code} onClick={() => syncMutation.mutate(selected)}><RefreshCcw className={syncMutation.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />{syncMutation.isPending ? "Synchronizing..." : "Synchronize provider account"}</Button>
          <p className="text-xs leading-5 text-slate-500">Nium remains the provider authority. This action requests backend synchronization and does not edit provider state locally.</p>
        </div> : <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">Select a provider account from the loaded submission records.</div>}</CardContent>
      </Card>
    </div>
  </div>;
};

const Detail = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div><div className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</div></div>;
const ErrorPanel = ({ message }: { message: string }) => <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>;

export default AdminProviderAccounts;
