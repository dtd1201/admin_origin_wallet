import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Clock3, ReceiptText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { adminEndpointConfig, requestApi, type PaginatedResponse } from "@/lib/api";
import type { AdminTransaction } from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const AdminTransactions = () => {
  const { token } = useAuth();
  const transactionsQuery = useQuery({
    queryKey: ["admin", "transactions", token],
    enabled: !!token,
    queryFn: async () =>
      requestApi<PaginatedResponse<AdminTransaction>>(adminEndpointConfig.transactions, { method: "GET", token }),
  });

  const rows = transactionsQuery.data?.data ?? [];

  return (
    <div className="px-6 py-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-2xl">Transactions review</CardTitle>
            <CardDescription>Monitor transfer activity and track current processing states.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>User / Provider</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">{row.transfer_no || `Transaction #${row.id}`}</div>
                        <div className="text-xs text-slate-500">{row.created_at || row.submitted_at || "No timestamp"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-slate-900">User #{row.user_id}</div>
                        <div className="text-xs text-slate-500">Provider #{row.provider_id}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {row.source_amount || "-"} {row.source_currency || ""}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.target_amount || "-"} {row.target_currency || ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-12 text-center text-slate-500">
                      {transactionsQuery.isLoading ? "Loading transactions..." : "No transactions are available right now."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <CardHeader>
              <CardTitle>Queue signals</CardTitle>
              <CardDescription>A quick summary of the current transaction queue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  icon: ArrowRightLeft,
                  title: "Total rows",
                  description: String(transactionsQuery.data?.total ?? 0),
                },
                {
                  icon: Clock3,
                  title: "Pending",
                  description: String(rows.filter((row) => row.status === "pending").length),
                },
                {
                  icon: ReceiptText,
                  title: "Completed",
                  description: String(rows.filter((row) => row.status === "completed").length),
                },
              ].map((item) => (
                <div key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-lg font-semibold text-slate-950">{item.title}</div>
                  <div className="mt-2 text-sm leading-7 text-slate-600">{item.description}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminTransactions;
