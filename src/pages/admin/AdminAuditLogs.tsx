import { useQuery } from "@tanstack/react-query";
import { Activity, FileClock, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type { AdminAuditLog } from "@/types/admin";
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

const formatJsonPreview = (value?: Record<string, unknown> | null) => {
  if (!value || Object.keys(value).length === 0) {
    return "-";
  }

  return JSON.stringify(value, null, 2);
};

const entityOptions = [
  { value: "all", label: "All entities" },
  { value: "user", label: "Users" },
  { value: "kyc_profile", label: "KYC/KYB" },
  { value: "fx_order", label: "FX orders" },
  { value: "transaction", label: "Transactions" },
  { value: "exchange_rate", label: "Rates" },
  { value: "provider", label: "Providers" },
  { value: "wallet", label: "Wallets" },
] as const;

const AdminAuditLogs = () => {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [entityFilter, setEntityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<AdminAuditLog | null>(null);

  const queryPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));

    if (entityFilter !== "all") {
      params.set("entity_type", entityFilter);
    }

    if (search.trim()) {
      params.set("search", search.trim());
    }

    return `${adminEndpointConfig.auditLogs}?${params.toString()}`;
  }, [entityFilter, page, search]);

  const auditLogsQuery = useQuery({
    queryKey: ["admin", "audit-logs", entityFilter, search, page, token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<AdminAuditLog>>(queryPath, { method: "GET", token }),
  });

  const rows = useMemo(() => auditLogsQuery.data?.data ?? [], [auditLogsQuery.data?.data]);
  const canGoBack = (auditLogsQuery.data?.current_page ?? page) > 1;
  const canGoNext = (auditLogsQuery.data?.current_page ?? page) < (auditLogsQuery.data?.last_page ?? page);
  const currentActorCount = new Set(rows.map((row) => row.actor_email || row.actor?.email || row.actor_id).filter(Boolean)).size;
  const sensitiveCount = rows.filter((row) =>
    ["delete", "approve", "reject", "confirm", "freeze", "adjust", "reversal"].some((keyword) =>
      row.action.toLowerCase().includes(keyword),
    ),
  ).length;

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <FileClock className="h-6 w-6 text-emerald-600" />
                Audit trail
              </CardTitle>
              <CardDescription>Trace admin actions across users, KYC/KYB, FX, providers, rates, and wallet operations.</CardDescription>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-[220px_1fr] lg:max-w-xl">
              <Select
                value={entityFilter}
                onValueChange={(value) => {
                  setEntityFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-11 rounded-2xl border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {entityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search actor, action, reference"
                  className="h-11 rounded-2xl border-slate-200 pl-11"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {auditLogsQuery.isError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {auditLogsQuery.error instanceof Error ? auditLogsQuery.error.message : "Unable to load audit logs."}
              </div>
            )}

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <Table className="min-w-[960px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Network</TableHead>
                      <TableHead className="text-right">Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length > 0 ? (
                      rows.map((row) => (
                        <TableRow key={row.id} className={selectedLog?.id === row.id ? "bg-emerald-50/70" : undefined}>
                          <TableCell>
                            <div className="font-medium text-slate-900">{formatDate(row.created_at)}</div>
                            <div className="text-xs text-slate-500">#{row.id}</div>
                          </TableCell>
                          <TableCell>
                            <div className="break-all font-medium text-slate-900">
                              {row.actor_email || row.actor?.email || `Admin #${row.actor_id ?? "-"}`}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{row.action}</Badge>
                            {row.summary && <div className="mt-2 max-w-[260px] truncate text-xs text-slate-500">{row.summary}</div>}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-slate-900">{row.entity_type}</div>
                            <div className="text-xs text-slate-500">{row.entity_id ?? "-"}</div>
                          </TableCell>
                          <TableCell>
                            <div className="break-all text-sm text-slate-700">{row.ip_address || "-"}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <Button size="sm" variant="outline" onClick={() => setSelectedLog(row)}>
                                Inspect
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="h-36 text-center text-slate-500">
                          {auditLogsQuery.isLoading ? "Loading audit logs..." : "No audit logs found."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
              <div>
                Page {auditLogsQuery.data?.current_page ?? page} of {auditLogsQuery.data?.last_page ?? 1}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={!canGoBack} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={!canGoNext} onClick={() => setPage((current) => current + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Audit signals</CardTitle>
              <CardDescription>Current page control signals for operational review.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { title: "Total rows", value: auditLogsQuery.data?.total ?? 0, icon: FileClock },
                { title: "Actors visible", value: currentActorCount, icon: Activity },
                { title: "Sensitive actions", value: sensitiveCount, icon: ShieldAlert },
              ].map((item) => (
                <div key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-lg font-semibold text-slate-950">{item.title}</div>
                  <div className="mt-2 text-sm leading-7 text-slate-600">{item.value}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Selected event</CardTitle>
              <CardDescription>Before and after payloads for the selected action.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedLog ? (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="font-semibold text-slate-950">{selectedLog.action}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {selectedLog.entity_type} {selectedLog.entity_id ?? ""}
                    </div>
                  </div>
                  <AuditJsonBlock title="Before" value={selectedLog.before} />
                  <AuditJsonBlock title="After" value={selectedLog.after} />
                  <AuditJsonBlock title="Metadata" value={selectedLog.metadata} />
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">
                  Select an audit log to inspect payload details.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

function AuditJsonBlock({ title, value }: { title: string; value?: Record<string, unknown> | null }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-950 p-4 text-slate-100">
      <div className="font-semibold">{title}</div>
      <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-300">
        {formatJsonPreview(value)}
      </pre>
    </div>
  );
}

export default AdminAuditLogs;
