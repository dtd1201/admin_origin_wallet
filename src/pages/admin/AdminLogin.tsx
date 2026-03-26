import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AdminLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, verifyLogin, authError, clearAuthError, user } = useAuth();
  const [step, setStep] = useState<"credentials" | "verify">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isVerifyLoading, setIsVerifyLoading] = useState(false);

  useEffect(() => {
    clearAuthError();
    if (user) {
      navigate("/admin", { replace: true });
    }
  }, [clearAuthError, navigate, user]);

  const nextPath = typeof location.state?.from === "string" ? location.state.from : "/admin";

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsLoginLoading(true);

    try {
      const challenge = await login(email.trim(), password);
      setEmail(challenge.email || email.trim());
      setNotice(challenge.message || "Verification code sent to your email.");
      setStep("verify");
    } catch (authFailure) {
      setError(authFailure instanceof Error ? authFailure.message : "Unable to sign in.");
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleVerifySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsVerifyLoading(true);

    try {
      await verifyLogin(email.trim(), verificationCode.trim());
      navigate(nextPath, { replace: true });
    } catch (authFailure) {
      setError(authFailure instanceof Error ? authFailure.message : "Unable to verify login.");
    } finally {
      setIsVerifyLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[linear-gradient(135deg,#071018_0%,#0f2232_48%,#d9f4ec_48%,#eff7f3_100%)]">
      <div className="hidden w-[46%] flex-col justify-between bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.32),_transparent_28%),linear-gradient(180deg,#06111a_0%,#08131e_100%)] p-10 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/15">
            <img src="/logo/knt-logo.svg" alt="Origin Wallet Admin" className="h-8 w-auto brightness-0 invert" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.32em] text-emerald-200/70">Admin</div>
            <div className="text-2xl font-semibold text-white">Origin Wallet</div>
          </div>
        </div>

        <div className="max-w-xl">
          <div className="inline-flex rounded-full border border-emerald-300/25 px-4 py-1 text-xs uppercase tracking-[0.28em] text-emerald-200">
            Backoffice access
          </div>
          <h1 className="mt-6 text-5xl font-bold leading-tight text-white">
            Separate admin login,
            <br />
            same backend API.
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            Secure admin access for operations teams, with email verification and a dedicated session isolated from the user-facing app.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          {[
            { label: "Access", value: "Admin workspace" },
            { label: "Verification", value: "Email OTP" },
            { label: "Session", value: "Isolated" },
          ].map((item) => (
            <div key={item.label} className="rounded-3xl border border-white/10 bg-white/5 p-4 text-slate-300">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{item.label}</div>
              <div className="mt-2 font-semibold text-white">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-xl"
        >
          <Card className="overflow-hidden rounded-[32px] border border-white/60 bg-white/90 shadow-[0_30px_90px_rgba(8,19,30,0.24)] backdrop-blur">
            <CardHeader className="space-y-5 border-b border-slate-100 bg-white/80 px-5 py-6 sm:px-8 sm:py-8">
              <div className="space-y-2">
                <CardTitle className="text-2xl font-bold text-slate-950 sm:text-3xl">
                  {step === "credentials" ? "Admin sign in" : "Verify your admin session"}
                </CardTitle>
                <CardDescription className="break-words text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
                  {step === "credentials"
                    ? "Only accounts with admin roles can complete this sign-in flow."
                    : `Enter the verification code sent to ${email}.`}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 px-5 py-6 sm:px-8 sm:py-8">
              {(error || authError) && (
                <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error || authError}</span>
                </div>
              )}

              {notice && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  {notice}
                </div>
              )}

              {step === "credentials" ? (
                <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="h-12 rounded-2xl border-slate-200 pl-11"
                        placeholder="admin@company.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-12 rounded-2xl border-slate-200 pl-11"
                        placeholder="Enter your password"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoginLoading}
                    className="h-12 w-full rounded-2xl bg-slate-950 text-base font-semibold text-white hover:bg-slate-800"
                  >
                    {isLoginLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send verification code
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifySubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="verificationCode">Verification code</Label>
                    <div className="relative">
                      <ShieldCheck className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="verificationCode"
                        value={verificationCode}
                        onChange={(event) => setVerificationCode(event.target.value)}
                        className="h-12 rounded-2xl border-slate-200 pl-11 tracking-[0.18em] sm:tracking-[0.3em]"
                        placeholder="123456"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isVerifyLoading}
                    className="h-12 w-full rounded-2xl bg-slate-950 text-base font-semibold text-white hover:bg-slate-800"
                  >
                    {isVerifyLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify and continue
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-full rounded-2xl"
                    onClick={() => {
                      setStep("credentials");
                      setVerificationCode("");
                      setNotice("");
                      setError("");
                      clearAuthError();
                    }}
                  >
                    Back
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default AdminLogin;

