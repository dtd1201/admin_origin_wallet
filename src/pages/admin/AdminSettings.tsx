import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const AdminSettings = () => {
  const { user, refreshSession, logout } = useAuth();

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
              Session details
              <Badge className="bg-emerald-500 hover:bg-emerald-500">Admin access</Badge>
            </CardTitle>
            <CardDescription>Review your current access details and refresh the workspace session when needed.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Full name</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{user?.full_name ?? "Not available"}</div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Email</div>
              <div className="mt-2 break-all text-lg font-semibold text-slate-950">{user?.email ?? "Not available"}</div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Status</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{user?.status ?? "Not available"}</div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">KYC status</div>
              <div className="mt-2 text-lg font-semibold text-slate-950">{user?.kyc_status ?? "Not available"}</div>
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-3 pt-2">
              <Button onClick={() => void refreshSession()} className="rounded-2xl bg-slate-950 text-white hover:bg-slate-800">
                Refresh session
              </Button>
              <Button variant="outline" onClick={() => void logout()} className="rounded-2xl">
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-0 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-2xl">Workspace notes</CardTitle>
            <CardDescription>Important reminders for using the admin workspace safely.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              Admin access is restricted to approved backoffice accounts only.
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              If your session expires or becomes invalid, you will be asked to sign in again before continuing.
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              This workspace keeps its admin session separate from the customer-facing app.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminSettings;

