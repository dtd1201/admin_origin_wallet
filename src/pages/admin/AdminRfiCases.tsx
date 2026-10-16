import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, Check, ChevronRight, FileCheck2, FileText, History, Inbox, MessageSquareText, RefreshCw, Search, Send, ShieldAlert, UserRoundCheck } from "lucide-react";
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { approveAdminRfiCase, approveAdminRfiUserSubmission, getAdminRfiCase, getAdminRfiCases, requestAdminRfiRevision, requestApiBlob, saveAdminRfiDraft, sendAdminRfiToUser, submitAdminRfiCase } from "@/lib/api";
import type { AdminRfiCase, AdminRfiScope, AdminRfiSubmissionState } from "@/types/admin";

type OperationalFilter = "all" | "needs_action" | "with_customer" | "ready_for_review" | "complete";
type ConfirmAction = "approve-draft" | "submit-provider" | null;

const steps = [["Received", Inbox], ["Sent to Customer", Send], ["Customer Submitted", UserRoundCheck], ["Admin Review", FileCheck2], ["Provider Submission", Check]] as const;
const labels: Record<string, string> = {
  new: "Ready to send", sent_to_user: "Waiting for customer", user_draft: "Customer drafting", user_submitted: "Ready for Admin review",
  admin_review: "In Admin review", revision_requested: "Customer revision requested", admin_approved: "Admin approved",
  nium_submission_pending: "Provider submission pending", nium_submitted: "Submitted to Nium", nium_submission_failed: "Provider submission failed",
  not_claimed: "Response not started", draft: "Admin draft", approved: "Approved for provider", claimed: "Provider processing",
  responded: "Provider responded", reconciled: "Reconciled",
};
const stepByState: Record<string, number> = {
  new: 0, not_claimed: 0, draft: 0, sent_to_user: 1, user_draft: 1, revision_requested: 1, user_submitted: 2,
  admin_review: 3, admin_approved: 3, approved: 3, nium_submission_pending: 3, nium_submission_failed: 3,
  nium_submitted: 4, claimed: 4, responded: 4, reconciled: 4,
};
const submissionStates: Array<AdminRfiSubmissionState | "all"> = ["all", "new", "sent_to_user", "user_draft", "user_submitted", "admin_review", "revision_requested", "admin_approved", "nium_submission_pending", "nium_submitted", "nium_submission_failed", "not_claimed", "draft", "approved", "claimed", "responded", "reconciled"];
const formatDate = (value?: string | null) => { if (!value) return "Not available"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Not available" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date); };
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : "";
const template = (item: AdminRfiCase) => item.evidence?.template && typeof item.evidence.template === "object" ? item.evidence.template as Record<string, unknown> : undefined;
const requestName = (item: AdminRfiCase) => text(item.template_name) || text(template(item)?.name) || text(template(item)?.documentType) || text(item.evidence?.description) || `RFI request #${item.id}`;
const remarks = (item: AdminRfiCase) => text(item.provider_remarks) || text(item.evidence?.remarks) || text(item.evidence?.description);
const fields = (item: AdminRfiCase) => { const value = template(item)?.requiredFields ?? item.evidence?.requiredData; return Array.isArray(value) ? value : []; };
const requiredDocumentCount = (item: AdminRfiCase) => item.required_document_count ?? fields(item).length;
const customerName = (item: AdminRfiCase) => text(item.customer_name) || text(item.business_name) || text(item.legal_name) || text(item.customer?.business_name) || text(item.customer?.legal_name);
const historical = (item: AdminRfiCase) => Boolean(item.origin && item.origin !== "authoritative_fetch");
const withCustomer = (state: string) => ["sent_to_user", "user_draft", "revision_requested"].includes(state);
const needsAction = (state: string) => ["new", "revision_requested", "user_submitted", "admin_review", "not_claimed", "draft", "approved", "nium_submission_failed"].includes(state);
const complete = (state: string) => ["nium_submitted", "responded", "reconciled"].includes(state);
const permissionFailure = (error: unknown) => error instanceof Error && /403|forbidden|permission|unauthori[sz]ed/i.test(error.message);
const nextAction = (item: AdminRfiCase) => {
  if (["new", "revision_requested"].includes(item.submission_state)) return "Send request to customer";
  if (withCustomer(item.submission_state)) return "Await customer response";
  if (["user_submitted", "admin_review"].includes(item.submission_state)) return "Review customer submission";
  if (["not_claimed", "draft"].includes(item.submission_state)) return "Complete and approve response";
  if (["approved", "admin_approved", "nium_submission_failed"].includes(item.submission_state)) return item.contract_gate === "provider_contract_unconfirmed" ? "Provider contract confirmation required" : "Submit approved response to Nium";
  return complete(item.submission_state) ? "No action required" : "Monitor provider status";
};

const AdminRfiCases = () => {
  const { token } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<AdminRfiScope | "all">("all");
  const [status, setStatus] = useState("");
  const [submissionState, setSubmissionState] = useState<AdminRfiSubmissionState | "all">("all");
  const [operationalFilter, setOperationalFilter] = useState<OperationalFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [answers, setAnswers] = useState([{ questionId: "", answer: "" }]);
  const [revisionReason, setRevisionReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const query = useMemo(() => { const params = new URLSearchParams({ page: String(page) }); if (search.trim()) params.set("search", search.trim()); if (scope !== "all") params.set("scope", scope); if (status.trim()) params.set("status", status.trim()); if (submissionState !== "all") params.set("submission_state", submissionState); return params.toString(); }, [page, scope, search, status, submissionState]);
  const casesQuery = useQuery({ queryKey: ["admin", "nium-rfi-cases", query, token], enabled: !!token, queryFn: () => getAdminRfiCases(query, token) });
  const detailQuery = useQuery({ queryKey: ["admin", "nium-rfi-cases", "detail", selectedId, token], enabled: !!token && selectedId !== null, queryFn: () => getAdminRfiCase(selectedId as number, token) });
  const refresh = async (updated?: AdminRfiCase) => { if (updated) client.setQueryData(["admin", "nium-rfi-cases", "detail", updated.id, token], updated); await client.invalidateQueries({ queryKey: ["admin", "nium-rfi-cases"] }); };
  const mutation = useMutation({
    mutationFn: async ({ action, item }: { action: "send" | "revision" | "approve-user" | "save-draft" | "approve-draft" | "submit-provider"; item: AdminRfiCase }) => {
      if (action === "send") return sendAdminRfiToUser(item.id, token);
      if (action === "revision") return requestAdminRfiRevision(item.id, revisionReason.trim(), token);
      if (action === "approve-user") return approveAdminRfiUserSubmission(item.id, token);
      if (action === "approve-draft") return approveAdminRfiCase(item.id, token);
      if (action === "submit-provider") { if (item.contract_gate === "provider_contract_unconfirmed") throw new Error("Provider submission is blocked until the backend confirms the Nium POST contract."); return submitAdminRfiCase(item.id, token); }
      const factualAnswers = answers.map((answer) => ({ questionId: answer.questionId.trim(), answer: answer.answer.trim() }));
      if (factualAnswers.some((answer) => !answer.questionId || !answer.answer)) throw new Error("Each response item requires a question ID and factual answer.");
      return saveAdminRfiDraft(item.id, { answers: factualAnswers }, token);
    },
    onSuccess: async (updated) => { setActionError(""); setConfirmAction(null); setRevisionReason(""); await refresh(updated); },
    onError: (error) => { setConfirmAction(null); setActionError(error instanceof Error ? error.message : "Unable to update the RFI request."); },
  });

  const rows = casesQuery.data?.data ?? [];
  const authoritative = rows.filter((item) => !historical(item));
  const history = rows.filter(historical);
  const filtered = authoritative.filter((item) => operationalFilter === "all" || operationalFilter === "needs_action" && needsAction(item.submission_state) || operationalFilter === "with_customer" && withCustomer(item.submission_state) || operationalFilter === "ready_for_review" && ["user_submitted", "admin_review", "draft"].includes(item.submission_state) || operationalFilter === "complete" && complete(item.submission_state));
  const groups = Array.from(filtered.reduce((map, item) => {
    const groupKey = item.customer_id ? `customer:${item.customer_id}` : `case:${item.id}`;
    map.set(groupKey, [...(map.get(groupKey) ?? []), item]);
    return map;
  }, new Map<string, AdminRfiCase[]>()));
  const selected = detailQuery.data ?? null;
  const inspect = (item: AdminRfiCase) => { if (historical(item)) return; setSelectedId(item.id); setAnswers([{ questionId: "", answer: "" }]); setRevisionReason(""); setActionError(""); };
  const preview = async (url?: string | null) => { if (!url) return; try { const blob = await requestApiBlob(url, { token }); const objectUrl = URL.createObjectURL(blob); window.open(objectUrl, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000); } catch (error) { setActionError(error instanceof Error ? error.message : "Unable to open the authenticated document preview."); } };
  if (!token) return <main className="p-4 sm:p-6 lg:p-8"><State role="alert" icon={ShieldAlert} title="Permission required" message="An active Admin session is required to access provider RFI cases." /></main>;

  return <main className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:px-8 sm:py-8"><div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between"><div className="max-w-2xl"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300"><MessageSquareText className="h-4 w-4" />Compliance operations</div><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">RFI case workspace</h1><p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">Manage customer communication, document review and controlled Nium submissions without mixing provider requests with webhook history.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[560px]"><Metric label="This page" value={String(authoritative.length)} /><Metric label="Needs action" value={String(authoritative.filter((item) => needsAction(item.submission_state)).length)} accent /><Metric label="With customer" value={String(authoritative.filter((item) => withCustomer(item.submission_state)).length)} /><Metric label="Historical" value={String(history.length)} /></div></div></header>
    <section aria-label="RFI search and filters" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 lg:grid-cols-[minmax(260px,1.5fr)_repeat(3,minmax(170px,0.65fr))]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input aria-label="Search RFI cases" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search customer, request or case reference" className="pl-9" /></div><Select value={scope} onValueChange={(value) => { setScope(value as AdminRfiScope | "all"); setPage(1); }}><SelectTrigger aria-label="Filter by scope"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All scopes</SelectItem><SelectItem value="customer">Customer RFI</SelectItem><SelectItem value="transaction">Transaction RFI</SelectItem></SelectContent></Select><Input aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} placeholder="Provider status" /><Select value={submissionState} onValueChange={(value) => { setSubmissionState(value as AdminRfiSubmissionState | "all"); setPage(1); }}><SelectTrigger aria-label="Filter by submission state"><SelectValue /></SelectTrigger><SelectContent>{submissionStates.map((value) => <SelectItem key={value} value={value}>{value === "all" ? "All workflow states" : labels[value] || value}</SelectItem>)}</SelectContent></Select></div><div className="mt-4 flex flex-wrap gap-2" aria-label="Operational filters">{(["all", "needs_action", "with_customer", "ready_for_review", "complete"] as OperationalFilter[]).map((value) => <Button key={value} size="sm" variant={operationalFilter === value ? "default" : "outline"} onClick={() => setOperationalFilter(value)}>{({ all: "All requests", needs_action: "Needs action", with_customer: "With customer", ready_for_review: "Ready for review", complete: "Complete" } as Record<OperationalFilter, string>)[value]}</Button>)}</div></section>
    {casesQuery.isLoading ? <Loading /> : null}
    {casesQuery.isError ? <State role="alert" icon={permissionFailure(casesQuery.error) ? ShieldAlert : AlertTriangle} title={permissionFailure(casesQuery.error) ? "RFI access denied" : "Unable to load RFI cases"} message={casesQuery.error instanceof Error ? casesQuery.error.message : "The provider RFI queue could not be retrieved."} action={<Button variant="outline" onClick={() => casesQuery.refetch()}><RefreshCw className="h-4 w-4" />Retry</Button>} /> : null}
    {!casesQuery.isLoading && !casesQuery.isError && !rows.length ? <State icon={Inbox} title="No RFI cases" message="Authoritative provider requests will appear here when they are available." /> : null}
    {!casesQuery.isLoading && !casesQuery.isError && authoritative.length > 0 && !filtered.length ? <State icon={Search} title="No matching requests" message="Try a different operational filter or broaden the backend search filters." /> : null}
    {!casesQuery.isLoading && !casesQuery.isError && groups.length ? <div className="space-y-5" aria-label="Authoritative provider RFI requests">{groups.map(([groupKey, items]) => { const name = customerName(items[0]) || "Customer identity unavailable"; return <section key={groupKey} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70"><div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5"><div className="flex min-w-0 items-center gap-3"><div className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><Building2 className="h-4 w-4" /></div><div className="min-w-0"><h2 className="truncate font-semibold text-slate-950">{name}</h2>{name === "Customer identity unavailable" ? <p className="text-xs text-slate-500">The list API did not provide a reliable legal or business name.</p> : null}</div></div><Badge variant="secondary">{items.length} request{items.length === 1 ? "" : "s"}</Badge></div><div className="grid gap-3 p-3 xl:grid-cols-2">{items.map((item) => <RequestCard key={item.id} item={item} inspect={() => inspect(item)} />)}</div></section>; })}</div> : null}
    {!casesQuery.isLoading && !casesQuery.isError && history.length ? <section aria-labelledby="history-title" className="rounded-2xl border border-slate-200 bg-slate-100/80 p-5"><div className="flex gap-3"><History className="mt-0.5 h-5 w-5 text-slate-500" /><div><h2 id="history-title" className="font-semibold text-slate-900">Historical webhook evidence</h2><p className="mt-1 text-sm text-slate-600">Audit context only. These records are not authoritative Nium requests and cannot be processed or submitted.</p></div></div><div className="mt-4 grid gap-2 md:grid-cols-2">{history.map((item) => <article key={item.id} className="rounded-xl border bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{requestName(item)}</div><div className="mt-1 text-xs text-slate-500">Evidence record #{item.id} · {formatDate(item.updated_at)}</div></div><Badge variant="outline">Non-actionable</Badge></div></article>)}</div></section> : null}
    {!casesQuery.isLoading && !casesQuery.isError && rows.length ? <nav aria-label="RFI pagination" className="flex flex-col gap-3 rounded-2xl border bg-white px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>Page {casesQuery.data?.current_page ?? page} of {casesQuery.data?.last_page ?? 1} · {casesQuery.data?.total ?? rows.length} total records</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={(casesQuery.data?.current_page ?? page) <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button size="sm" variant="outline" disabled={(casesQuery.data?.current_page ?? page) >= (casesQuery.data?.last_page ?? page)} onClick={() => setPage((value) => value + 1)}>Next</Button></div></nav> : null}
    <Sheet
      open={selectedId !== null}
      onOpenChange={(open) => {
        if (!open) setSelectedId(null);
      }}
    >
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-4xl lg:max-w-6xl">
        <SheetHeader className="sticky top-0 z-20 border-b bg-white/95 px-5 py-5 text-left backdrop-blur sm:px-8">
          <SheetTitle className="pr-8 text-xl sm:text-2xl">
            {selected ? requestName(selected) : "RFI case"}
          </SheetTitle>
          <SheetDescription>Nium request inspection and Origin Wallet workflow</SheetDescription>
        </SheetHeader>
        {detailQuery.isLoading ? <div className="p-6"><Loading /></div> : null}
        {detailQuery.isError ? (
          <div className="p-6">
            <State
              role="alert"
              icon={permissionFailure(detailQuery.error) ? ShieldAlert : AlertTriangle}
              title={permissionFailure(detailQuery.error) ? "Case access denied" : "Unable to load case details"}
              message={detailQuery.error instanceof Error ? detailQuery.error.message : "The case details could not be retrieved."}
              action={<Button variant="outline" onClick={() => detailQuery.refetch()}><RefreshCw className="h-4 w-4" />Retry</Button>}
            />
          </div>
        ) : null}
        {selected ? (
          <CaseDetail
            item={selected}
            answers={answers}
            setAnswers={setAnswers}
            revisionReason={revisionReason}
            setRevisionReason={setRevisionReason}
            error={actionError}
            pending={mutation.isPending}
            act={(action) => mutation.mutate({ action, item: selected })}
            preview={preview}
            confirm={setConfirmAction}
          />
        ) : null}
      </SheetContent>
    </Sheet>

    <AlertDialog
      open={confirmAction !== null}
      onOpenChange={(open) => {
        if (!open) setConfirmAction(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirmAction === "submit-provider" ? "Submit approved response to Nium?" : "Approve factual RFI draft?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmAction === "submit-provider"
              ? "This invokes the authenticated provider submission endpoint. Continue only after the customer submission and evidence have been reviewed."
              : "Approval advances the backend workflow. It does not submit the response to Nium."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (selected && confirmAction) mutation.mutate({ action: confirmAction, item: selected });
            }}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
};

const RequestCard = ({ item, inspect }: { item: AdminRfiCase; inspect: () => void }) => <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{item.scope === "customer" ? "Customer RFI" : "Transaction RFI"} · Case #{item.id}</div><h3 className="mt-1 break-words text-lg font-semibold">{requestName(item)}</h3></div><Badge className="w-fit shrink-0 bg-slate-100 text-slate-700 hover:bg-slate-100">{labels[item.submission_state] || "Status unavailable"}</Badge></div><p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">{remarks(item) || "No original Nium remarks were supplied."}</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><Fact label="Scope" value={item.scope === "customer" ? "Customer" : "Transaction"} /><Fact label="Required" value={`${requiredDocumentCount(item)} item(s)`} /><Fact label="Updated" value={formatDate(item.updated_at)} /></dl><div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950"><b>Next:</b> {nextAction(item)}</div><div className="mt-4 flex justify-end"><Button variant="ghost" onClick={inspect}>Inspect request<ChevronRight className="h-4 w-4" /></Button></div></article>;

const CaseDetail = ({ item, answers, setAnswers, revisionReason, setRevisionReason, error, pending, act, preview, confirm }: { item: AdminRfiCase; answers: Array<{ questionId: string; answer: string }>; setAnswers: Dispatch<SetStateAction<Array<{ questionId: string; answer: string }>>>; revisionReason: string; setRevisionReason: (value: string) => void; error: string; pending: boolean; act: (action: "send" | "revision" | "approve-user" | "save-draft") => void; preview: (url?: string | null) => void; confirm: (action: ConfirmAction) => void }) => {
  const required = fields(item);
  const canDraft = item.status === "requested" && ["not_claimed", "draft"].includes(item.submission_state);
  const canApprove = item.status === "requested" && item.submission_state === "draft";
  const canSubmit = item.status === "requested" && ["approved", "admin_approved", "nium_submission_failed"].includes(item.submission_state) && item.contract_gate !== "provider_contract_unconfirmed";
  const review = ["user_submitted", "admin_review"].includes(item.submission_state);
  return <div className="space-y-7 px-5 py-6 sm:px-8"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm text-slate-500">{customerName(item) || "Customer identity unavailable"}</div><div className="mt-1 flex flex-wrap gap-2"><Badge variant="secondary">{item.scope === "customer" ? "Customer scope" : "Transaction scope"}</Badge><Badge variant="outline">{labels[item.submission_state] || "Status unavailable"}</Badge></div></div><div className="text-sm text-slate-500">Updated {formatDate(item.updated_at)}</div></div><Lifecycle item={item} />
    <Block title="Nium Request" icon={MessageSquareText}><div className="rounded-xl bg-amber-50 p-4"><div className="text-xs font-semibold uppercase tracking-wider text-amber-800">Original Nium remarks</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">{remarks(item) || "No original provider remarks were supplied."}</p></div><dl className="mt-3 grid gap-3 sm:grid-cols-3"><Fact label="Category / template" value={requestName(item)} /><Fact label="Scope" value={item.scope === "customer" ? "Customer" : "Transaction"} /><Fact label="Next action" value={nextAction(item)} /></dl></Block>
    <Block title="Required Documents" icon={FileCheck2}>{required.length ? <div className="grid gap-2 sm:grid-cols-2">{required.map((value, index) => { const record = value && typeof value === "object" ? value as Record<string, unknown> : {}; return <div key={index} className="rounded-xl border p-4"><div className="font-medium">{text(record.fieldLabel) || text(record.description) || `Required item ${index + 1}`}</div><div className="mt-1 text-sm text-slate-500">{text(record.type) || text(record.fieldValue) || "Supporting information"}</div></div>; })}</div> : <Unavailable message="No document requirements were supplied by the provider." />}</Block>
    <Block title="Attached Documents" icon={FileText}>{item.documents?.length ? <div className="space-y-2">{item.documents.map((document) => <button key={document.id} type="button" disabled={!document.file_url} onClick={() => preview(document.file_url)} className="flex w-full items-center justify-between rounded-xl border p-4 text-left hover:border-emerald-300 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"><div className="min-w-0"><div className="truncate font-medium">{document.original_name || "Supporting document"}</div><div className="text-xs text-slate-500">Authenticated private preview · {document.status || "Status unavailable"}</div></div><ChevronRight className="h-4 w-4" /></button>)}</div> : <Unavailable message={`No attached documents are exposed for this case${item.supporting_file_count ? ` (${item.supporting_file_count} file reference(s) recorded)` : ""}.`} />}</Block>
    <Block title="Customer Communication" icon={MessageSquareText}><div className="grid gap-3 md:grid-cols-2"><Info title="Customer explanation" value={item.user_explanation || "No explanation has been provided."} /><Info title="Latest revision request" value={item.revision_reason || "No revision has been requested."} /></div>{["new", "revision_requested"].includes(item.submission_state) ? <div className="mt-4 flex justify-end"><Button disabled={pending} onClick={() => act("send")}><Send className="h-4 w-4" />Send to Customer</Button></div> : null}</Block>
    <Block title="Review & Submission History" icon={History}>{item.history?.length ? <ol className="space-y-3">{item.history.map((event, index) => <li key={index} className="border-l-2 border-emerald-200 pl-4 text-sm"><b>{labels[event.to_state || ""] || event.event_type}</b><div className="mt-1 text-slate-500">{formatDate(event.created_at)}</div></li>)}</ol> : <Unavailable message="No review or submission history is available for this request." />}{item.response_draft?.length ? <div className="mt-4 space-y-2"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recorded factual responses</div>{item.response_draft.map((answer, index) => <div key={`${answer.questionId || "response"}-${index}`} className="rounded-xl bg-slate-50 p-4 text-sm"><div className="font-medium">{answer.questionId || `Response ${index + 1}`}</div><div className="mt-1 whitespace-pre-wrap text-slate-600">{typeof answer.answer === "string" || typeof answer.answer === "number" || typeof answer.answer === "boolean" ? String(answer.answer) : "Structured factual response recorded"}</div></div>)}</div> : null}</Block>
    {review ? <section className="rounded-2xl border p-5"><h3 className="font-semibold">Admin review decision</h3><p className="mt-1 text-sm text-slate-600">Customer submission is held by Origin Wallet until an Admin approves it. Approval does not submit to Nium.</p><Label htmlFor="revision-reason" className="mt-4 block">Revision reason</Label><Textarea id="revision-reason" className="mt-2" value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} placeholder="Explain what the customer must correct" /><div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={!revisionReason.trim() || pending} onClick={() => act("revision")}>Request Revision</Button><Button disabled={pending} onClick={() => act("approve-user")}>Approve Customer Submission</Button></div></section> : null}
    {canDraft || item.submission_state === "approved" ? <section className="rounded-2xl border bg-slate-50 p-5"><h3 className="font-semibold">Admin factual response</h3><p className="mt-1 text-sm text-slate-600">Use explicit question IDs and factual answers returned by the backend workflow.</p><div className="mt-4 space-y-3">{answers.map((answer, index) => <div key={index} className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[0.7fr_1.3fr]"><div><Label htmlFor={`question-${index}`}>Question ID</Label><Input id={`question-${index}`} className="mt-2" disabled={!canDraft || pending} value={answer.questionId} onChange={(event) => setAnswers((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, questionId: event.target.value } : value))} /></div><div><Label htmlFor={`answer-${index}`}>Factual answer</Label><Textarea id={`answer-${index}`} className="mt-2 min-h-10" disabled={!canDraft || pending} value={answer.answer} onChange={(event) => setAnswers((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, answer: event.target.value } : value))} /></div></div>)}</div><div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={!canDraft || pending} onClick={() => act("save-draft")}>Save Draft</Button><Button disabled={!canApprove || pending} onClick={() => confirm("approve-draft")}>Approve Draft</Button></div></section> : null}
    <section className="rounded-2xl border bg-slate-50 p-5"><div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4 text-amber-600" />Provider submission control</div><p className="mt-2 text-sm text-slate-600">Customer submission sends information to Origin Wallet for review. It does not submit anything to Nium.</p>{item.contract_gate === "provider_contract_unconfirmed" ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950">Provider POST is blocked: the exact Nium contract remains unconfirmed.</div> : null}<div className="mt-4 flex justify-end"><Button disabled={!canSubmit || pending} onClick={() => confirm("submit-provider")}><Send className="h-4 w-4" />Submit Approved Response to Nium</Button></div></section>
    {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
    <details className="rounded-xl border p-4 text-sm"><summary className="cursor-pointer font-medium focus-visible:ring-2 focus-visible:ring-emerald-500">Technical Diagnostics</summary><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Diagnostic label="Case ID" value={String(item.id)} /><Diagnostic label="Raw provider status" value={item.status} /><Diagnostic label="Raw workflow state" value={item.submission_state} /><Diagnostic label="Origin" value={item.origin || "Not supplied"} /><Diagnostic label="Contract gate" value={item.contract_gate} /><Diagnostic label="Reconciled" value={formatDate(item.reconciled_at)} /></dl></details>
  </div>;
};

const Lifecycle = ({ item }: { item: AdminRfiCase }) => <div aria-label="RFI lifecycle" className="rounded-2xl bg-slate-950 p-3 sm:p-4"><div className="grid grid-cols-5 gap-1">{steps.map(([label, Icon], index) => <div key={label} className="min-w-0 text-center"><div className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full ${index <= (stepByState[item.submission_state] ?? 0) ? "bg-emerald-400 text-slate-950" : "bg-slate-800 text-slate-500"}`}><Icon className="h-4 w-4" /></div><div className="mt-2 break-words text-[9px] leading-3 text-slate-200 sm:text-[11px]">{label}</div></div>)}</div></div>;
const Metric = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => <div className={`rounded-xl border p-3 ${accent ? "border-amber-300/30 bg-amber-300/10" : "border-white/10 bg-white/5"}`}><div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-xl font-semibold ${accent ? "text-amber-200" : "text-white"}`}>{value}</div></div>;
const Fact = ({ label, value }: { label: string; value: string }) => <div className="min-w-0"><dt className="text-xs uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 break-words font-medium text-slate-800">{value}</dd></div>;
const Block = ({ title, icon: Icon, children }: { title: string; icon: typeof FileText; children: ReactNode }) => <section><div className="mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-emerald-700" /><h3 className="font-semibold">{title}</h3></div>{children}</section>;
const Info = ({ title, value }: { title: string; value: string }) => <div className="rounded-xl bg-slate-50 p-4 text-sm"><div className="font-medium">{title}</div><div className="mt-2 whitespace-pre-wrap text-slate-600">{value}</div></div>;
const Diagnostic = ({ label, value }: { label: string; value: string }) => <div><dt className="text-xs uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>;
const Unavailable = ({ message }: { message: string }) => <div className="rounded-xl border border-dashed p-5 text-sm text-slate-500">{message}</div>;
const State = ({ title, message, icon: Icon, role, action }: { title: string; message: string; icon: typeof Inbox; role?: "alert"; action?: ReactNode }) => <section role={role} className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center"><Icon className="mx-auto h-7 w-7 text-slate-400" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">{message}</p>{action ? <div className="mt-4">{action}</div> : null}</section>;
const Loading = () => <div aria-label="Loading RFI cases" className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="animate-pulse rounded-2xl border bg-white p-5"><div className="h-3 w-24 rounded bg-slate-200" /><div className="mt-3 h-6 w-2/3 rounded bg-slate-200" /><div className="mt-5 h-12 rounded bg-slate-100" /></div>)}</div>;

export default AdminRfiCases;
