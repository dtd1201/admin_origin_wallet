import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, Building2, RefreshCcw, RotateCcw, Webhook } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type { AdminProviderHealth, AdminProviderWebhookEvent, ProviderSummary } from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const webhookStatusOptions = [
  { value: "all", label: "All statuses" },
  { value: "received", label: "Received" },
  { value: "processed", label: "Processed" },
  { value: "failed", label: "Failed" },
  { value: "retrying", label: "Retrying" },
  { value: "ignored", label: "Ignored" },
] as const;

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

const statusClassName = (status: string) => {
  const normalized = status.toLowerCase();

  if (["operational", "processed", "received"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  }

  if (["failed", "down"].includes(normalized)) {
    return "bg-red-100 text-red-700 hover:bg-red-100";
  }

  if (["degraded", "retrying", "maintenance"].includes(normalized)) {
    return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  }

  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
};

const getProviderLabel = (providerCode: string, provider?: ProviderSummary | null) =>
  provider?.name ? `${provider.name} (${providerCode})` : providerCode;

const AdminProviderOperations = () => {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [providerFilter, setProviderFilter] = useState("all");
  const [webhookStatusFilter, setWebhookStatusFilter] = useState("failed");
  const [webhookPage, setWebhookPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<AdminProviderWebhookEvent | null>(null);

  const providersQuery = useQuery({
    queryKey: ["admin", "providers", "provider-operations", token],
    enabled: !!token,
    queryFn: async () =>
      requestApi<PaginatedResponse<ProviderSummary>>(adminEndpointConfig.providers, { method: "GET", token }),
  });

  const healthPath = useMemo(() => {
    const params = new URLSearchParams();
    if (providerFilter !== "all") {
      params.set("provider_code", providerFilter);
    }

    const query = params.toString();
    return query ? `${adminEndpointConfig.providerHealth}?${query}` : adminEndpointConfig.providerHealth;
  }, [providerFilter]);

  const webhookPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(webhookPage));

    if (providerFilter !== "all") {
      params.set("provider_code", providerFilter);
    }

    if (webhookStatusFilter !== "all") {
      params.set("status", webhookStatusFilter);
    }

    return `${adminEndpointConfig.providerWebhookEvents}?${params.toString()}`;
  }, [providerFilter, webhookPage, webhookStatusFilter]);

  const healthQuery = useQuery({
    queryKey: ["admin", "provider-health", providerFilter, token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<AdminProviderHealth>>(healthPath, { method: "GET", token }),
  });

  const webhookEventsQuery = useQuery({
    queryKey: ["admin", "provider-webhook-events", providerFilter, webhookStatusFilter, webhookPage, token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<AdminProviderWebhookEvent>>(webhookPath, { method: "GET", token }),
  });

  const providers = useMemo(() => providersQuery.data?.data ?? [], [providersQuery.data?.data]);
  const healthRows = useMemo(() => healthQuery.data?.data ?? [], [healthQuery.data?.data]);
  const webhookRows = useMemo(() => webhookEventsQuery.data?.data ?? [], [webhookEventsQuery.data?.data]);
  const canGoBack = (webhookEventsQuery.data?.current_page ?? webhookPage) > 1;
  const canGoNext = (webhookEventsQuery.data?.current_page ?? webhookPage) < (webhookEventsQuery.data?.last_page ?? webhookPage);

  const invalidateOperations = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "provider-health"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "provider-webhook-events"] }),
    ]);
  };

  const healthCheckMutation = useMutation({
    mutationFn: async (providerCode: string) =>
      requestApi<{ message?: string }>(`${adminEndpointConfig.providerHealth}/${encodeURIComponent(providerCode)}/check`, {
        method: "POST",
        token,
        body: {},
      }),
    onSuccess: async (response) => {
      await invalidateOperations();
      toast({
        title: "Provider check queued",
        description: response.message || "Provider health check has been requested.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Provider check failed",
        description: error instanceof Error ? error.message : "Unable to request provider health check.",
      });
    },
  });

  const retryWebhookMutation = useMutation({
    mutationFn: async (eventId: number) =>
      requestApi<{ message?: string }>(`${adminEndpointConfig.providerWebhookEvents}/${eventId}/retry`, {
        method: "POST",
        token,
        body: {},
      }),
    onSuccess: async (response) => {
      await invalidateOperations();
      toast({
        title: "Webhook retry queued",
        description: response.message || "Webhook event retry has been requested.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Webhook retry failed",
        description: error instanceof Error ? error.message : "Unable to retry webhook event.",
      });
    },
  });

  const refreshAll = async () => {
    await Promise.all([providersQuery.refetch(), healthQuery.refetch(), webhookEventsQuery.refetch()]);
  };

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-6">
          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Activity className="h-6 w-6 text-emerald-600" />
                  Provider operations
                </CardTitle>
                <CardDescription>Monitor provider health, webhook delivery, and retry queues for Nium and future payment partners.</CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Select
                  value={providerFilter}
                  onValueChange={(value) => {
                    setProviderFilter(value);
                    setWebhookPage(1);
                  }}
                >
                  <SelectTrigger className="h-11 w-full rounded-2xl border-slate-200 sm:w-[220px]">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All providers</SelectItem>
                    {providers.map((provider) => (
                      <SelectItem key={provider.code} value={provider.code}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  className="rounded-2xl border-slate-200"
                  onClick={() => void refreshAll()}
                  disabled={providersQuery.isFetching || healthQuery.isFetching || webhookEventsQuery.isFetching}
                >
                  <RefreshCcw className={healthQuery.isFetching || webhookEventsQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {(healthQuery.isError || webhookEventsQuery.isError) && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {healthQuery.error instanceof Error
                    ? healthQuery.error.message
                    : webhookEventsQuery.error instanceof Error
                      ? webhookEventsQuery.error.message
                      : "Unable to load provider operations."}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <SignalCard icon={Building2} title="Providers" value={providersQuery.data?.total ?? 0} />
                <SignalCard icon={Activity} title="Health rows" value={healthQuery.data?.total ?? 0} />
                <SignalCard icon={AlertTriangle} title="Failed webhooks" value={webhookRows.filter((row) => row.status === "failed").length} />
              </div>

              <section className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Provider health</h2>
                </div>
                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[900px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Provider</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Latency</TableHead>
                          <TableHead>Last success</TableHead>
                          <TableHead>Last failure</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {healthRows.length > 0 ? (
                          healthRows.map((row) => (
                            <TableRow key={`${row.provider_code}-${row.id ?? row.last_checked_at ?? "health"}`}>
                              <TableCell>
                                <div className="font-semibold text-slate-950">{getProviderLabel(row.provider_code, row.provider)}</div>
                                <div className="text-xs text-slate-500">{row.environment || "environment unknown"}</div>
                                {row.error_message && <div className="mt-2 max-w-[320px] truncate text-xs text-red-600">{row.error_message}</div>}
                              </TableCell>
                              <TableCell>
                                <Badge className={statusClassName(row.status)}>{row.status}</Badge>
                              </TableCell>
                              <TableCell>{row.latency_ms ? `${row.latency_ms} ms` : "-"}</TableCell>
                              <TableCell>{formatDate(row.last_success_at || row.last_checked_at)}</TableCell>
                              <TableCell>{formatDate(row.last_failure_at)}</TableCell>
                              <TableCell>
                                <div className="flex justify-end">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={healthCheckMutation.isPending}
                                    onClick={() => void healthCheckMutation.mutateAsync(row.provider_code)}
                                  >
                                    <RefreshCcw className="h-4 w-4" />
                                    Check
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                              {healthQuery.isLoading ? "Loading provider health..." : "No provider health rows found."}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-lg font-semibold text-slate-950">Webhook events</h2>
                  <Select
                    value={webhookStatusFilter}
                    onValueChange={(value) => {
                      setWebhookStatusFilter(value);
                      setWebhookPage(1);
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-2xl border-slate-200 sm:w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {webhookStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[980px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Event</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Attempts</TableHead>
                          <TableHead>Received</TableHead>
                          <TableHead>Next retry</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {webhookRows.length > 0 ? (
                          webhookRows.map((event) => (
                            <TableRow key={event.id} className={selectedEvent?.id === event.id ? "bg-emerald-50/70" : undefined}>
                              <TableCell>
                                <div className="font-semibold text-slate-950">{event.event_type}</div>
                                <div className="text-xs text-slate-500">{event.event_id || event.related_reference || `#${event.id}`}</div>
                                {event.error_message && <div className="mt-2 max-w-[320px] truncate text-xs text-red-600">{event.error_message}</div>}
                              </TableCell>
                              <TableCell>{getProviderLabel(event.provider_code, event.provider)}</TableCell>
                              <TableCell>
                                <Badge className={statusClassName(event.status)}>{event.status}</Badge>
                              </TableCell>
                              <TableCell>{event.attempts ?? 0}</TableCell>
                              <TableCell>{formatDate(event.received_at)}</TableCell>
                              <TableCell>{formatDate(event.next_retry_at)}</TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="outline" onClick={() => setSelectedEvent(event)}>
                                    Inspect
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                                    disabled={retryWebhookMutation.isPending}
                                    onClick={() => void retryWebhookMutation.mutateAsync(event.id)}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                    Retry
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                              {webhookEventsQuery.isLoading ? "Loading webhook events..." : "No webhook events found."}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                  <div>
                    Page {webhookEventsQuery.data?.current_page ?? webhookPage} of {webhookEventsQuery.data?.last_page ?? 1}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={!canGoBack} onClick={() => setWebhookPage((current) => Math.max(1, current - 1))}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={!canGoNext} onClick={() => setWebhookPage((current) => current + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              </section>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-emerald-600" />
              Event detail
            </CardTitle>
            <CardDescription>Raw provider payload for the selected webhook event.</CardDescription>
          </CardHeader>
          <CardContent>
            {selectedEvent ? (
              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="font-semibold text-slate-950">{selectedEvent.event_type}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {getProviderLabel(selectedEvent.provider_code, selectedEvent.provider)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className={statusClassName(selectedEvent.status)}>{selectedEvent.status}</Badge>
                    <Badge variant="outline">{selectedEvent.attempts ?? 0} attempts</Badge>
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-950 p-4 text-slate-100">
                  <div className="font-semibold">Payload</div>
                  <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-300">
                    {JSON.stringify(selectedEvent.payload ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500">
                Select a webhook event to inspect the provider payload.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function SignalCard({ icon: Icon, title, value }: { icon: typeof Building2; title: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-sm text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

export default AdminProviderOperations;
