import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AuthCeremony, { AuthMessages, useAuthWait } from "@/components/admin/AuthCeremony";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const adminDestination = (value: unknown) => {
  if (typeof value !== "string") return "/admin";
  try {
    const destination = new URL(value, window.location.origin);
    return destination.origin === window.location.origin && destination.pathname !== "/admin/login"
      && (destination.pathname === "/admin" || destination.pathname.startsWith("/admin/"))
      ? destination.pathname : "/admin";
  } catch { return "/admin"; }
};

const AdminLogin = () => {
  const auth = useAuth();
  const { user, loading, login, busy, ceremony, recoveryCodes, cancelCeremony, assistedRecovery } = auth;
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const wait = useAuthWait();
  const nextPath = adminDestination(location.state?.from);
  useEffect(() => {
    if (user && !recoveryCodes.length) navigate(nextPath, { replace: true });
  }, [navigate, nextPath, recoveryCodes.length, user]);
  useEffect(() => () => cancelCeremony(), [cancelCeremony]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || loading || wait > 0) return;
    const value = password;
    setPassword("");
    void login(email.trim(), value);
  };
  return <div className="flex min-h-screen items-center justify-center bg-[#08131e] px-4 py-10">
    <Card className="w-full max-w-xl rounded-[28px] border-white/10 bg-white shadow-xl">
      <CardHeader className="space-y-3">
        <ShieldCheck className="h-9 w-9 text-emerald-600" />
        <CardTitle className="text-2xl">Origin Wallet Admin</CardTitle>
        <CardDescription>Sign in with your email, password and mandatory Google Authenticator verification.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <AuthMessages />
        {loading ? <p role="status">Validating Admin session…</p> : ceremony || recoveryCodes.length
          ? <AuthCeremony />
          : <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="admin-email">Email</Label>
              <Input id="admin-email" type="email" autoComplete="username" maxLength={255} required
                value={email} onChange={event => setEmail(event.target.value)} disabled={busy || wait > 0} /></div>
            <div className="space-y-2"><Label htmlFor="admin-password">Password</Label>
              <Input id="admin-password" type="password" autoComplete="current-password" maxLength={1024} required
                value={password} onChange={event => setPassword(event.target.value)} disabled={busy || wait > 0} /></div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy || wait > 0}>
              {busy ? "Please wait…" : "Sign in"}
            </Button>
            {busy && <Button type="button" variant="outline" onClick={cancelCeremony}>Cancel and restart</Button>}
          </form>}
        {!loading && !recoveryCodes.length && <div className="space-y-2 border-t pt-4">
          <p className="text-sm text-slate-600">Lost access to your authenticator and recovery codes? Record an assisted recovery request, then contact your established support channel.</p>
          <p className="text-sm text-slate-600">Resetting your password does not remove the authenticator requirement.</p>
          <Label htmlFor="recovery-email">Recovery email</Label>
          <Input id="recovery-email" type="email" maxLength={255} value={email} onChange={event => setEmail(event.target.value)}
            disabled={busy || wait > 0} autoComplete="username" />
          <Button type="button" variant="outline" disabled={busy || wait > 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
            onClick={() => void assistedRecovery(email.trim())}>Request assisted recovery</Button>
        </div>}
      </CardContent>
    </Card>
  </div>;
};
export default AdminLogin;
