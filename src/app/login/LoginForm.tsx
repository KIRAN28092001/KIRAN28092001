"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, IdCard, Loader2, LogIn, Mail, LifeBuoy, AlertTriangle, Info } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { LogoMark } from "@/components/shell/Logo";
import { CameraScanner } from "@/components/scanner/CameraScanner";

const Schema = z.object({
  email: z.string().trim().min(1, "Enter your e-mail address").email("Enter a valid e-mail address"),
  password: z.string().min(1, "Enter your password"),
});

function setRememberCookies(remember: boolean) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  if (remember) {
    document.cookie = `tc_requires_ephemeral=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
    document.cookie = `tc_ephemeral=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  } else {
    document.cookie = `tc_requires_ephemeral=1; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
    document.cookie = `tc_ephemeral=1; Path=/; SameSite=Lax${secure}`; // session cookie
  }
}

export function LoginForm({ next, notice, supportEmail }: { next?: string; notice: string | null; supportEmail: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"email" | "badge">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [badge, setBadge] = useState("");
  const [scanning, setScanning] = useState(false);
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string; badge?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    if (mode === "email") {
      const parsed = Schema.safeParse({ email, password });
      if (!parsed.success) {
        const f = parsed.error.flatten().fieldErrors;
        setErrors({ email: f.email?.[0], password: f.password?.[0] });
        return;
      }
      setBusy(true);
      const { error } = await createClient().auth.signInWithPassword(parsed.data);
      if (error) {
        setBusy(false);
        setErrors({
          form: /invalid login/i.test(error.message)
            ? "E-mail or password is incorrect."
            : /email not confirmed/i.test(error.message)
              ? "Your e-mail is not confirmed yet. Check your inbox."
              : /fetch|network/i.test(error.message)
                ? "Can't reach the server. Check your connection and try again."
                : error.message,
        });
        return;
      }
    } else {
      if (badge.trim().length < 3) return setErrors({ badge: "Scan or type your employee ID" });
      if (!password) return setErrors({ password: "Enter your password" });
      setBusy(true);
      const res = await fetch("/api/auth/badge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: badge, password }) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setBusy(false);
        setErrors({ form: body.error ?? "Sign-in failed" });
        return;
      }
    }
    setRememberCookies(remember);
    router.replace(dest);
    router.refresh();
  }

  return (
    <div className="relative z-10 w-full max-w-[420px]">
      <div className="rounded-3xl border border-white/70 bg-brand-cream-light/95 p-6 shadow-panel ring-1 ring-black/5 backdrop-blur-md sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="rounded-2xl bg-brand-charcoal p-2 shadow-lg">
            <LogoMark className="h-12 w-12" />
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-charcoal">Tool Connected</h1>
          <p className="mt-1 text-sm font-semibold text-zinc-700">Construction Tool Inventory &amp; Tracking</p>
          <div className="mt-3 h-1 w-16 rounded-full bg-brand-yellow" aria-hidden />
        </div>

        {notice && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm font-medium text-amber-950" role="status">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {notice}
          </div>
        )}
        {errors.form && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {errors.form}
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-zinc-200/80 p-1" role="tablist" aria-label="Sign-in method">
          {(["email", "badge"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setErrors({});
              }}
              className={`flex min-h-[40px] items-center justify-center gap-2 rounded-lg text-sm font-bold transition ${mode === m ? "bg-white text-brand-charcoal shadow" : "text-zinc-700 hover:text-black"}`}
            >
              {m === "email" ? <Mail className="h-4 w-4" aria-hidden /> : <IdCard className="h-4 w-4" aria-hidden />}
              {m === "email" ? "E-mail" : "Scan Employee ID"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4 [&_.input]:border-zinc-300 [&_.input]:bg-white [&_.input]:text-zinc-900 [&_.label]:text-zinc-800">
          {mode === "email" ? (
            <div>
              <label htmlFor="email" className="label">E-mail</label>
              <input id="email" type="email" autoComplete="username" inputMode="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-err" : undefined} placeholder="you@company.com" />
              {errors.email && <p id="email-err" className="field-error !text-red-700">{errors.email}</p>}
            </div>
          ) : (
            <div>
              <label htmlFor="badge" className="label">Employee ID</label>
              <div className="flex gap-2">
                <input id="badge" className="input font-mono uppercase" autoComplete="off" value={badge} onChange={(e) => setBadge(e.target.value.toUpperCase())} placeholder="EMP-1001" aria-invalid={!!errors.badge} aria-describedby={errors.badge ? "badge-err" : "badge-help"} />
                <button type="button" className="btn btn-dark shrink-0" onClick={() => setScanning((s) => !s)} aria-pressed={scanning}>
                  <IdCard className="h-5 w-5" aria-hidden /> {scanning ? "Stop" : "Scan"}
                </button>
              </div>
              {errors.badge ? <p id="badge-err" className="field-error !text-red-700">{errors.badge}</p> : <p id="badge-help" className="help !text-zinc-600">Scan the barcode on your ID badge, or type it.</p>}
              {scanning && (
                <div className="mt-3">
                  <CameraScanner
                    active={scanning}
                    onDetected={(code) => {
                      setBadge(code.toUpperCase());
                      setScanning(false);
                      document.getElementById("password")?.focus();
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="password" className="label">Password</label>
            <div className="relative">
              <input id="password" type={show ? "text" : "password"} autoComplete="current-password" className="input pr-14" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-err" : undefined} />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-zinc-600 hover:text-black" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
                {show ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
              </button>
            </div>
            {errors.password && <p id="password-err" className="field-error !text-red-700">{errors.password}</p>}
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-semibold text-zinc-800">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-5 w-5 rounded border-zinc-400 accent-brand-yellow" />
              Remember me
            </label>
            <Link href="/forgot-password" className="text-sm font-bold text-amber-800 underline-offset-2 hover:underline">
              Forgot password?
            </Link>
          </div>

          <button type="submit" className="btn btn-primary btn-lg w-full text-lg shadow-md" disabled={busy} aria-busy={busy}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <LogIn className="h-5 w-5" aria-hidden />}
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-sm text-zinc-700">
          <LifeBuoy className="h-4 w-4" aria-hidden />
          Need access?{" "}
          <a href={`mailto:${supportEmail}?subject=Tool%20Connected%20account%20support`} className="font-bold text-amber-800 underline-offset-2 hover:underline">
            Contact your administrator
          </a>
        </p>
      </div>
    </div>
  );
}
