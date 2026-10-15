import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approveAdminRfiUserSubmission, getAdminRfiCase, getAdminRfiCases, requestAdminRfiRevision, requestApiBlob, sendAdminRfiToUser } from "@/lib/api";
import type { AdminRfiCase } from "@/types/admin";

const fields = (item: AdminRfiCase) => {
  const template = item.evidence?.template;
  if (!template || typeof template !== "object") return [];
  const value = (template as Record<string, unknown>).requiredFields;
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
};

export const CorporateRfiPanel = ({ userId, token }: { userId: number; token?: string | null }) => {
  const client = useQueryClient();
  const [revision, setRevision] = useState<Record<number, string>>({});
  const [actionError, setActionError] = useState("");
  const query = useQuery({
    queryKey: ["admin", "customer-rfis", userId, token],
    enabled: !!token,
    queryFn: async () => {
      const page = await getAdminRfiCases(`scope=customer&user_id=${userId}&per_page=50`, token);
      return { ...page, data: await Promise.all(page.data.map((item) => getAdminRfiCase(item.id, token))) };
    },
  });
  const mutate = useMutation({
    mutationFn: ({ action, item }: { action: "send" | "approve" | "revision"; item: AdminRfiCase }) => action === "send"
      ? sendAdminRfiToUser(item.id, token)
      : action === "approve"
        ? approveAdminRfiUserSubmission(item.id, token)
        : requestAdminRfiRevision(item.id, revision[item.id] || "", token),
    onSuccess: () => {
      setActionError("");
      return client.invalidateQueries({ queryKey: ["admin", "customer-rfis", userId] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to update the Corporate RFI request."),
  });
  const items = query.data?.data.filter((item) => item.origin === "authoritative_fetch") ?? [];
  const reviewDocument = async (url?: string | null) => {
    if (!url) return;
    try {
      const blob = await requestApiBlob(url, { token });
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setActionError("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to review the Corporate RFI document.");
    }
  };

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><div className="font-semibold text-slate-950">Corporate RFI</div><div className="text-sm text-slate-500">{items.filter((item) => item.status === "requested").length} open Nium request(s)</div></div></div>
    {query.isLoading ? <div className="text-sm text-slate-500">Loading Corporate RFI requests...</div> : null}
    {query.isError ? <div role="alert" className="text-sm text-red-700">Unable to load Corporate RFI requests.</div> : null}
    {actionError ? <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</div> : null}
    {items.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">{String((item.evidence?.template as Record<string, unknown> | undefined)?.name || `RFI #${item.id}`)}</div><div className="flex gap-2"><Badge>{item.status}</Badge><Badge variant="outline">{item.submission_state}</Badge></div></div>
      <div className="mt-3 whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-sm text-slate-800">{String(item.evidence?.remarks || "No provider remarks supplied.")}</div>
      <div className="mt-3 space-y-1 text-sm">{fields(item).map((field, index) => <div key={index}><span className="font-medium">{String(field.fieldLabel || "Required document")}</span> · {String(field.type || field.fieldValue || "document")}</div>)}</div>
      {item.user_explanation ? <div className="mt-3 text-sm"><span className="font-medium">Customer explanation:</span> {item.user_explanation}</div> : null}
      {item.documents?.length ? <div className="mt-3 space-y-1 text-sm">{item.documents.map((document) => <Button key={document.id} type="button" variant="link" className="block h-auto p-0 text-emerald-700" onClick={() => reviewDocument(document.file_url)}>{document.original_name || `Document ${document.id}`}</Button>)}</div> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {(["new", "revision_requested"] as string[]).includes(item.submission_state) ? <Button size="sm" onClick={() => mutate.mutate({ action: "send", item })}>Send RFI Request to User</Button> : null}
        {(["user_submitted", "admin_review"] as string[]).includes(item.submission_state) ? <Button size="sm" onClick={() => mutate.mutate({ action: "approve", item })}>Approve Documents</Button> : null}
      </div>
      {(["user_submitted", "admin_review"] as string[]).includes(item.submission_state) ? <div className="mt-3 flex gap-2"><Textarea aria-label={`Revision reason ${item.id}`} value={revision[item.id] || ""} onChange={(event) => setRevision((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Explain required corrections" /><Button variant="outline" disabled={!revision[item.id]?.trim()} onClick={() => mutate.mutate({ action: "revision", item })}>Request Revision</Button></div> : null}
      {item.history?.length ? <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">View Submission History</summary><div className="mt-2 space-y-1">{item.history.map((event, index) => <div key={index}>{event.event_type}: {event.from_state || "-"} → {event.to_state || "-"}</div>)}</div></details> : null}
      <div className="mt-3 text-xs text-slate-500">Submission to Nium: blocked ({item.contract_gate})</div>
    </div>)}
    {!query.isLoading && !items.length ? <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No authoritative Corporate RFI requests.</div> : null}
  </div>;
};
