"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ensureSessionFromUrl } from "@/lib/supabase/hash-session";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ROLE_LABEL } from "@/lib/utils";
import type { Role } from "@/lib/types";

interface Invite {
  full_name: string;
  role: Role;
  email: string;
  status: string;
  employee_code: string | null;
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "already">("loading");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [phone, setPhone] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await ensureSessionFromUrl();
      if (!res.ok) {
        setLinkError(res.error ?? null);
        return setState("invalid");
      }
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const { data: inv } = await supabase
        .from("user_invitations")
        .select("full_name, role, email, status, employee_code, project_ids")
        .eq("auth_user_id", auth.user!.id)
        .order("invited_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!inv) return setState("invalid");
      setInvite(inv as Invite);
      if (inv.project_ids?.length) {
        const { data: pm } = await supabase.from("project_members").select("project:projects(name)").eq("user_id", auth.user!.id);
        setProjects(((pm ?? []) as unknown as { project: { name: string } | null }[]).map((m) => m.project?.name ?? "").filter(Boolean));
      }
      setState(inv.status === "accepted" ? "already" : "ready");
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 10) return setError("Use at least 10 characters.");
    if (strength(pw) < 3) return setError("Mix upper- and lower-case letters, numbers and a symbol.");
    if (pw !== pw2) return setError("Passwords do not match.");
    setBusy(true);
    const supabase = createClient();
    const { error: pwErr } = await supabase.auth.updateUser({ password: pw });
    if (pwErr) {
      setBusy(false);
      return setError(pwErr.message);
    }
    const { error: accErr } = await supabase.rpc("accept_invitation");
    if (accErr) {
      setBusy(false);
      return setError(accErr.message);
    }
    if (phone.trim()) {
      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("profiles").update({ phone: phone.trim() }).eq("id", auth.user!.id);
    }
    router.replace("/dashboard");
    router.refresh();
  }

  const s = strength(pw);
  return (
    <AuthFrame title="Welcome to Tool Connected" subtitle="Your administrator invited you. Set a password to activate your account.">
      {state === "loading" && (
        <div className="flex justify-center py-8" role="status" aria-live="polite">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" aria-hidden />
          <span className="sr-only">Checking your invitation…</span>
        </div>
      )}
      {state === "invalid" && (
        <div className="space-y-3 text-center" role="alert">
          <p className="font-semibold">This invitation link is invalid, expired or was revoked.</p>
          {linkError && <p className="text-sm text-zinc-700">{linkError}</p>}
          <p className="text-sm text-zinc-700">Ask your administrator to resend the invitation. Invitation links can only be used once.</p>
          <Link href="/login" className="btn btn-outline w-full">Back to sign in</Link>
        </div>
      )}
      {state === "already" && (
        <div className="space-y-3 text-center">
          <p className="font-semibold">Your account is already active.</p>
          <Link href="/dashboard" className="btn btn-primary w-full">Go to dashboard</Link>
        </div>
      )}
      {state === "ready" && invite && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="rounded-xl border border-zinc-300 bg-white p-3 text-sm">
            <div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden /> {invite.full_name}</div>
            <div className="text-zinc-700">{invite.email}</div>
            <div className="mt-1 text-zinc-700">
              Role: <strong>{ROLE_LABEL[invite.role]}</strong>
              {invite.employee_code ? <> · Badge <span className="font-mono">{invite.employee_code}</span></> : null}
            </div>
            {projects.length > 0 && <div className="text-zinc-700">Projects: {projects.join(", ")}</div>}
          </div>
          <div>
            <label htmlFor="pw" className="label">Create password</label>
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
          <div>
            <label htmlFor="phone" className="label">Mobile phone (optional)</label>
            <input id="phone" type="tel" autoComplete="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {error && <p className="field-error !text-red-700" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg w-full" disabled={busy}>
            {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />} Activate my account
          </button>
        </form>
      )}
    </AuthFrame>
  );
}
