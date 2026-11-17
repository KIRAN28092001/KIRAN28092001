"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, ChevronLeft } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { AuthFrame } from "@/components/auth/AuthFrame";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = z.string().email().safeParse(email.trim());
    if (!ok.success) return setError("Enter a valid e-mail address");
    setBusy(true);
    setError(null);
    const site = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${site}/auth/callback?next=/reset-password` });
    setBusy(false);
    if (error && !/rate limit/i.test(error.message)) return setError(error.message);
    if (error) return setError("Too many attempts. Please wait a minute and try again.");
    setSent(true); // Same message whether or not the account exists
  }

  return (
    <AuthFrame title="Reset your password" subtitle="We'll e-mail you a secure link to choose a new password.">
      {sent ? (
        <div className="space-y-4 text-center" role="status">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" aria-hidden />
          <p className="font-semibold">If an account exists for {email}, a reset link is on its way.</p>
          <p className="text-sm text-zinc-700">The link expires in 1 hour. Check your spam folder if it doesn't arrive.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="label">E-mail</label>
            <input id="email" type="email" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "email-err" : undefined} />
            {error && <p id="email-err" className="field-error !text-red-700" role="alert">{error}</p>}
          </div>
          <button className="btn btn-primary btn-lg w-full" disabled={busy}>
            {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />} Send reset link
          </button>
        </form>
      )}
      <Link href="/login" className="mt-6 flex items-center justify-center gap-1 text-sm font-bold text-amber-800 hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Back to sign in
      </Link>
    </AuthFrame>
  );
}
