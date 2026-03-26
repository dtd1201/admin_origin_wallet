import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRightLeft, Building2, ExternalLink, Shield, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type {
  AdminIntegrationLinkUpsertResponse,
  AdminTransaction,
  AdminUser,
  AdminUserIntegrationLinksResponse,
  ProviderSummary,
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
import { useToast } from "@/hooks/use-toast";

const formatRequestDate = (value?: string | null) => {
  if (!value) {
    return "Date unavailable";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
};

type PendingRequestSummary = {
  id: number | string;
  requestId: number | null;
  userId: number;
  userName: string;
  userEmail: string;
  providerCode: string;
  providerName: string;
  status: string;
  note: string | null;
  requestedAt: string | null;
};

type ReviewFormState = {
  linkUrl: string;
  linkLabel: string;
};

const emptyReviewForm: ReviewFormState = {
  linkUrl: "",
  linkLabel: "",
};

const AdminDashboard = () => {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<PendingRequestSummary | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewFormState>(emptyReviewForm);
  const [reviewError, setReviewError] = useState("");

  const usersQuery = useQuery({
    queryKey: ["admin", "users", token],
    enabled: !!token,
    queryFn: async () => requestApi<PaginatedResponse<AdminUser>>(adminEndpointConfig.users, { method: "GET", token }),
  });

  const providersQuery = useQuery({
    queryKey: ["admin", "providers", token],
    enabled: !!token,
    queryFn: async () =>
      requestApi<PaginatedResponse<ProviderSummary>>(adminEndpointConfig.providers, { method: "GET", token }),
  });

  const transactionsQuery = useQuery({
    queryKey: ["admin", "transactions", token],
    enabled: !!token,
    queryFn: async () =>
      requestApi<PaginatedResponse<AdminTransaction>>(adminEndpointConfig.transactions, { method: "GET", token }),
  });

  const usersPage = usersQuery.data;
  const providersPage = providersQuery.data;
  const transactionsPage = transactionsQuery.data;
  const userRows = usersPage?.data ?? [];
  const activeProviders = providersPage?.data.filter((provider) => provider.status === "active") ?? [];
  const integrationRequestQueries = useQueries({
    queries: userRows.map((entry) => ({
      queryKey: ["admin", "dashboard", "user-integration-links", entry.id, token],
      enabled: !!token,
      queryFn: async () =>
        requestApi<AdminUserIntegrationLinksResponse>(`${adminEndpointConfig.users}/${entry.id}/integration-links`, {
          method: "GET",
          token,
        }),
    })),
  });

  const pendingRequests = integrationRequestQueries
    .flatMap((query, index) => {
      const currentUser = userRows[index];

      if (!currentUser || !query.data) {
        return [] as PendingRequestSummary[];
      }

      return query.data.data
        .filter((slot) => slot.integration_request?.status?.toLowerCase() === "pending")
        .map((slot) => ({
          id: slot.integration_request?.id ?? `${currentUser.id}-${slot.provider.code}`,
          requestId: slot.integration_request?.id ?? null,
          userId: currentUser.id,
          userName: currentUser.full_name,
          userEmail: currentUser.email,
          providerCode: slot.provider.code,
          providerName: slot.provider.name,
          status: slot.integration_request?.status ?? "pending",
          note: slot.integration_request?.note ?? null,
          requestedAt: slot.integration_request?.requested_at ?? slot.integration_request?.created_at ?? null,
        }));
    })
    .sort((left, right) => {
      const leftTime = left.requestedAt ? new Date(left.requestedAt).getTime() : 0;
      const rightTime = right.requestedAt ? new Date(right.requestedAt).getTime() : 0;
      return rightTime - leftTime;
    });

  const pendingRequestsLoading =
    usersQuery.isLoading || (userRows.length > 0 && integrationRequestQueries.some((query) => query.isLoading));

  const selectedUserIntegrationLinksQuery = useQuery({
    queryKey: ["admin", "dashboard", "selected-user-integration-links", selectedRequest?.userId, token],
    enabled: !!token && selectedRequest !== null,
    queryFn: async () =>
      requestApi<AdminUserIntegrationLinksResponse>(`${adminEndpointConfig.users}/${selectedRequest?.userId}/integration-links`, {
        method: "GET",
        token,
      }),
  });

  useEffect(() => {
    if (!selectedRequest) {
      setReviewForm(emptyReviewForm);
      setReviewError("");
      return;
    }

    const currentSlot = selectedUserIntegrationLinksQuery.data?.data.find(
      (slot) => slot.provider.code === selectedRequest.providerCode,
    );

    setReviewForm({
      linkUrl: currentSlot?.integration_link?.link_url ?? "",
      linkLabel: currentSlot?.integration_link?.link_label ?? `Connect ${selectedRequest.providerName}`,
    });
    setReviewError("");
  }, [selectedRequest, selectedUserIntegrationLinksQuery.data]);

  const confirmRequestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest) {
        throw new Error("Request details are still loading.");
      }

      return requestApi<AdminIntegrationLinkUpsertResponse>(
        `${adminEndpointConfig.users}/${selectedRequest.userId}/integration-links/${encodeURIComponent(selectedRequest.providerCode)}`,
        {
          method: "PUT",
          token,
          body: {
            link_url: reviewForm.linkUrl.trim(),
            link_label: reviewForm.linkLabel.trim() || `Connect ${selectedRequest.providerName}`,
            is_active: true,
          },
        },
      );
    },
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      if (selectedRequest) {
        await queryClient.invalidateQueries({
          queryKey: ["admin", "dashboard", "user-integration-links", selectedRequest.userId],
        });
        await queryClient.invalidateQueries({
          queryKey: ["admin", "dashboard", "selected-user-integration-links", selectedRequest.userId],
        });
      }
      toast({
        title: "Request confirmed",
        description: payload.message || `${payload.provider.name} connection is now available for this user.`,
      });
      setSelectedRequest(null);
      setReviewForm(emptyReviewForm);
      setReviewError("");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to confirm this request.";
      setReviewError(message);
      toast({
        variant: "destructive",
        title: "Request confirmation failed",
        description: message,
      });
    },
  });

  const cards = [
    {
      title: "Admin session",
      value: user?.roles?.length ? `${user.roles.length} role${user.roles.length > 1 ? "s" : ""}` : "Authenticated",
      description: "Your admin session is active and ready for operational work.",
      icon: Shield,
    },
    {
      title: "Users",
      value: usersPage?.total ?? 0,
      description: "Customer accounts currently available for review in the backoffice.",
      icon: Users,
    },
    {
      title: "Providers",
      value: activeProviders.length,
      description: "Integration partners currently active in the workspace.",
      icon: Building2,
    },
    {
      title: "Transactions",
      value: transactionsPage?.total ?? 0,
      description: "Transfer and payment activity available for review and follow-up.",
      icon: ArrowRightLeft,
    },
    {
      title: "Pending requests",
      value: pendingRequests.length,
      description: "Provider connection requests waiting for an admin review.",
      icon: AlertCircle,
    },
  ];

  const recentUsers = userRows.slice(0, 4);
  const recentTransactions = transactionsPage?.data.slice(0, 4) ?? [];
  const isReviewLoading = selectedRequest !== null && selectedUserIntegrationLinksQuery.isLoading;

  const handleSelectRequest = (request: PendingRequestSummary) => {
    setSelectedRequest(request);
    setReviewError("");
  };

  const handleConfirmRequest = async () => {
    if (!reviewForm.linkUrl.trim()) {
      setReviewError("Link URL is required before confirming this request.");
      return;
    }

    await confirmRequestMutation.mutateAsync();
  };

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-[32px] border border-white/10 bg-[#0d1a27] p-6 text-white shadow-[0_20px_60px_rgba(3,10,18,0.35)]">
            <Badge className="rounded-full bg-emerald-400 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-950 hover:bg-emerald-400">
              Live workspace
            </Badge>
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">Operations overview</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">
              A quick snapshot of user activity, providers, and transactions across the admin workspace.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {cards.map((card) => (
                <div key={card.title} className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/15">
                    <card.icon className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div className="mt-4 text-sm text-slate-400">{card.title}</div>
                  <div className="mt-1 text-2xl font-semibold text-white">{card.value}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">{card.description}</div>
                </div>
              ))}
            </div>
          </section>

          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Recent users</CardTitle>
              <CardDescription>The latest customer accounts visible in the workspace.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {recentUsers.length ? (
                recentUsers.map((entry) => (
                  <div key={entry.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">User #{entry.id}</div>
                    <div className="mt-2 text-lg font-semibold text-slate-950">{entry.full_name}</div>
                    <div className="mt-1 break-all text-sm text-slate-600">{entry.email}</div>
                    <div className="mt-3 flex gap-2">
                      <Badge variant="secondary">{entry.status}</Badge>
                      <Badge variant="outline">KYC {entry.kyc_status}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-sm leading-6 text-slate-500 md:col-span-2">
                  {usersQuery.isLoading ? "Loading users..." : "No users are available right now."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Pending integration requests</CardTitle>
              <CardDescription>
                Click a request to review it and confirm the provider connection without leaving the dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingRequests.length ? (
                pendingRequests.slice(0, 5).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleSelectRequest(entry)}
                    className="block w-full rounded-3xl border border-amber-200 bg-amber-50 p-5 text-left transition hover:border-amber-300 hover:bg-amber-100/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">{entry.providerName}</div>
                        <div className="break-words text-sm text-slate-600">{entry.userName} - {entry.userEmail}
                        </div>
                      </div>
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500">{entry.status}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                      <span>User #{entry.userId}</span>
                      <span>{entry.providerCode}</span>
                      <span>Requested {formatRequestDate(entry.requestedAt)}</span>
                    </div>
                    {entry.note && (
                      <div className="mt-3 rounded-2xl border border-amber-300/80 bg-white/70 p-3 text-sm text-slate-700">
                        {entry.note}
                      </div>
                    )}
                    <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-900">
                      Review and confirm
                      <ExternalLink className="h-4 w-4" />
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-sm leading-6 text-slate-500">
                  {pendingRequestsLoading ? "Loading integration requests..." : "No pending integration requests are visible right now."}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Signed-in admin</CardTitle>
              <CardDescription>Your current access details for this workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-700">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Full name</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{user?.full_name ?? "Not available"}</div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Email</div>
                <div className="mt-2 break-all text-lg font-semibold text-slate-950">{user?.email ?? "Not available"}</div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Roles</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {user?.roles?.length ? (
                    user.roles.map((role, index) => {
                      const label = typeof role === "string" ? role : role.role_code || `role-${index + 1}`;
                      return <Badge key={`${label}-${index}`}>{label}</Badge>;
                    })
                  ) : (
                    <span className="text-slate-500">No roles returned</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Recent transactions</CardTitle>
              <CardDescription>The latest activity currently visible to your admin team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentTransactions.length ? (
                recentTransactions.map((entry) => (
                  <div key={entry.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">{entry.transfer_no || `Transaction #${entry.id}`}</div>
                        <div className="text-sm text-slate-500">User #{entry.user_id}</div>
                      </div>
                      <Badge variant="secondary">{entry.status}</Badge>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">
                      {entry.source_amount ?? "-"} {entry.source_currency ?? ""}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-sm leading-6 text-slate-500">
                  {transactionsQuery.isLoading ? "Loading transactions..." : "No transactions are available right now."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={selectedRequest !== null} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="rounded-[28px] border-slate-200 bg-white text-slate-950 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review integration request</DialogTitle>
            <DialogDescription>
              Review the customer request and confirm the provider connection directly from the admin dashboard.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="grid gap-5 py-2">
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-950">{selectedRequest.providerName}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      {selectedRequest.userName} - {selectedRequest.userEmail}
                    </div>
                  </div>
                  <Badge className="bg-amber-500 text-white hover:bg-amber-500">{selectedRequest.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                  <span>User #{selectedRequest.userId}</span>
                  <span>{selectedRequest.providerCode}</span>
                  <span>Requested {formatRequestDate(selectedRequest.requestedAt)}</span>
                </div>
                {selectedRequest.note && (
                  <div className="mt-3 rounded-2xl border border-amber-300/80 bg-white/80 p-3 text-sm text-slate-700">
                    {selectedRequest.note}
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="request-link-url">Link URL</Label>
                  <Input
                    id="request-link-url"
                    value={reviewForm.linkUrl}
                    onChange={(event) => setReviewForm((current) => ({ ...current, linkUrl: event.target.value }))}
                    placeholder="https://provider.example.com/connect/user-123"
                    disabled={isReviewLoading || confirmRequestMutation.isPending}
                  />
                </div>

                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="request-link-label">Button label</Label>
                  <Input
                    id="request-link-label"
                    value={reviewForm.linkLabel}
                    onChange={(event) => setReviewForm((current) => ({ ...current, linkLabel: event.target.value }))}
                    placeholder={`Connect ${selectedRequest.providerName}`}
                    disabled={isReviewLoading || confirmRequestMutation.isPending}
                  />
                </div>
              </div>

              {isReviewLoading && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Loading request details...
                </div>
              )}

              {reviewError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{reviewError}</div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRequest(null)} disabled={confirmRequestMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleConfirmRequest()}
              disabled={isReviewLoading || confirmRequestMutation.isPending}
              className="bg-slate-950 text-white hover:bg-slate-800"
            >
              {confirmRequestMutation.isPending ? "Confirming..." : "Confirm request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;


