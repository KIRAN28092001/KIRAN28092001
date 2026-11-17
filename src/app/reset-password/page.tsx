"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthFrame } from "@/components/auth/AuthFrame";

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // Recovery links arrive via /auth/callback (code), /auth/confirm (token hash) or a URL hash (implicit).
    const { data: sub } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getUser().then(({ data }: { data: { user: unknown } }) => setReady(!!data.user));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 10) return setError("Use at least 10 characters.");
    if (strength(pw) < 3) return setError("Mix upper- and lower-case letters, numbers and a symbol.");
    if (pw !== pw2) return setError("Passwords do not match.");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    await supabase.auth.signOut();
    router.replace("/login?reset=1");
  }

  const s = strength(pw);
  return (
    <AuthFrame title="Choose a new password" subtitle="Use something you don't use on other sites.">
      {ready === false ? (
        <div className="space-y-3 text-center" role="alert">
          <p className="font-semibold">This reset link is invalid or has expired.</p>
          <Link href="/forgot-password" className="btn btn-primary w-full">Request a new link</Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label htmlFor="pw" className="label">New password</label>
            <div className="relative">
              <input id="pw" type={show ? "text" : "password"} autoComplete="new-password" className="input pr-14" value={pw} onChange={(e) => setPw(e.target.value)} aria-describedby="pw-strength" />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-zinc-600" aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <div id="pw-strength" className="mt-2 flex items-center gap-2" aria-live="polite">
              <div className="flex flex-1 gap-1" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${i < s ? (s >= 3 ? "bg-emerald-600" : "bg-amber-500") : "bg-zinc-300"}`} />
                ))}
              </div>
              <span className="text-xs font-semibold text-zinc-700">{["Too weak", "Weak", "Fair", "Good", "Strong"][s]}</span>
            </div>
          </div>
          <div>
            <label htmlFor="pw2" className="label">Confirm password</label>
            <input id="pw2" type={show ? "text" : "password"} autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          {error && <p className="field-error !text-red-700" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg w-full" disabled={busy || ready === null}>
            {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />} Update password
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
