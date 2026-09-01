import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, MessagesSquare, Plus, Save, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { approveAdminRfiCase, getAdminRfiCase, getAdminRfiCases, saveAdminRfiDraft, submitAdminRfiCase } from "@/lib/api";
import type { AdminRfiScope, AdminRfiSubmissionState } from "@/types/admin";

const submissionStates: Array<AdminRfiSubmissionState | "all"> = [
  "all",
  "not_claimed",
  "draft",
  "approved",
  "claimed",
  "responded",
  "reconciled",
];

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};

const statusClassName = (status: string) => {
  if (["resolved_authoritative_clear", "reconciled", "responded"].includes(status)) {
    return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  }
  if (["requested", "provisional", "draft", "not_claimed"].includes(status)) {
    return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  }
  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

const factualValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "-";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  return "Structured factual response recorded";
};

const evidenceValue = (evidence: Record<string, unknown> | null | undefined, ...keys: string[]) => {
  for (const key of keys) {
    const value = evidence?.[key];
    if (["string", "number", "boolean"].includes(typeof value) && String(value).trim()) return String(value);
  }
  return "-";
};

const requiredDataSummary = (evidence: Record<string, unknown> | null | undefined) => {
  const requiredData = evidence?.requiredData;
  if (!Array.isArray(requiredData) || requiredData.length === 0) return [];
  return requiredData.map((item, index) => {
    if (!item || typeof item !== "object") return `Required item ${index + 1}`;
    const record = item as Record<string, unknown>;
    return [record.type, record.value, record.description]
      .filter((value) => typeof value === "string" && value.trim())
      .join(" - ") || `Required item ${index + 1}`;
  });
};

const AdminRfiCases = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState<AdminRfiScope | "all">("all");
  const [status, setStatus] = useState("");
  const [submissionState, setSubmissionState] = useState<AdminRfiSubmissionState | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [answers, setAnswers] = useState([{ questionId: "", answer: "" }]);
  const [actionError, setActionError] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (scope !== "all") params.set("scope", scope);
    if (status.trim()) params.set("status", status.trim());
    if (submissionState !== "all") params.set("submission_state", submissionState);
    return params.toString();
  }, [page, scope, status, submissionState]);

  const casesQuery = useQuery({
    queryKey: ["admin", "nium-rfi-cases", query, token],
    enabled: !!token,
    queryFn: () => getAdminRfiCases(query, token),
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "nium-rfi-cases", "detail", selectedId, token],
    enabled: !!token && selectedId !== null,
    queryFn: () => getAdminRfiCase(selectedId as number, token),
  });

  const refreshCaseData = async (updated: Awaited<ReturnType<typeof getAdminRfiCase>>) => {
    queryClient.setQueryData(["admin", "nium-rfi-cases", "detail", updated.id, token], updated);
    await queryClient.invalidateQueries({ queryKey: ["admin", "nium-rfi-cases"] });
  };

  const draftMutation = useMutation({
    mutationFn: () => {
      if (selectedId === null) throw new Error("Select an RFI case before saving a draft.");
      const factualAnswers = answers.map((item) => ({ questionId: item.questionId.trim(), answer: item.answer.trim() }));
      if (factualAnswers.some((item) => !item.questionId || !item.answer)) {
        throw new Error("Each response item requires a question ID and factual answer.");
      }
      return saveAdminRfiDraft(selectedId, { answers: factualAnswers }, token);
    },
    onSuccess: async (updated) => {
      setActionError("");
      await refreshCaseData(updated);
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to save the RFI draft."),
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      if (selectedId === null) throw new Error("Select an RFI case before approval.");
      return approveAdminRfiCase(selectedId, token);
    },
    onSuccess: async (updated) => {
      setApproveOpen(false);
      setActionError("");
      await refreshCaseData(updated);
    },
    onError: (error) => {
      setApproveOpen(false);
      setActionError(error instanceof Error ? error.message : "Unable to approve the RFI draft.");
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      if (selectedId === null) throw new Error("Select an RFI case before submission.");
      return submitAdminRfiCase(selectedId, token);
    },
    onSuccess: async (updated) => {
      setSubmitOpen(false);
      setActionError("");
      await refreshCaseData(updated);
    },
    onError: (error) => {
      setSubmitOpen(false);
      setActionError(error instanceof Error ? error.message : "Unable to submit the RFI response.");
    },
  });

  const rows = casesQuery.data?.data ?? [];
  const canGoBack = (casesQuery.data?.current_page ?? page) > 1;
  const canGoNext = (casesQuery.data?.current_page ?? page) < (casesQuery.data?.last_page ?? page);
  const canDraft = detailQuery.data?.status === "requested" && ["not_claimed", "draft"].includes(detailQuery.data.submission_state);
  const canApprove = detailQuery.data?.status === "requested" && detailQuery.data.submission_state === "draft";
  const canSubmit = detailQuery.data?.scope === "transaction" && detailQuery.data.status === "requested" && detailQuery.data.submission_state === "approved";
  const requiredData = requiredDataSummary(detailQuery.data?.evidence);
  const authoritativeClear = detailQuery.data?.status === "resolved_authoritative_clear";

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="space-y-5">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <MessagesSquare className="h-6 w-6 text-emerald-600" />
                RFI cases
              </CardTitle>
              <CardDescription>Read-only operational visibility into existing Nium RFI cases.</CardDescription>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Select value={scope} onValueChange={(value) => { setScope(value as AdminRfiScope | "all"); setPage(1); }}>
                <SelectTrigger aria-label="Filter by scope" className="rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All scopes</SelectItem><SelectItem value="customer">customer</SelectItem><SelectItem value="transaction">transaction</SelectItem></SelectContent>
              </Select>
              <Input
                aria-label="Filter by status"
                value={status}
                onChange={(event) => { setStatus(event.target.value); setPage(1); }}
                placeholder="Backend status"
                className="rounded-2xl"
              />
              <Select value={submissionState} onValueChange={(value) => { setSubmissionState(value as AdminRfiSubmissionState | "all"); setPage(1); }}>
                <SelectTrigger aria-label="Filter by submission state" className="rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>{submissionStates.map((value) => <SelectItem key={value} value={value}>{value === "all" ? "All submission states" : value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {casesQuery.isError ? <ErrorPanel message={casesQuery.error instanceof Error ? casesQuery.error.message : "Unable to load RFI cases."} /> : null}
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <Table className="min-w-[820px]">
                  <TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Scope</TableHead><TableHead>Status</TableHead><TableHead>Submission</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Detail</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rows.length ? rows.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-slate-900">#{item.id}</TableCell>
                        <TableCell>{item.scope}</TableCell>
                        <TableCell><Badge className={statusClassName(item.status)}>{item.status}</Badge></TableCell>
                        <TableCell><Badge className={statusClassName(item.submission_state)}>{item.submission_state}</Badge></TableCell>
                        <TableCell>{formatDate(item.updated_at)}</TableCell>
                        <TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => { setSelectedId(item.id); setAnswers([{ questionId: "", answer: "" }]); setActionError(""); }}><Eye className="h-4 w-4" />Inspect</Button></TableCell>
                      </TableRow>
                    )) : <TableRow><TableCell colSpan={6} className="h-36 text-center text-slate-500">{casesQuery.isLoading ? "Loading RFI cases..." : "No RFI cases found."}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Page {casesQuery.data?.current_page ?? page} of {casesQuery.data?.last_page ?? 1}</span>
              <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={!canGoBack} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={!canGoNext} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader><CardTitle>Case detail</CardTitle><CardDescription>Backend-authoritative lifecycle, provider request evidence, and human-reviewed response state.</CardDescription></CardHeader>
          <CardContent>
            {detailQuery.isLoading ? <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-slate-500">Loading RFI case detail...</div> : null}
            {detailQuery.isError ? <ErrorPanel message={detailQuery.error instanceof Error ? detailQuery.error.message : "Unable to load RFI case detail."} /> : null}
            {!detailQuery.isLoading && detailQuery.data ? (
              <div className="space-y-4">
                <div className="rounded-3xl bg-slate-950 p-5 text-white"><div className="text-xs uppercase tracking-[0.2em] text-emerald-300">{detailQuery.data.scope === "customer" ? "Corporate RFI" : "Transaction RFI"}</div><div className="mt-2 text-2xl font-semibold">Case #{detailQuery.data.id}</div><div className="mt-3 flex flex-wrap gap-2"><Badge className={statusClassName(detailQuery.data.status)}>{detailQuery.data.status}</Badge><Badge className={statusClassName(detailQuery.data.submission_state)}>{detailQuery.data.submission_state}</Badge>{authoritativeClear ? <Badge className="bg-emerald-400 text-slate-950 hover:bg-emerald-400">CLEAR - backend authoritative</Badge> : null}</div></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Detail label="ID" value={String(detailQuery.data.id)} />
                  <Detail label="Scope" value={detailQuery.data.scope} />
                  <Detail label="Status" value={detailQuery.data.status} />
                  <Detail label="Contract gate" value={detailQuery.data.contract_gate} />
                  <Detail label="Submission state" value={detailQuery.data.submission_state} />
                  <Detail label="Approved" value={formatDate(detailQuery.data.approved_at)} />
                  <Detail label="Claimed" value={formatDate(detailQuery.data.claimed_at)} />
                  <Detail label="Reconciled" value={formatDate(detailQuery.data.reconciled_at)} />
                  <Detail label="Reconciliation state" value={detailQuery.data.reconciled_at ? detailQuery.data.status : "Not reconciled"} />
                  <Detail label="Authoritative compliance" value={authoritativeClear ? "CLEAR" : detailQuery.data.status} />
                  <Detail label="Created" value={formatDate(detailQuery.data.created_at)} />
                  <Detail label="Updated" value={formatDate(detailQuery.data.updated_at)} />
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="font-semibold text-slate-950">Provider request evidence</div>
                  <p className="mt-1 text-sm text-slate-600">Values come from the existing backend RFI detail contract. Provider account and wallet identifiers remain undisclosed.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Detail label="Description" value={evidenceValue(detailQuery.data.evidence, "description")} />
                    <Detail label="Provider RFI status" value={evidenceValue(detailQuery.data.evidence, "rfiStatus", "status")} />
                    <Detail label="Transaction / auth code" value={evidenceValue(detailQuery.data.evidence, "authCode")} />
                    <Detail label="RFI reference" value={evidenceValue(detailQuery.data.evidence, "rfiId", "rfiHashId", "caseId")} />
                    <Detail label="Identification type" value={evidenceValue(detailQuery.data.evidence, "identificationType", "description")} />
                    <Detail label="Supporting documents" value={String(detailQuery.data.supporting_file_count ?? 0)} />
                  </div>
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Required data</div>
                    {requiredData.length ? <ul className="mt-2 space-y-2 text-sm text-slate-800">{requiredData.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <div className="mt-2 text-sm text-slate-500">No required-data items are exposed by the backend for this case.</div>}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Provenance label="Provider-confirmed" value={evidenceValue(detailQuery.data.evidence, "rfiStatus", "status")} />
                  <Provenance label="Human-reviewed" value={detailQuery.data.approved_at ? `Approved ${formatDate(detailQuery.data.approved_at)}` : "Not approved"} />
                  <Provenance label="Local reconciled" value={detailQuery.data.reconciled_at ? formatDate(detailQuery.data.reconciled_at) : "Not reconciled"} />
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="font-semibold text-slate-950">Human-reviewed answers</div>
                  <p className="mt-1 text-sm text-slate-600">Recorded response content and review provenance returned by the backend.</p>
                  {detailQuery.data.response_draft?.length ? <div className="mt-4 space-y-3">{detailQuery.data.response_draft.map((answer, index) => <div key={`${answer.questionId || "answer"}-${index}`} className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{answer.questionId || `Response ${index + 1}`}</div><div className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{factualValue(answer.answer)}</div><div className="mt-2 text-xs text-slate-500">{answer.provenance?.source || "review provenance unavailable"}{answer.provenance?.recorded_at ? ` - ${formatDate(answer.provenance.recorded_at)}` : ""}</div></div>)}</div> : <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No response draft is recorded.</div>}
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><div className="font-semibold text-slate-950">Factual response draft</div><div className="mt-1 text-sm text-slate-600">Enter explicit question IDs and factual answers only. Evidence, provider payloads, reviewer metadata, and file identifiers remain hidden.</div></div>
                    <Button type="button" size="sm" variant="outline" disabled={!canDraft || draftMutation.isPending} onClick={() => setAnswers((current) => [...current, { questionId: "", answer: "" }])}><Plus className="h-4 w-4" />Add item</Button>
                  </div>
                  <div className="mt-4 space-y-4">
                    {answers.map((item, index) => (
                      <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3"><div className="text-sm font-semibold text-slate-900">Response item {index + 1}</div>{answers.length > 1 ? <Button type="button" size="icon" variant="ghost" aria-label={`Remove response item ${index + 1}`} disabled={!canDraft || draftMutation.isPending} onClick={() => setAnswers((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button> : null}</div>
                        <div className="mt-3 grid gap-3">
                          <div className="space-y-2"><Label htmlFor={`rfi-question-${index}`}>Question ID</Label><Input id={`rfi-question-${index}`} value={item.questionId} disabled={!canDraft || draftMutation.isPending} onChange={(event) => setAnswers((current) => current.map((answer, itemIndex) => itemIndex === index ? { ...answer, questionId: event.target.value } : answer))} /></div>
                          <div className="space-y-2"><Label htmlFor={`rfi-answer-${index}`}>Factual answer</Label><Textarea id={`rfi-answer-${index}`} value={item.answer} disabled={!canDraft || draftMutation.isPending} onChange={(event) => setAnswers((current) => current.map((answer, itemIndex) => itemIndex === index ? { ...answer, answer: event.target.value } : answer))} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {actionError ? <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div> : null}
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="outline" disabled={!canDraft || draftMutation.isPending} onClick={() => draftMutation.mutate()}><Save className="h-4 w-4" />{draftMutation.isPending ? "Saving..." : "Save draft"}</Button>
                    <Button type="button" disabled={!canApprove || approveMutation.isPending} onClick={() => setApproveOpen(true)}><CheckCircle2 className="h-4 w-4" />Approve draft</Button>
                  </div>
                  <Button type="button" className="mt-2 w-full" disabled={!canSubmit || submitMutation.isPending} onClick={() => setSubmitOpen(true)}><Send className="h-4 w-4" />Submit approved transaction RFI</Button>
                  <p className="mt-2 text-xs text-slate-500">Submission uses the existing authenticated backend endpoint and is disabled as soon as the backend advances the case state.</p>
                </div>
              </div>
            ) : !detailQuery.isLoading && !detailQuery.isError ? <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-slate-500">Select an RFI case to inspect.</div> : null}
          </CardContent>
        </Card>
      </div>
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Approve factual RFI draft?</AlertDialogTitle><AlertDialogDescription>Approval advances the submission state for backend-controlled provider submission. This action does not display or modify raw evidence.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={approveMutation.isPending}>Cancel</AlertDialogCancel><AlertDialogAction disabled={approveMutation.isPending} onClick={(event) => { event.preventDefault(); approveMutation.mutate(); }}>{approveMutation.isPending ? "Approving..." : "Confirm approval"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Submit approved RFI response?</AlertDialogTitle><AlertDialogDescription>This asks the backend to perform the provider submission using its validated contract. Continue only after the recorded answers and supporting evidence have been human-reviewed.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={submitMutation.isPending}>Cancel</AlertDialogCancel><AlertDialogAction disabled={submitMutation.isPending} onClick={(event) => { event.preventDefault(); submitMutation.mutate(); }}>{submitMutation.isPending ? "Submitting..." : "Confirm submission"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl border border-slate-200 p-3"><div className="text-xs uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-1 break-words font-medium text-slate-900">{value}</div></div>;
const Provenance = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">{label}</div><div className="mt-1 break-words text-sm font-medium text-blue-950">{value}</div></div>;
const ErrorPanel = ({ message }: { message: string }) => <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>;

export default AdminRfiCases;
