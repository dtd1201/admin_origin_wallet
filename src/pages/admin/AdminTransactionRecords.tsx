import { useQuery } from "@tanstack/react-query";
import { Eye, ReceiptText } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminTransactionRecord, getAdminTransactionRecords } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const formatDate = (value?: string | null, dateOnly = false) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", dateOnly ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};

const formatAmount = (value?: string | number | null, currency?: string | null) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  const amount = Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(numeric)
    : String(value);
  return `${amount} ${currency || ""}`.trim();
};

const maskIdentifier = (value?: string | number | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "-";
  return normalized.length <= 4 ? "****" : `****${normalized.slice(-4)}`;
};

const statusClassName = (status?: string | null) => {
  const normalized = String(status || "").toLowerCase();
  if (["completed", "posted", "clear"].includes(normalized)) return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  if (["failed", "rejected"].includes(normalized)) return "bg-red-100 text-red-700 hover:bg-red-100";
  if (["pending", "processing"].includes(normalized)) return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

const AdminTransactionRecords = () => {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const recordsQuery = useQuery({
    queryKey: ["admin", "transaction-records", page, token],
    enabled: !!token,
    queryFn: () => getAdminTransactionRecords(page, token),
  });
  const detailQuery = useQuery({
    queryKey: ["admin", "transaction-records", "detail", selectedId, token],
    enabled: !!token && selectedId !== null,
    queryFn: () => getAdminTransactionRecord(selectedId as number, token),
  });
  const rows = recordsQuery.data?.data ?? [];
  const canBack = (recordsQuery.data?.current_page ?? page) > 1;
  const canNext = (recordsQuery.data?.current_page ?? page) < (recordsQuery.data?.last_page ?? page);

  return <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><ReceiptText className="h-6 w-6 text-emerald-600" />Transaction records</CardTitle><CardDescription>Read-only booked transaction visibility. Transfer operations remain on the Transfers page.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {recordsQuery.isError ? <ErrorPanel message={recordsQuery.error instanceof Error ? recordsQuery.error.message : "Unable to load transaction records."} /> : null}
          <div className="overflow-hidden rounded-3xl border border-slate-200"><div className="overflow-x-auto"><Table className="min-w-[920px]"><TableHeader><TableRow><TableHead>Record</TableHead><TableHead>Type</TableHead><TableHead>Direction</TableHead><TableHead>Amount</TableHead><TableHead>Fee</TableHead><TableHead>Status</TableHead><TableHead>Booked</TableHead><TableHead className="text-right">Detail</TableHead></TableRow></TableHeader><TableBody>
            {rows.length ? rows.map((record) => <TableRow key={record.id}><TableCell><div className="font-semibold text-slate-900">{maskIdentifier(record.external_transaction_id)}</div><div className="text-xs text-slate-400">Record {maskIdentifier(record.id)}</div></TableCell><TableCell>{record.transaction_type || "-"}</TableCell><TableCell>{record.direction || "-"}</TableCell><TableCell>{formatAmount(record.amount, record.currency)}</TableCell><TableCell>{formatAmount(record.fee_amount, record.currency)}</TableCell><TableCell><Badge className={statusClassName(record.status)}>{record.status || "unknown"}</Badge></TableCell><TableCell>{formatDate(record.booked_at)}</TableCell><TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => setSelectedId(record.id)}><Eye className="h-4 w-4" />Inspect</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="h-36 text-center text-slate-500">{recordsQuery.isLoading ? "Loading transaction records..." : "No transaction records found."}</TableCell></TableRow>}
          </TableBody></Table></div></div>
          <div className="flex items-center justify-between text-sm text-slate-500"><span>Page {recordsQuery.data?.current_page ?? page} of {recordsQuery.data?.last_page ?? 1}</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={!canBack} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={!canNext} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
        <CardHeader><CardTitle>Transaction detail</CardTitle><CardDescription>Explicit scalar fields only. Related bank-account and transfer objects are excluded.</CardDescription></CardHeader>
        <CardContent>{detailQuery.isLoading ? <Loading text="Loading transaction detail..." /> : detailQuery.isError ? <ErrorPanel message={detailQuery.error instanceof Error ? detailQuery.error.message : "Unable to load transaction detail."} /> : detailQuery.data ? <div className="space-y-4">
          <div className="rounded-3xl bg-slate-950 p-5 text-white"><div className="text-xs uppercase tracking-[0.2em] text-emerald-300">Transaction</div><div className="mt-2 text-xl font-semibold">{maskIdentifier(detailQuery.data.external_transaction_id)}</div><div className="mt-3"><Badge className={statusClassName(detailQuery.data.status)}>{detailQuery.data.status || "unknown"}</Badge></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><Detail label="Record ID" value={maskIdentifier(detailQuery.data.id)} /><Detail label="External transaction" value={maskIdentifier(detailQuery.data.external_transaction_id)} /><Detail label="User ID" value={maskIdentifier(detailQuery.data.user_id)} /><Detail label="Provider ID" value={maskIdentifier(detailQuery.data.provider_id)} /><Detail label="Bank account" value={maskIdentifier(detailQuery.data.bank_account_id)} /><Detail label="Transfer" value={maskIdentifier(detailQuery.data.transfer_id)} /><Detail label="Type" value={detailQuery.data.transaction_type || "-"} /><Detail label="Direction" value={detailQuery.data.direction || "-"} /><Detail label="Amount" value={formatAmount(detailQuery.data.amount, detailQuery.data.currency)} /><Detail label="Fee" value={formatAmount(detailQuery.data.fee_amount, detailQuery.data.currency)} /><Detail label="Status" value={detailQuery.data.status || "-"} /><Detail label="Booked" value={formatDate(detailQuery.data.booked_at)} /><Detail label="Value date" value={formatDate(detailQuery.data.value_date, true)} /><Detail label="Compliance review" value={detailQuery.data.compliance_review_required ? "required" : "not required"} /><Detail label="Compliance status" value={detailQuery.data.compliance_status || "-"} /><Detail label="Compliance reviewed" value={formatDate(detailQuery.data.compliance_reviewed_at)} /><Detail label="Created" value={formatDate(detailQuery.data.created_at)} /><Detail label="Updated" value={formatDate(detailQuery.data.updated_at)} /></div>
          {detailQuery.data.description ? <TextDetail label="Description" value={detailQuery.data.description} /> : null}
          {detailQuery.data.reference_text ? <TextDetail label="Reference" value={maskIdentifier(detailQuery.data.reference_text)} /> : null}
        </div> : <Loading text="Select a transaction record to inspect." />}</CardContent>
      </Card>
    </div>
  </div>;
};

const Detail = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl border border-slate-200 p-3"><div className="text-xs uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-1 break-words font-medium text-slate-900">{value}</div></div>;
const TextDetail = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">{value}</div></div>;
const Loading = ({ text }: { text: string }) => <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-slate-500">{text}</div>;
const ErrorPanel = ({ message }: { message: string }) => <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>;
export default AdminTransactionRecords;
