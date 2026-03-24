import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Building2, Shield, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type { ProviderSummary, AdminTransaction, AdminUser } from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const AdminDashboard = () => {
  const { token, user } = useAuth();

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
  const activeProviders = providersPage?.data.filter((provider) => provider.status === "active") ?? [];

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
  ];

  const recentUsers = usersPage?.data.slice(0, 4) ?? [];
  const recentTransactions = transactionsPage?.data.slice(0, 4) ?? [];

  return (
    <div className="px-6 py-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-[32px] border border-white/10 bg-[#0d1a27] p-6 text-white shadow-[0_20px_60px_rgba(3,10,18,0.35)]">
            <Badge className="rounded-full bg-emerald-400 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-950 hover:bg-emerald-400">
              Live workspace
            </Badge>
            <h2 className="mt-4 text-3xl font-bold">Operations overview</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">
              A quick snapshot of user activity, providers, and transactions across the admin workspace.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                    <div className="mt-1 text-sm text-slate-600">{entry.email}</div>
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
                <div className="mt-2 text-lg font-semibold text-slate-950">{user?.email ?? "Not available"}</div>
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
    </div>
  );
};

export default AdminDashboard;
