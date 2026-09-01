import { useQuery } from "@tanstack/react-query";
import { Eye, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { getAdminBeneficiaries, getAdminBeneficiary } from "@/lib/api";
import { maskAdminIdentifier } from "@/lib/adminDataSafety";

const maskName = (value?: string | null) => {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((word) => `${word[0]}${"*".repeat(Math.max(3, word.length - 1))}`).join(" ") : "Unknown";
};
const formatDate = (value?: string | null) => {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
};
const mappingStatus = (value?: string | null) => value ? "Mapped" : "Not mapped";

const AdminBeneficiaries = () => {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listQuery = useQuery({ queryKey: ["admin", "beneficiaries", page, token], enabled: !!token, queryFn: () => getAdminBeneficiaries(page, token) });
  const detailQuery = useQuery({ queryKey: ["admin", "beneficiary", selectedId, token], enabled: !!token && selectedId !== null, queryFn: () => getAdminBeneficiary(selectedId!, token) });
  const rows = listQuery.data?.data ?? [];
  const lastPage = listQuery.data?.last_page ?? 1;

  return <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8"><div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
    <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]"><CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><UserRoundCheck className="h-6 w-6 text-emerald-600" />Beneficiaries</CardTitle><CardDescription>Read-only payout visibility with personal and payment details masked.</CardDescription></CardHeader><CardContent className="space-y-4">
      {listQuery.isError ? <ErrorPanel message={listQuery.error instanceof Error ? listQuery.error.message : "Unable to load beneficiaries."} /> : null}
      <div className="overflow-hidden rounded-3xl border border-slate-200"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Beneficiary reference</TableHead><TableHead>Name</TableHead><TableHead>Currency</TableHead><TableHead>Payout status</TableHead><TableHead>Provider mapping</TableHead><TableHead className="text-right">Detail</TableHead></TableRow></TableHeader><TableBody>
        {rows.length ? rows.map((row) => <TableRow key={row.id}><TableCell className="font-semibold">{maskAdminIdentifier(row.id)}</TableCell><TableCell>{maskName(row.company_name || row.full_name)}</TableCell><TableCell>{row.currency || "Unknown"}</TableCell><TableCell><Badge variant="secondary">{row.status || "Unknown"}</Badge></TableCell><TableCell>{mappingStatus(row.external_beneficiary_id)}</TableCell><TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => setSelectedId(row.id)}><Eye className="h-4 w-4" />Inspect</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="h-36 text-center text-slate-500">{listQuery.isLoading ? "Loading beneficiaries..." : "No beneficiaries found."}</TableCell></TableRow>}
      </TableBody></Table></div></div>
      <Pagination page={page} lastPage={lastPage} onPage={setPage} />
    </CardContent></Card>
    <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]"><CardHeader><CardTitle>Beneficiary detail</CardTitle><CardDescription>Provider identifiers and banking coordinates remain hidden.</CardDescription></CardHeader><CardContent>
      {detailQuery.isError ? <ErrorPanel message={detailQuery.error instanceof Error ? detailQuery.error.message : "Unable to load beneficiary detail."} /> : detailQuery.data ? <div className="grid gap-3 sm:grid-cols-2"><Detail label="Beneficiary reference" value={maskAdminIdentifier(detailQuery.data.id)} /><Detail label="Name" value={maskName(detailQuery.data.company_name || detailQuery.data.full_name)} /><Detail label="Currency" value={detailQuery.data.currency || "Unknown"} /><Detail label="Payout status" value={detailQuery.data.status || "Unknown"} /><Detail label="Provider association" value={maskAdminIdentifier(detailQuery.data.provider_id)} /><Detail label="Provider mapping" value={mappingStatus(detailQuery.data.external_beneficiary_id)} /><Detail label="Created" value={formatDate(detailQuery.data.created_at)} /><Detail label="Updated" value={formatDate(detailQuery.data.updated_at)} /></div> : <EmptyDetail text={detailQuery.isLoading ? "Loading beneficiary detail..." : "Select a beneficiary to inspect safe fields."} />}
    </CardContent></Card>
  </div></div>;
};

const Detail = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div><div className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</div></div>;
const EmptyDetail = ({ text }: { text: string }) => <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">{text}</div>;
const ErrorPanel = ({ message }: { message: string }) => <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>;
const Pagination = ({ page, lastPage, onPage }: { page: number; lastPage: number; onPage: (page: number) => void }) => <div className="flex items-center justify-between text-sm text-slate-500"><span>Page {page} of {lastPage}</span><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>Next</Button></div></div>;

export default AdminBeneficiaries;
