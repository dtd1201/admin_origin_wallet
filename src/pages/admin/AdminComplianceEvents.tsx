import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eye, ScanSearch, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAdminComplianceEvent,
  getAdminComplianceEvents,
  reviewAdminComplianceEvent,
} from "@/lib/api";
import type {
  AdminComplianceEvent,
  AdminComplianceMatchStatus,
  AdminComplianceReviewStatus,
} from "@/types/admin";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const reviewStatuses: Array<AdminComplianceReviewStatus | "all"> = [
  "all",
  "pending",
  "resolved",
  "ignored",
  "not_required",
];

const matchStatuses: Array<AdminComplianceMatchStatus | "all"> = [
  "all",
  "unmatched",
  "matched_customer",
  "matched_transfer",
  "matched_transaction",
];

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};

const maskIdentifier = (value?: string | null) => {
  if (!value) return "-";
  if (value.length <= 8) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const statusClassName = (status: string) => {
  if (["resolved", "not_required", "matched_transaction", "matched_transfer"].includes(status)) {
    return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  }
  if (["pending", "unmatched"].includes(status)) {
    return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  }
  if (status === "ignored") {
    return "bg-slate-200 text-slate-700 hover:bg-slate-200";
  }
  return "bg-sky-100 text-sky-700 hover:bg-sky-100";
};

const AdminComplianceEvents = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [reviewStatus, setReviewStatus] = useState<AdminComplianceReviewStatus | "all">("pending");
  const [matchStatus, setMatchStatus] = useState<AdminComplianceMatchStatus | "all">("all");
  const [requiresAction, setRequiresAction] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewAction, setReviewAction] = useState<"resolved" | "ignored" | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [reviewError, setReviewError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (reviewStatus !== "all") params.set("review_status", reviewStatus);
    if (matchStatus !== "all") params.set("match_status", matchStatus);
    if (requiresAction !== "all") params.set("requires_action", requiresAction);
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [matchStatus, page, requiresAction, reviewStatus, search]);

  const eventsQuery = useQuery({
    queryKey: ["admin", "nium-compliance-events", query, token],
    enabled: !!token,
    queryFn: () => getAdminComplianceEvents(query, token),
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "nium-compliance-events", "detail", selectedId, token],
    enabled: !!token && selectedId !== null,
    queryFn: () => getAdminComplianceEvent(selectedId as number, token),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: "resolved" | "ignored"; note: string }) =>
      reviewAdminComplianceEvent(id, { status, resolution_note: note }, token),
    onSuccess: async (response) => {
      setReviewAction(null);
      setResolutionNote("");
      setReviewError("");
      queryClient.setQueryData(
        ["admin", "nium-compliance-events", "detail", response.event.id, token],
        response.event,
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "nium-compliance-events"] });
    },
    onError: (error) => {
      setReviewError(error instanceof Error ? error.message : "Unable to review compliance event.");
    },
  });

  const rows = eventsQuery.data?.data ?? [];
  const selectedEvent = detailQuery.data ?? rows.find((event) => event.id === selectedId) ?? null;
  const canGoBack = (eventsQuery.data?.current_page ?? page) > 1;
  const canGoNext = (eventsQuery.data?.current_page ?? page) < (eventsQuery.data?.last_page ?? page);

  const openReview = (action: "resolved" | "ignored") => {
    setReviewAction(action);
    setResolutionNote("");
    setReviewError("");
  };

  const submitReview = () => {
    if (!selectedEvent || !reviewAction) return;
    if (!resolutionNote.trim()) {
      setReviewError("Resolution note is required.");
      return;
    }
    reviewMutation.mutate({ id: selectedEvent.id, status: reviewAction, note: resolutionNote.trim() });
  };

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="space-y-5">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ScanSearch className="h-6 w-6 text-emerald-600" />
                Compliance events
              </CardTitle>
              <CardDescription>Review projected Nium compliance signals without exposing raw provider payloads.</CardDescription>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Select value={reviewStatus} onValueChange={(value) => { setReviewStatus(value as typeof reviewStatus); setPage(1); }}>
                <SelectTrigger aria-label="Review status" className="rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>{reviewStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={matchStatus} onValueChange={(value) => { setMatchStatus(value as typeof matchStatus); setPage(1); }}>
                <SelectTrigger aria-label="Match status" className="rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>{matchStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={requiresAction} onValueChange={(value) => { setRequiresAction(value); setPage(1); }}>
                <SelectTrigger aria-label="Requires action" className="rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">all actions</SelectItem>
                  <SelectItem value="true">requires action</SelectItem>
                  <SelectItem value="false">no action required</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input aria-label="Search compliance events" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="rounded-2xl pl-10" placeholder="Search references" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {eventsQuery.isError && <ErrorPanel message={eventsQuery.error instanceof Error ? eventsQuery.error.message : "Unable to load compliance events."} />}
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader><TableRow><TableHead>Received</TableHead><TableHead>Event</TableHead><TableHead>Provider status</TableHead><TableHead>Match</TableHead><TableHead>Review</TableHead><TableHead className="text-right">Detail</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rows.length ? rows.map((event) => (
                      <TableRow key={event.id} className={selectedId === event.id ? "bg-emerald-50/70" : undefined}>
                        <TableCell>{formatDate(event.received_at)}</TableCell>
                        <TableCell><div className="font-medium text-slate-900">{event.event_type || "Compliance event"}</div><div className="text-xs text-slate-500">{maskIdentifier(event.event_id)}</div></TableCell>
                        <TableCell>{event.compliance_status || "-"}{event.requires_action && <div className="mt-1 text-xs font-medium text-amber-700">requires action</div>}</TableCell>
                        <TableCell><Badge className={statusClassName(event.match_status)}>{event.match_status}</Badge></TableCell>
                        <TableCell><Badge className={statusClassName(event.review_status)}>{event.review_status}</Badge></TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setSelectedId(event.id)}><Eye className="h-4 w-4" />Inspect</Button></TableCell>
                      </TableRow>
                    )) : <TableRow><TableCell colSpan={6} className="h-36 text-center text-slate-500">{eventsQuery.isLoading ? "Loading compliance events..." : "No compliance events found."}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Page {eventsQuery.data?.current_page ?? page} of {eventsQuery.data?.last_page ?? 1}</span>
              <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!canGoBack} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button size="sm" variant="outline" disabled={!canGoNext} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader><CardTitle>Event detail</CardTitle><CardDescription>Operational fields only. Identifiers are masked.</CardDescription></CardHeader>
          <CardContent>
            {detailQuery.isLoading && <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-slate-500">Loading event detail...</div>}
            {detailQuery.isError && <ErrorPanel message={detailQuery.error instanceof Error ? detailQuery.error.message : "Unable to load event detail."} />}
            {!detailQuery.isLoading && selectedEvent ? (
              <div className="space-y-5">
                <div className="rounded-3xl bg-slate-950 p-5 text-white"><div className="text-xs uppercase tracking-[0.18em] text-emerald-300">{selectedEvent.provider?.name || "Nium"}</div><div className="mt-2 text-xl font-semibold">{selectedEvent.event_type || "Compliance event"}</div><div className="mt-3 flex flex-wrap gap-2"><Badge className={statusClassName(selectedEvent.review_status)}>{selectedEvent.review_status}</Badge><Badge className={statusClassName(selectedEvent.match_status)}>{selectedEvent.match_status}</Badge></div></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Detail label="Event reference" value={maskIdentifier(selectedEvent.event_id)} />
                  <Detail label="Request reference" value={maskIdentifier(selectedEvent.request_id)} />
                  <Detail label="Customer reference" value={maskIdentifier(selectedEvent.customer_reference)} />
                  <Detail label="Payment reference" value={maskIdentifier(selectedEvent.reference)} />
                  <Detail label="Provider status" value={selectedEvent.compliance_status || "-"} />
                  <Detail label="Processing status" value={selectedEvent.processing_status} />
                  <Detail label="Received" value={formatDate(selectedEvent.received_at)} />
                  <Detail label="Processed" value={formatDate(selectedEvent.processed_at)} />
                  <Detail label="Last duplicate" value={formatDate(selectedEvent.last_received_at)} />
                  <Detail label="Duplicate count" value={String(selectedEvent.duplicate_count)} />
                  <Detail label="Linked record" value={selectedEvent.transaction_id ? "transaction" : selectedEvent.transfer_id ? "transfer" : selectedEvent.user_id ? "customer" : "unmatched"} />
                  <Detail label="Reviewed" value={formatDate(selectedEvent.reviewed_at)} />
                </div>
                {selectedEvent.resolution_note && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Resolution note</div><div className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{selectedEvent.resolution_note}</div></div>}
                {selectedEvent.error_message && <ErrorPanel message={selectedEvent.error_message} />}
                {selectedEvent.review_status === "pending" && <div className="grid gap-2 sm:grid-cols-2"><Button onClick={() => openReview("resolved")} className="rounded-2xl bg-emerald-500 text-slate-950 hover:bg-emerald-400"><CheckCircle2 className="h-4 w-4" />Resolve</Button><Button onClick={() => openReview("ignored")} variant="outline" className="rounded-2xl"><ShieldAlert className="h-4 w-4" />Ignore</Button></div>}
              </div>
            ) : !detailQuery.isLoading && !selectedEvent ? <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-slate-500">Select a compliance event to inspect.</div> : null}
          </CardContent>
        </Card>
      </div>

      <Dialog open={reviewAction !== null} onOpenChange={(open) => { if (!open) { setReviewAction(null); setReviewError(""); } }}>
        <DialogContent className="rounded-3xl">
          <DialogHeader><DialogTitle>{reviewAction === "ignored" ? "Ignore compliance event" : "Resolve compliance event"}</DialogTitle><DialogDescription>This records an Admin review decision. It does not change provider status.</DialogDescription></DialogHeader>
          {reviewAction === "ignored" && <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Ignoring removes this event from the pending review queue.</div>}
          {reviewError && <ErrorPanel message={reviewError} />}
          <div className="space-y-2"><Label htmlFor="resolution-note">Resolution note</Label><Textarea id="resolution-note" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} className="min-h-32 rounded-2xl" placeholder="Document the factual review outcome" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setReviewAction(null)}>Cancel</Button><Button onClick={submitReview} disabled={reviewMutation.isPending} className={reviewAction === "ignored" ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"}>{reviewAction === "ignored" ? "Ignore event" : "Resolve event"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl border border-slate-200 p-3"><div className="text-xs uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-1 break-words font-medium text-slate-900">{value}</div></div>;

const ErrorPanel = ({ message }: { message: string }) => <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>;

export default AdminComplianceEvents;
