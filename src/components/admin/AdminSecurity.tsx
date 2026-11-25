import { useEffect, useState, type FormEvent } from "react";
import { useAuth, type SecurityIntent } from "@/contexts/AuthContext";
import { AuthFailure, type SecurityStatus } from "@/lib/admin-auth";
import AuthCeremony, { AuthMessages, useAuthWait } from "@/components/admin/AuthCeremony";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminSecurity() {
  const auth = useAuth();
  const { getSecurity, recoveryCodes, ceremony, busy, cancelCeremony, leaveSecurity, startStepUp } = auth;
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [intent, setIntent] = useState<SecurityIntent>("replace_authenticator");
  const wait = useAuthWait();
  useEffect(() => {
    if (!auth.token) return;
    let active = true;
    void getSecurity().then(result => { if (active) { setStatus(result); setError(""); } })
      .catch(failure => { if (active) setError(failure instanceof AuthFailure ? failure.message : "Security status is unavailable."); });
    return () => { active = false; };
  }, [auth.token, getSecurity, recoveryCodes.length]);
  useEffect(() => leaveSecurity, [leaveSecurity]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || wait > 0) return;
    const value = password;
    setPassword("");
    void startStepUp(value, intent);
  };
  return <Card className="mt-6 rounded-[28px] border-0 shadow-lg">
    <CardHeader><CardTitle>Authenticator security</CardTitle>
      <CardDescription>Google Authenticator is mandatory. Replacing your authenticator and regenerating recovery codes require your password and a fresh authenticator code.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {error && <p role="alert">{error}</p>}
      {status && <p className="text-sm">Authenticator: {status.enrolled ? "Enrolled" : "Unavailable"}. Recovery codes remaining: {status.recovery_codes_remaining}.</p>}
      <AuthMessages />
      {ceremony || recoveryCodes.length ? <AuthCeremony /> : <form onSubmit={submit} className="max-w-lg space-y-4">
        <div className="space-y-2"><Label htmlFor="security-intent">Security action</Label>
          <select id="security-intent" value={intent} onChange={event => setIntent(event.target.value as SecurityIntent)} disabled={busy || wait > 0} className="w-full rounded-lg border p-2">
            <option value="replace_authenticator">Replace authenticator</option>
            <option value="regenerate_recovery_codes">Regenerate recovery codes</option>
          </select></div>
        <div className="space-y-2"><Label htmlFor="security-password">Confirm password</Label>
          <Input id="security-password" type="password" autoComplete="current-password" maxLength={1024} value={password}
            onChange={event => setPassword(event.target.value)} required disabled={busy || wait > 0} /></div>
        <Button type="submit" disabled={busy || wait > 0 || !status}>{busy ? "Please wait…" : "Continue with verification"}</Button>
        {busy && <Button type="button" variant="outline" onClick={cancelCeremony}>Cancel and restart</Button>}
      </form>}
    </CardContent>
  </Card>;
}
