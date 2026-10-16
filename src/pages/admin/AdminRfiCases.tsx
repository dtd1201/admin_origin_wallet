import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Building2, Check, ChevronRight, FileCheck2, FileText, History, Inbox, MessageSquareText, RefreshCw, Search, Send, ShieldAlert, UserRoundCheck } from "lucide-react";
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
import { approveAdminRfiCase, approveAdminRfiUserSubmission, getAdminRfiCase, getAdminRfiCases, refreshAdminRfiStatus, requestAdminRfiRevision, requestApiBlob, saveAdminRfiDraft, sendAdminRfiToUser, submitAdminRfiCase } from "@/lib/api";
import type { AdminRfiCase, AdminRfiScope, AdminRfiSubmissionState } from "@/types/admin";

type OperationalFilter = "all" | "needs_action" | "with_customer" | "ready_for_review" | "complete";
type ConfirmAction = "approve-draft" | "submit-provider" | null;

const steps = [["Received", Inbox], ["Sent to Customer", Send], ["Customer Submitted", UserRoundCheck], ["Admin Review", FileCheck2], ["Provider Submission", Check]] as const;
const labels: Record<string, string> = {
  new: "Ready to send", sent_to_user: "Waiting for customer", user_draft: "Customer drafting", user_submitted: "Ready for Admin review",
  admin_review: "In Admin review", revision_requested: "Customer revision requested", admin_approved: "Admin approved",
  nium_submission_pending: "Provider submission pending", nium_submitted: "Submitted to Nium", nium_submission_failed: "Provider submission failed",
  not_claimed: "Response not started", draft: "Admin draft", approved: "Approved for provider", claimed: "Provider processing",
  provider_acknowledged: "Provider acknowledged", unknown: "Outcome unknown", rejected: "Provider rejected",
  responded: "Provider responded", reconciled: "Reconciled",
};
const stepByState: Record<string, number> = {
  new: 0, not_claimed: 0, draft: 0, sent_to_user: 1, user_draft: 1, revision_requested: 1, user_submitted: 2,
  admin_review: 3, admin_approved: 3, approved: 3, nium_submission_pending: 3, nium_submission_failed: 3,
  nium_submitted: 4, claimed: 4, provider_acknowledged: 4, unknown: 4, rejected: 4, responded: 4, reconciled: 4,
};
const submissionStates: Array<AdminRfiSubmissionState | "all"> = ["all", "new", "sent_to_user", "user_draft", "user_submitted", "admin_review", "revision_requested", "admin_approved", "nium_submission_pending", "nium_submitted", "nium_submission_failed", "not_claimed", "draft", "approved", "claimed", "provider_acknowledged", "unknown", "rejected", "responded", "reconciled"];
const formatDate = (value?: string | null) => { if (!value) return "Not available"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Not available" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date); };
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : "";
const template = (item: AdminRfiCase) => item.evidence?.template && typeof item.evidence.template === "object" ? item.evidence.template as Record<string, unknown> : undefined;
const remarks = (item: AdminRfiCase) => text(item.evidence?.remarks) || text(item.provider_remarks) || text(item.evidence?.description);
const fields = (item: AdminRfiCase) => { const value = template(item)?.requiredFields ?? item.evidence?.requiredData; return Array.isArray(value) ? value : []; };
const fieldRecord = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
const fieldLabel = (value: unknown, index: number) => { const field = fieldRecord(value); return text(field.fieldLabel) || text(field.label) || text(field.question) || text(field.description) || `Required item ${index + 1}`; };
const fieldKey = (value: unknown) => { const field = fieldRecord(value); return text(field.fieldValue) || text(field.value) || text(field.questionId); };
const fieldType = (value: unknown) => { const field = fieldRecord(value); return text(field.type) || text(field.dataType) || "Not specified"; };
type RequirementKind = "document" | "information" | "unknown";
const requirementKind = (value: unknown): RequirementKind => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "unknown";
  const key = fieldKey(value).toLowerCase();
  const type = fieldType(value).toLowerCase();
  if (!key || type === "not specified") return "unknown";
  if (/document|file|evidence|attachment/.test(`${type} ${key}`)) return "document";
  if (/text|string|textarea|number|boolean|select|choice|date|email|url/.test(type)) return "information";
  return "unknown";
};
const requirementAnalysis = (item: AdminRfiCase) => {
  const required = fields(item);
  const documentFields = required.filter((value) => requirementKind(value) === "document");
  const informationFields = required.filter((value) => requirementKind(value) === "information");
  const unknownFields = required.filter((value) => requirementKind(value) === "unknown");
  return { required, documentFields, informationFields, unknownFields };
};
const providerStatusLabel = (item: AdminRfiCase) => item.provider_status === "RFI_RESPONDED" && item.status === "responded_under_review"
  ? "RFI Responded — Under Compliance Review"
  : item.provider_status || "Not available";
const safeText = (value?: string | null) => text(value) || "Not available";
const reconciliationRequired = (value?: boolean | null) => value === true ? "Yes" : value === false ? "No" : "Not available";
const explicitRequestLabel = (item: AdminRfiCase) => {
  const source = [text(item.template_name), text(template(item)?.name), text(template(item)?.documentType), ...fields(item).map((value, index) => fieldLabel(value, index)), remarks(item)].join(" ").toLowerCase();
  if (source.includes("company source of funds") || source.includes("corporate source of wealth")) return "Corporate Source of Wealth & Source of Funds";
  if (source.includes("personal source of wealth")) return "Personal Source of Wealth";
  if (source.includes("personal source of funds")) return "Personal Source of Funds";
  if (source.includes("business registration document") || source.includes("certificate of incorporation")) return "Certificate of Incorporation / Corporate Documents";
  return "";
};
const humanize = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const requestName = (item: AdminRfiCase) => {
  const explicit = explicitRequestLabel(item);
  if (explicit) return explicit;
  const providerName = text(item.template_name) || text(template(item)?.name) || text(template(item)?.documentType) || text(item.evidence?.description);
  return providerName && !["otherdocument", "document"].includes(providerName.toLowerCase()) ? humanize(providerName) : `RFI request #${item.id}`;
};
const requestSubject = (item: AdminRfiCase) => {
  const source = [requestName(item), ...fields(item).map((value, index) => fieldLabel(value, index)), remarks(item)].join(" ").toLowerCase();
  if (/\bpersonal\b|\bindividual\b/.test(source)) return "Individual associated with the customer";
  if (/\bcompany\b|\bcorporate\b|business registration|certificate of incorporation/.test(source)) return "Company";
  return item.scope === "transaction" ? "Transaction" : "Subject not specified by provider";
};
const conciseRemarks = (value: string) => {
  if (!value) return "No original Nium remarks were supplied.";
  const firstLine = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || value;
  const firstSentence = firstLine.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || firstLine;
  return firstSentence.length > 220 ? `${firstSentence.slice(0, 217).trimEnd()}...` : firstSentence;
};
const remarkParts = (value: string) => {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const expanded = lines.length === 1 ? lines[0].split(/\s+(?=\d+[.)]\s+)/).filter(Boolean) : lines;
  const options = expanded.filter((line) => /^\d+[.)]\s+/.test(line)).map((line) => line.replace(/^\d+[.)]\s+/, ""));
  const prose = expanded.filter((line) => !/^\d+[.)]\s+/.test(line));
  return { prose, options };
};
const requiredDocumentCount = (item: AdminRfiCase) => item.required_document_count ?? fields(item).length;
const customerName = (item: AdminRfiCase) => text(item.customer_name) || text(item.business_name) || text(item.legal_name) || text(item.customer?.business_name) || text(item.customer?.legal_name);
const historical = (item: AdminRfiCase) => Boolean(item.origin && item.origin !== "authoritative_fetch");
const withCustomer = (state: string) => ["sent_to_user", "user_draft", "revision_requested"].includes(state);
const needsAction = (state: string) => ["new", "revision_requested", "user_submitted", "admin_review", "not_claimed", "draft", "approved", "nium_submission_failed"].includes(state);
const complete = (state: string) => ["nium_submitted", "provider_acknowledged", "unknown", "rejected", "responded", "reconciled"].includes(state);
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
  const [actionSuccess, setActionSuccess] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [liveConfirmation, setLiveConfirmation] = useState("");

  const query = useMemo(() => { const params = new URLSearchParams({ page: String(page) }); if (search.trim()) params.set("search", search.trim()); if (scope !== "all") params.set("scope", scope); if (status.trim()) params.set("status", status.trim()); if (submissionState !== "all") params.set("submission_state", submissionState); return params.toString(); }, [page, scope, search, status, submissionState]);
  const casesQuery = useQuery({ queryKey: ["admin", "nium-rfi-cases", query, token], enabled: !!token, queryFn: () => getAdminRfiCases(query, token) });
  const detailQuery = useQuery({ queryKey: ["admin", "nium-rfi-cases", "detail", selectedId, token], enabled: !!token && selectedId !== null, queryFn: () => getAdminRfiCase(selectedId as number, token) });
  const refresh = async (updated?: AdminRfiCase) => { if (updated) client.setQueryData(["admin", "nium-rfi-cases", "detail", updated.id, token], updated); await client.invalidateQueries({ queryKey: ["admin", "nium-rfi-cases"] }); };
  const mutation = useMutation({
    mutationFn: async ({ action, item }: { action: "send" | "revision" | "approve-user" | "save-draft" | "approve-draft" | "submit-provider" | "refresh-provider"; item: AdminRfiCase }) => {
      if (action === "send") return sendAdminRfiToUser(item.id, token);
      if (action === "revision") return requestAdminRfiRevision(item.id, revisionReason.trim(), token);
      if (action === "approve-user") return approveAdminRfiUserSubmission(item.id, token);
      if (action === "approve-draft") return approveAdminRfiCase(item.id, token);
      if (action === "submit-provider") { if (!item.submission_eligible || !item.provider_reference_fingerprint || !item.template_fingerprint) throw new Error("The backend has not confirmed that this exact Corporate RFI is eligible for live submission."); return submitAdminRfiCase(item, token); }
      if (action === "refresh-provider") { if (!item.status_refresh_eligible || !item.provider_reference_fingerprint || !item.template_fingerprint) throw new Error("The backend has not confirmed that this case can be refreshed."); return refreshAdminRfiStatus(item, token); }
      const factualAnswers = answers.map((answer) => ({ questionId: answer.questionId.trim(), answer: answer.answer.trim() }));
      if (factualAnswers.some((answer) => !answer.questionId || !answer.answer)) throw new Error("Each response item requires a question ID and factual answer.");
      return saveAdminRfiDraft(item.id, { answers: factualAnswers }, token);
    },
    onSuccess: async (updated, variables) => {
      const messages = {
        send: "The RFI request was sent to the customer.",
        revision: "The revision request was sent to the customer.",
        "approve-user": "The customer submission was approved by Origin Wallet.",
        "save-draft": "The factual response draft was saved.",
        "approve-draft": "The factual response draft was approved.",
        "submit-provider": "The approved response was submitted to Nium.",
        "refresh-provider": "The authoritative Nium status was refreshed.",
      };
      setActionError("");
      setActionSuccess(messages[variables.action]);
      setConfirmAction(null);
      setLiveConfirmation("");
      setRevisionReason("");
      await refresh(updated);
    },
    onError: (error) => { setConfirmAction(null); setLiveConfirmation(""); setActionSuccess(""); setActionError(error instanceof Error ? error.message : "Unable to update the RFI request."); },
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
  const inspect = (item: AdminRfiCase) => { if (historical(item)) return; setSelectedId(item.id); setAnswers([{ questionId: "", answer: "" }]); setRevisionReason(""); setActionError(""); setActionSuccess(""); };
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
            success={actionSuccess}
            pending={mutation.isPending}
            act={(action) => mutation.mutate({ action, item: selected })}
            preview={preview}
            confirm={setConfirmAction}
            refreshStatus={() => mutation.mutate({ action: "refresh-provider", item: selected })}
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
              ? `This is an irreversible live submission for ${selected ? customerName(selected) || "the selected company" : "the selected company"}, Case #${selected?.id ?? ""}. Type SUBMIT ${selected?.id ?? ""} to continue.`
              : "Approval advances the backend workflow. It does not submit the response to Nium."}
          </AlertDialogDescription>
          {confirmAction === "submit-provider" ? <Input aria-label="Live submission confirmation" value={liveConfirmation} onChange={(event) => setLiveConfirmation(event.target.value)} placeholder={`SUBMIT ${selected?.id ?? ""}`} /> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending || confirmAction === "submit-provider" && liveConfirmation !== `SUBMIT ${selected?.id ?? ""}`}
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

const RequestCard = ({ item, inspect }: { item: AdminRfiCase; inspect: () => void }) => (
  <article className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          {item.scope === "customer" ? "Customer RFI" : "Transaction RFI"} · Case #{item.id}
        </div>
        <h3 className="mt-2 break-words text-xl font-semibold leading-7 text-slate-950">{requestName(item)}</h3>
        <p className="mt-1 text-sm font-medium text-slate-500">Subject: {requestSubject(item)}</p>
      </div>
      <Badge className="w-fit shrink-0 bg-slate-100 text-slate-700 hover:bg-slate-100">
        {labels[item.submission_state] || "Status unavailable"}
      </Badge>
    </div>

    <div className="mt-4 border-l-2 border-amber-300 pl-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">Nium request summary</div>
      <p className="mt-1 text-sm leading-6 text-slate-700">{conciseRemarks(remarks(item))}</p>
    </div>

    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
      <Fact label="Required information" value={requiredDocumentCount(item) ? `${requiredDocumentCount(item)} provider-defined item(s)` : "Not summarized in list response"} />
      <Fact label="Last updated" value={formatDate(item.updated_at)} />
    </dl>

    <div className="mt-auto pt-5">
      <div className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-950">
        <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">Next permitted step</div>
        <div className="mt-1 font-medium">{nextAction(item)}</div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" onClick={inspect}>
          View RFI details
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  </article>
);

const CaseDetail = ({ item, answers, setAnswers, revisionReason, setRevisionReason, error, success, pending, act, preview, confirm, refreshStatus }: { item: AdminRfiCase; answers: Array<{ questionId: string; answer: string }>; setAnswers: Dispatch<SetStateAction<Array<{ questionId: string; answer: string }>>>; revisionReason: string; setRevisionReason: (value: string) => void; error: string; success: string; pending: boolean; act: (action: "send" | "revision" | "approve-user" | "save-draft") => void; preview: (url?: string | null) => void; confirm: (action: ConfirmAction) => void; refreshStatus: () => void }) => {
  const { required, documentFields, informationFields, unknownFields } = requirementAnalysis(item);
  const providerText = remarks(item);
  const parsedRemarks = remarkParts(providerText);
  const recordedAnswers = item.response_draft ?? [];
  const answeredKeys = new Set(recordedAnswers.map((answer) => answer.questionId).filter(Boolean));
  const missingInformation = informationFields.filter((value) => fieldKey(value) && !answeredKeys.has(fieldKey(value)));
  const answersValue = unknownFields.length
    ? "Unverified"
    : informationFields.length === 0 && documentFields.length > 0
      ? "Not required"
      : missingInformation.length > 0
        ? "Missing"
        : informationFields.length > 0
          ? `${informationFields.length} complete`
          : "Not available";
  const canDraft = item.status === "requested" && ["not_claimed", "draft"].includes(item.submission_state);
  const canApprove = item.status === "requested" && item.submission_state === "draft";
  const canSubmit = item.submission_eligible === true;
  const review = ["user_submitted", "admin_review"].includes(item.submission_state);

  return (
    <div className="space-y-8 px-5 py-6 pb-10 sm:px-8">
      <section aria-labelledby="request-overview-title" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Request overview</div>
            <h2 id="request-overview-title" className="mt-2 text-2xl font-semibold leading-8 text-slate-950">{requestName(item)}</h2>
            <p className="mt-1 text-sm text-slate-600">{customerName(item) || "Customer identity unavailable"} · {requestSubject(item)}</p>
          </div>
          <Badge variant="outline">{labels[item.submission_state] || "Status unavailable"}</Badge>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Case" value={`#${item.id}`} />
          <Fact label="Origin" value={item.origin === "authoritative_fetch" ? "Authoritative provider fetch" : item.origin || "Not supplied"} />
          <Fact label="Provider RFI status" value={providerStatusLabel(item)} />
          <Fact label="Origin Wallet state" value={labels[item.submission_state] || humanize(item.submission_state)} />
          <Fact label="Business status" value={humanize(item.status)} />
          <Fact label="Last updated" value={formatDate(item.updated_at)} />
        </dl>
      </section>

      <Lifecycle item={item} />

      <Block title="Original Nium Request" icon={MessageSquareText}>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">Provider-authored text</div>
          {providerText ? <RemarkContent prose={parsedRemarks.prose} options={parsedRemarks.options} /> : <p className="mt-3 text-sm text-amber-950">No original provider remarks were supplied.</p>}
        </div>
      </Block>

      <Block title="Required Information" icon={FileCheck2}>
        {informationFields.length ? (
          <div className="space-y-3">
            {informationFields.map((value, index) => <RequirementCard key={`${fieldKey(value) || "information"}-${index}`} value={value} index={index} answered={answeredKeys.has(fieldKey(value))} />)}
          </div>
        ) : <Unavailable message={unknownFields.length ? "The provider requirements could not be safely classified. Answer requirements remain unverified." : required.length ? "Document-only request. No structured textual answers are required." : "No structured information fields were supplied by the provider."} />}
      </Block>

      <Block title="Required / Accepted Documents" icon={FileText}>
        {documentFields.length ? <div className="space-y-3">{documentFields.map((value, index) => <RequirementCard key={`${fieldKey(value) || "document"}-${index}`} value={value} index={index} answered={Boolean(item.documents?.length)} />)}</div> : null}
        {parsedRemarks.options.length ? (
          <div className={`${documentFields.length ? "mt-4" : ""} rounded-2xl border border-slate-200 bg-slate-50 p-5`}>
            <div className="font-semibold text-slate-900">{/one of/i.test(providerText) ? "Provide one of the following" : /all of/i.test(providerText) ? "Provide all listed documents" : "Provider-listed document options"}</div>
            {!/one of|all of/i.test(providerText) ? <p className="mt-1 text-xs text-slate-500">The API does not specify whether these alternatives are cumulative or optional.</p> : null}
            <ol className="mt-3 space-y-2 pl-5 text-sm leading-6 text-slate-700">{parsedRemarks.options.map((option, index) => <li key={`${option}-${index}`} className="list-decimal pl-1">{option}</li>)}</ol>
          </div>
        ) : null}
        {!documentFields.length && !parsedRemarks.options.length ? <Unavailable message={unknownFields.length ? "The provider requirements are malformed or unrecognized; document requirements cannot be verified." : "No structured document list was supplied. Refer to the original Nium request without inferring additional requirements."} /> : null}
      </Block>

      <Block title="Customer Response" icon={UserRoundCheck}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="font-semibold text-slate-900">Provided answers</div>
            {recordedAnswers.length ? <div className="mt-3 space-y-3">{recordedAnswers.map((answer, index) => <div key={`${answer.questionId || "response"}-${index}`} className="rounded-xl bg-slate-50 p-4 text-sm"><div className="font-medium text-slate-900">{answer.questionId || `Response ${index + 1}`}</div><div className="mt-1 whitespace-pre-wrap leading-6 text-slate-600">{factualAnswer(answer.answer)}</div></div>)}</div> : <p className="mt-3 text-sm text-slate-500">{informationFields.length === 0 && documentFields.length > 0 && unknownFields.length === 0 ? "Structured answers are not required for this document-only request." : "No customer or Admin factual answers are recorded."}</p>}
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><div className="font-medium text-slate-900">Customer explanation</div><div className="mt-1 whitespace-pre-wrap text-slate-600">{item.user_explanation || "No explanation has been provided."}</div></div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="font-semibold text-slate-900">Uploaded evidence</div>
            {item.documents?.length ? <div className="mt-3 space-y-2">{item.documents.map((document) => <button key={document.id} type="button" disabled={!document.file_url} onClick={() => preview(document.file_url)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"><div className="min-w-0"><div className="truncate font-medium text-slate-900">{document.original_name || "Supporting document"}</div><div className="mt-1 text-xs text-slate-500">{document.type ? `${humanize(document.type)} · ` : ""}{document.status || "Status unavailable"} · Authenticated preview</div></div><ChevronRight className="h-4 w-4 shrink-0" /></button>)}</div> : <p className="mt-3 text-sm text-slate-500">No uploaded evidence is exposed for this case.</p>}
          </div>
        </div>
      </Block>

      <Block title="Admin Review" icon={ShieldAlert}>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <ReviewMetric label="Answers" value={answersValue} warning={answersValue === "Missing" || answersValue === "Unverified"} />
            <ReviewMetric label="Evidence" value={item.documents?.length ? `${item.documents.length} attached` : "None attached"} warning={Boolean(documentFields.length && !item.documents?.length)} />
            <ReviewMetric label="Structured gaps" value={unknownFields.length ? "Requirements unverified" : missingInformation.length ? `${missingInformation.length} unanswered` : informationFields.length ? "No detected gaps" : "Not applicable"} warning={missingInformation.length > 0 || unknownFields.length > 0} />
          </div>
          {item.revision_reason ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><div className="font-semibold">Latest revision reason</div><div className="mt-1 whitespace-pre-wrap">{item.revision_reason}</div></div> : null}
        </div>
      </Block>

      <Block title="Workflow History" icon={History}>
        {item.history?.length ? <ol className="space-y-3">{item.history.map((event, index) => <li key={`${event.event_type}-${index}`} className="border-l-2 border-emerald-200 pl-4 text-sm"><div className="font-medium text-slate-900">{labels[event.to_state || ""] || humanize(event.event_type)}</div><div className="mt-1 text-slate-500">{event.from_state ? `${labels[event.from_state] || humanize(event.from_state)} → ` : ""}{formatDate(event.created_at)}</div></li>)}</ol> : <Unavailable message="No workflow history events were returned by the API." />}
        <p className="mt-3 text-xs text-slate-500">Customer submission records delivery to Origin Wallet. It is separate from an actual provider submission to Nium.</p>
      </Block>

      <Block title="Provider Submission History" icon={History}>
        <dl aria-label="Safe provider submission history" className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Submission state" value={labels[item.submission_state] || humanize(item.submission_state)} />
          <Fact label="POST HTTP status" value={typeof item.provider_http_status === "number" ? String(item.provider_http_status) : "Not available"} />
          <Fact label="Provider outcome" value={safeText(item.provider_outcome)} />
          <Fact label="Authoritative GET confirmation" value={safeText(item.authoritative_rfi_status || item.provider_status)} />
          <Fact label="Reconciliation timestamp" value={formatDate(item.reconciled_at)} />
          <Fact label="Further reconciliation required" value={reconciliationRequired(item.manual_reconciliation_required)} />
        </dl>
        <p className="mt-3 text-xs text-slate-500">Only bounded operational evidence is shown. Exact provider response content and transport identifiers are not available here.</p>
      </Block>

      <section aria-labelledby="workflow-actions-title" className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div><h3 id="workflow-actions-title" className="font-semibold text-slate-950">Workflow actions</h3><p className="mt-1 text-sm text-slate-600">{nextAction(item)}</p></div>
          <WorkflowActions item={item} answers={answers} setAnswers={setAnswers} revisionReason={revisionReason} setRevisionReason={setRevisionReason} pending={pending} review={review} canDraft={canDraft} canApprove={canApprove} canSubmit={canSubmit} act={act} confirm={confirm} refreshStatus={refreshStatus} />
        </div>
        {success ? <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div> : null}
        {error ? <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      </section>

      <details className="rounded-xl border border-slate-200 p-4 text-sm">
        <summary className="cursor-pointer font-medium text-slate-900 focus-visible:ring-2 focus-visible:ring-emerald-500">Technical Diagnostics</summary>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Diagnostic label="Case ID" value={String(item.id)} /><Diagnostic label="Raw provider status" value={item.status} /><Diagnostic label="Raw workflow state" value={item.submission_state} /><Diagnostic label="Origin" value={item.origin || "Not supplied"} /><Diagnostic label="Contract gate" value={item.contract_gate} /><Diagnostic label="Reconciled" value={formatDate(item.reconciled_at)} /></dl>
      </details>
    </div>
  );
};

const RemarkContent = ({ prose, options }: { prose: string[]; options: string[] }) => (
  <div className="mt-3 space-y-3 text-sm leading-7 text-amber-950">
    {prose.map((line, index) => <p key={`${line}-${index}`} className="whitespace-pre-wrap">{line}</p>)}
    {options.length ? <ol className="space-y-2 pl-5">{options.map((option, index) => <li key={`${option}-${index}`} className="list-decimal pl-1">{option}</li>)}</ol> : null}
  </div>
);

const RequirementCard = ({ value, index, answered }: { value: unknown; index: number; answered: boolean }) => {
  const field = fieldRecord(value);
  const required = typeof field.required === "boolean" ? field.required : typeof field.optional === "boolean" ? !field.optional : null;
  const choices = [field.choices, field.options, field.allowedValues].find(Array.isArray) as unknown[] | undefined;
  const question = text(field.question) || text(field.instructions) || text(field.description);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Requirement {index + 1}</div>
          <h4 className="mt-1 font-semibold leading-6 text-slate-950">{fieldLabel(value, index)}</h4>
        </div>
        <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${answered ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{answered ? "Response available" : "No matching response"}</span>
      </div>
      {question && question !== fieldLabel(value, index) ? <p className="mt-3 text-sm leading-6 text-slate-700">{question}</p> : null}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <Fact label="Response key" value={fieldKey(value) || "Not supplied"} />
        <Fact label="Type" value={humanize(fieldType(value))} />
        <Fact label="Requirement" value={required === true ? "Mandatory" : required === false ? "Optional" : "Not specified by provider"} />
      </dl>
      {choices?.length ? <div className="mt-4"><div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Provider choices</div><ul className="mt-2 grid gap-2 sm:grid-cols-2">{choices.map((choice, choiceIndex) => <li key={choiceIndex} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{typeof choice === "object" ? text(fieldRecord(choice).label) || text(fieldRecord(choice).value) || "Structured option" : String(choice)}</li>)}</ul></div> : null}
    </article>
  );
};

const factualAnswer = (value: unknown) => typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "Structured factual response recorded";

const ReviewMetric = ({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) => (
  <div className={`rounded-xl border p-4 ${warning ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
    <div className={`text-xs font-semibold uppercase tracking-wider ${warning ? "text-amber-700" : "text-emerald-700"}`}>{label}</div>
    <div className="mt-1 font-medium text-slate-900">{value}</div>
  </div>
);

const WorkflowActions = ({ item, answers, setAnswers, revisionReason, setRevisionReason, pending, review, canDraft, canApprove, canSubmit, act, confirm, refreshStatus }: { item: AdminRfiCase; answers: Array<{ questionId: string; answer: string }>; setAnswers: Dispatch<SetStateAction<Array<{ questionId: string; answer: string }>>>; revisionReason: string; setRevisionReason: (value: string) => void; pending: boolean; review: boolean; canDraft: boolean; canApprove: boolean; canSubmit: boolean; act: (action: "send" | "revision" | "approve-user" | "save-draft") => void; confirm: (action: ConfirmAction) => void; refreshStatus: () => void }) => (
  <div className="w-full space-y-3 xl:max-w-2xl">
    {["new", "revision_requested"].includes(item.submission_state) ? <Button className="w-full sm:w-auto" disabled={pending} onClick={() => act("send")}><Send className="h-4 w-4" />{pending ? "Sending..." : "Send request to customer"}</Button> : null}
    {review ? <div className="rounded-xl border border-slate-200 p-4"><Label htmlFor="revision-reason">Revision reason</Label><Textarea id="revision-reason" className="mt-2" value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} placeholder="Explain exactly what the customer must correct" /><div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={!revisionReason.trim() || pending} onClick={() => act("revision")}>Request revision</Button><Button disabled={pending} onClick={() => act("approve-user")}>Approve customer submission</Button></div><p className="mt-3 text-xs text-slate-500">Origin Wallet approval does not submit this request to Nium.</p></div> : null}
    {canDraft || item.submission_state === "approved" ? <div className="rounded-xl border border-slate-200 p-4"><div className="font-medium text-slate-900">Admin factual response</div><div className="mt-3 space-y-3">{answers.map((answer, index) => <div key={index} className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor={`question-${index}`}>Question ID</Label><Input id={`question-${index}`} className="mt-1" disabled={!canDraft || pending} value={answer.questionId} onChange={(event) => setAnswers((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, questionId: event.target.value } : value))} /></div><div><Label htmlFor={`answer-${index}`}>Factual answer</Label><Textarea id={`answer-${index}`} className="mt-1 min-h-10" disabled={!canDraft || pending} value={answer.answer} onChange={(event) => setAnswers((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, answer: event.target.value } : value))} /></div></div>)}</div><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={!canDraft || pending} onClick={() => act("save-draft")}>Save factual draft</Button><Button disabled={!canApprove || pending} onClick={() => confirm("approve-draft")}>Approve factual draft</Button></div></div> : null}
    {["approved", "admin_approved", "nium_submission_failed"].includes(item.submission_state) ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="font-medium text-amber-950">Nium submission</div><p className="mt-1 text-sm text-amber-900">{item.contract_gate === "provider_contract_unconfirmed" ? "Blocked because the exact Corporate RFI provider contract remains unconfirmed." : "The backend reports that provider submission is available after confirmation."}</p><Button className="mt-3 w-full sm:w-auto" disabled={!canSubmit || pending} onClick={() => confirm("submit-provider")}><Send className="h-4 w-4" />Submit approved response to Nium</Button></div> : null}
    {item.status_refresh_eligible ? <Button className="w-full sm:w-auto" variant="outline" disabled={pending} onClick={refreshStatus}><RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />Refresh Nium Status</Button> : null}
    {!needsAction(item.submission_state) ? <div className="rounded-xl bg-slate-100 p-4 text-sm text-slate-600">No state-changing Admin action is available for the current backend workflow state.</div> : null}
  </div>
);

const Lifecycle = ({ item }: { item: AdminRfiCase }) => <div aria-label="RFI lifecycle" className="rounded-2xl bg-slate-950 p-3 sm:p-4"><div className="grid grid-cols-5 gap-1">{steps.map(([label, Icon], index) => <div key={label} className="min-w-0 text-center"><div className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full ${index <= (stepByState[item.submission_state] ?? 0) ? "bg-emerald-400 text-slate-950" : "bg-slate-800 text-slate-500"}`}><Icon className="h-4 w-4" /></div><div className="mt-2 break-words text-[9px] leading-3 text-slate-200 sm:text-[11px]">{label}</div></div>)}</div></div>;
const Metric = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => <div className={`rounded-xl border p-3 ${accent ? "border-amber-300/30 bg-amber-300/10" : "border-white/10 bg-white/5"}`}><div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div><div className={`mt-1 text-xl font-semibold ${accent ? "text-amber-200" : "text-white"}`}>{value}</div></div>;
const Fact = ({ label, value }: { label: string; value: string }) => <div className="min-w-0"><dt className="text-xs uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 break-words font-medium text-slate-800">{value}</dd></div>;
const Block = ({ title, icon: Icon, children }: { title: string; icon: typeof FileText; children: ReactNode }) => <section><div className="mb-3 flex items-center gap-2"><Icon className="h-4 w-4 text-emerald-700" /><h3 className="font-semibold">{title}</h3></div>{children}</section>;
const Diagnostic = ({ label, value }: { label: string; value: string }) => <div><dt className="text-xs uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>;
const Unavailable = ({ message }: { message: string }) => <div className="rounded-xl border border-dashed p-5 text-sm text-slate-500">{message}</div>;
const State = ({ title, message, icon: Icon, role, action }: { title: string; message: string; icon: typeof Inbox; role?: "alert"; action?: ReactNode }) => <section role={role} className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center"><Icon className="mx-auto h-7 w-7 text-slate-400" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">{message}</p>{action ? <div className="mt-4">{action}</div> : null}</section>;
const Loading = () => <div aria-label="Loading RFI cases" className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="animate-pulse rounded-2xl border bg-white p-5"><div className="h-3 w-24 rounded bg-slate-200" /><div className="mt-3 h-6 w-2/3 rounded bg-slate-200" /><div className="mt-5 h-12 rounded bg-slate-100" /></div>)}</div>;

export default AdminRfiCases;
