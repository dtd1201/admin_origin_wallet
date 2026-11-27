import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function useAuthWait(until = 0) {
  const { retryAt } = useAuth();
  const deadline = Math.max(retryAt, until);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (deadline <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
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
  const { ceremony, recoveryCodes, busy, submitProof, startRecovery, requestEmailMfa, backToTotp, resendIdentity, cancelCeremony, acknowledgeCodes } = useAuth();
  const wait = useAuthWait();
  const resendWait = useAuthWait(ceremony?.resendAt);
  const [proof, setProof] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setProof(""); setSaved(false); }, [ceremony, recoveryCodes]);
  const disabled = busy || wait > 0;

  if (recoveryCodes.length) return <section className="space-y-4" aria-label="Recovery codes">
    <h2 className="text-xl font-semibold">Save your recovery codes</h2>
    <p className="text-sm">Copy all 10 single-use codes into a private password manager or save them offline, away from this device. They are shown once and cannot be retrieved later. New codes replace the previous set.</p>
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
  const emailMfa = action === "totp_required" && !!ceremony.emailMfa;
  const totp = (action === "totp_required" && !emailMfa) || action === "step_up_required" || !!ceremony.manualKey;
  const emailProof = identity && ceremony.challenge.methods.includes("enrollment_email_proof");
  const blocked = identity && (ceremony.supportRequired || !emailProof);
  const numeric = totp || emailProof || emailMfa;
  const label = emailMfa ? "Enter email verification code" : totp ? "Google Authenticator code" : identity ? "Enrollment email code" : "Recovery code";
  const title = emailMfa ? "Enter email verification code" : identity ? "Verify email ownership" : recovery ? "Recover your authenticator"
    : setup ? "Set up Google Authenticator" : action === "step_up_complete" ? "Regenerate recovery codes" : "Verify with Google Authenticator";
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || blocked) return;
    const value = proof;
    setProof("");
    void submitProof(value);
  };
  return <section className="space-y-4" aria-label="Authentication challenge">
    <h2 className="text-xl font-semibold">{title}</h2>
    {emailMfa && <p role="status" className="text-sm">Code sent to {ceremony.maskedRecipient}</p>}
    {emailProof && <p className="text-sm">Enter the six-digit enrollment code sent to your established account email. It authorizes authenticator setup only. Future sign-ins require Google Authenticator.</p>}
    {blocked && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">We cannot safely verify an established email ownership channel, or a security hold applies. Contact your established Origin Wallet support channel. Password reset cannot authorize authenticator enrollment.</p>}
    {recovery && <>
      <p className="text-sm">Your password and one unused recovery code authorize replacement only. Complete setup of a new authenticator to sign in. Existing sessions are revoked when recovery is authorized.</p>
      <p className="text-sm">If both your authenticator and recovery codes are lost, contact your established support channel. Automatic email-only recovery is unavailable.</p>
    </>}
    {action === "replacement_required" && <p className="text-sm">Confirming the new authenticator revokes existing sessions and replaces your recovery codes. Keep this page open until you have saved the new codes.</p>}
    {ceremony.manualKey && <div className="space-y-3">
      <p className="text-sm">In Google Authenticator, tap +, then scan this QR code or enter the setup key. Use a time-based account. Enter its six-digit code below to confirm.</p>
      {ceremony.qrSvg && <ProvisioningQr svg={ceremony.qrSvg} />}
      <p className="text-sm">Manual setup key: <span className="break-all font-mono">{ceremony.manualKey}</span></p>
    </div>}
    {totp && <p className="text-sm">Enter the current six-digit code. If you just used a code, wait for the next code before submitting.</p>}
    <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
      {!blocked && (totp || identity || recovery || emailMfa) && <div className="space-y-2">
        <Label htmlFor="auth-proof">{label}</Label>
        <Input id="auth-proof" type="text" value={proof} onChange={event => setProof(numeric ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value)}
          inputMode={numeric ? "numeric" : "text"} pattern={numeric ? "[0-9]{6}" : undefined}
          maxLength={numeric ? 6 : 80} required autoComplete="off" spellCheck={false} disabled={disabled} />
      </div>}
      {!blocked && <Button type="submit" disabled={disabled || ((totp || identity || recovery || emailMfa) && !proof)}>
        {busy ? "Please wait…" : emailMfa ? "Verify & Sign in" : setup && !ceremony.manualKey ? "Show authenticator setup" : action === "step_up_complete" ? "Generate new recovery codes" : "Verify"}
      </Button>}
      <Button type="button" variant="outline" onClick={cancelCeremony}>Cancel and restart</Button>
    </form>
    {action === "totp_required" && ceremony.challenge.methods.includes("email_otp") && !emailMfa
      && <Button type="button" variant="outline" disabled={disabled} onClick={() => void requestEmailMfa()}>Receive OTP via Email</Button>}
    {emailMfa && <div className="space-y-2">
      <Button type="button" variant="outline" disabled={disabled || resendWait > 0} onClick={() => void requestEmailMfa(true)}>Resend code</Button>
      {resendWait > 0 && <p role="status" className="text-sm">Resend available in {resendWait} seconds.</p>}
      <Button type="button" variant="link" disabled={disabled} onClick={backToTotp}>Back to Google Authenticator</Button>
    </div>}
    {emailProof && !blocked && <Button type="button" variant="outline" disabled={disabled || resendWait > 0} onClick={() => void resendIdentity()}>
      {resendWait > 0 ? `Resend enrollment code in ${resendWait} seconds` : "Resend enrollment code"}
    </Button>}
    {action === "totp_required" && !emailMfa && <Button variant="link" disabled={disabled} onClick={() => void startRecovery()}>Use a recovery code</Button>}
  </section>;
}
