import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function useAuthWait() {
  const { retryAt } = useAuth();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

export function AuthMessages() {
  const { authError, notice } = useAuth();
  const wait = useAuthWait();
  return <>
    {authError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{authError}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {wait > 0 && <p role="status" className="text-sm">Try again in {wait} seconds.</p>}
  </>;
}

function ProvisioningQr({ svg }: { svg: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    // Isolated image context; no SVG injection into the document or external QR service.
    const imageUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    setUrl(imageUrl);
    return () => URL.revokeObjectURL(imageUrl);
  }, [svg]);
  return url ? <img src={url} alt="Scan with Google Authenticator" width={240} height={240} className="rounded-xl bg-white p-2" /> : null;
}

export default function AuthCeremony() {
  const { ceremony, recoveryCodes, busy, submitProof, startRecovery, cancelCeremony, acknowledgeCodes } = useAuth();
  const wait = useAuthWait();
  const [proof, setProof] = useState("");
  const [useGrant, setUseGrant] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setProof(""); setUseGrant(false); setSaved(false); }, [ceremony, recoveryCodes]);
  const disabled = busy || wait > 0;

  if (recoveryCodes.length) return <section className="space-y-4" aria-label="Recovery codes">
    <h2 className="text-xl font-semibold">Save your recovery codes</h2>
    <p className="text-sm">These single-use codes are shown once. Store them safely away from this device. New codes replace the previous set.</p>
    <ul className="grid gap-2 rounded-xl bg-slate-100 p-4 font-mono text-sm sm:grid-cols-2">
      {recoveryCodes.map(code => <li key={code}>{code}</li>)}
    </ul>
    <Label className="flex items-center gap-2"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />I have saved my recovery codes</Label>
    <Button disabled={!saved || busy} onClick={acknowledgeCodes}>Continue</Button>
    <Button variant="outline" onClick={cancelCeremony}>Discard and restart</Button>
  </section>;
  if (!ceremony) return null;
  const action = ceremony.challenge.next_action;
  const identity = action === "enrollment_identity_required";
  const recovery = action === "recovery_required";
  const setup = action === "enrollment_ready" || action === "replacement_required";
  const totp = action === "totp_required" || action === "step_up_required" || !!ceremony.manualKey;
  const blocked = identity && (ceremony.policyPending || !ceremony.challenge.methods.includes("operator_grant"));
  const label = totp ? "Google Authenticator code" : identity || useGrant ? "Approved operator grant" : "Recovery code";
  const title = identity ? "Admin enrollment authorization" : recovery ? "Recover your authenticator"
    : setup ? "Set up Google Authenticator" : action === "step_up_complete" ? "Regenerate recovery codes" : "Verify with Google Authenticator";
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || blocked) return;
    const value = proof;
    setProof("");
    void submitProof(value, useGrant);
  };
  return <section className="space-y-4" aria-label="Authentication challenge">
    <h2 className="text-xl font-semibold">{title}</h2>
    {identity && <p className="text-sm">Admin enrollment requires independently approved operator authorization. Email verification cannot authorize Admin enrollment. Contact your established support channel to obtain an approved grant.</p>}
    {blocked && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Enrollment policy is unavailable or pending approval. An operator must enable the approved policy before you can continue.</p>}
    {recovery && <>
      <p className="text-sm">Your password and one unused recovery code authorize replacement only. Complete setup of a new authenticator to sign in. Existing sessions are revoked when recovery is authorized.</p>
      <Label className="flex items-center gap-2"><input type="checkbox" checked={useGrant} onChange={event => { setProof(""); setUseGrant(event.target.checked); }} />Use an approved replacement grant instead</Label>
    </>}
    {action === "replacement_required" && <p className="text-sm">Confirming the new authenticator revokes existing sessions and replaces your recovery codes. Keep this page open until you have saved the new codes.</p>}
    {ceremony.manualKey && <div className="space-y-3">
      <p className="text-sm">In Google Authenticator, tap +, then scan this QR code or enter the setup key. Use a time-based account. Enter its six-digit code below to confirm.</p>
      {ceremony.qrSvg && <ProvisioningQr svg={ceremony.qrSvg} />}
      <p className="text-sm">Manual setup key: <span className="break-all font-mono">{ceremony.manualKey}</span></p>
    </div>}
    {totp && <p className="text-sm">Enter the current six-digit code. If you just used a code, wait for the next code before submitting.</p>}
    <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
      {!blocked && (totp || identity || recovery) && <div className="space-y-2">
        <Label htmlFor="auth-proof">{label}</Label>
        <Input id="auth-proof" type="text" value={proof} onChange={event => setProof(totp ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value)}
          inputMode={totp ? "numeric" : "text"} pattern={totp ? "[0-9]{6}" : identity || useGrant ? "[0-9a-f]{64}" : undefined}
          maxLength={totp ? 6 : identity || useGrant ? 64 : 80} required autoComplete="off" spellCheck={false} disabled={disabled} />
      </div>}
      {!blocked && <Button type="submit" disabled={disabled || ((totp || identity || recovery) && !proof)}>
        {busy ? "Please wait…" : setup && !ceremony.manualKey ? "Show authenticator setup" : action === "step_up_complete" ? "Generate new recovery codes" : "Verify"}
      </Button>}
      <Button type="button" variant="outline" onClick={cancelCeremony}>Cancel and restart</Button>
    </form>
    {action === "totp_required" && <Button variant="link" disabled={disabled} onClick={() => void startRecovery()}>Use a recovery code</Button>}
  </section>;
}
