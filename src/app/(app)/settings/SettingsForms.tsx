"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import type { Row } from "@/lib/queries";

export function ProfileSettings({ profile }: { profile: Profile }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ full_name: profile.full_name, phone: profile.phone ?? "", job_title: profile.job_title ?? "" });
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (f.full_name.trim().length < 2) return toast("error", "Name is required");
    setBusy(true);
    const { error } = await createClient().from("profiles").update({ full_name: f.full_name.trim(), phone: f.phone.trim() || null, job_title: f.job_title.trim() || null }).eq("id", profile.id);
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    toast("success", "Profile saved");
    router.refresh();
  }
  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <div><label htmlFor="s-name" className="label">Full name</label><input id="s-name" className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
      <div><label htmlFor="s-email" className="label">E-mail</label><input id="s-email" className="input" value={profile.email} disabled /></div>
      <div><label htmlFor="s-phone" className="label">Phone</label><input id="s-phone" type="tel" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <div><label htmlFor="s-title" className="label">Job title</label><input id="s-title" className="input" value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} /></div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={busy}>Save profile</button>
        <span className="text-sm font-semibold">Theme</span><ThemeToggle className="border-2 border-zinc-300 dark:border-zinc-700" />
      </div>
    </form>
  );
}

export function PasswordSettings() {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 10) return toast("error", "Use at least 10 characters");
    if (pw !== pw2) return toast("error", "Passwords do not match");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    setPw("");
    setPw2("");
    toast("success", "Password changed");
  }
  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div><label htmlFor="pw-n" className="label">New password</label><input id="pw-n" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      <div><label htmlFor="pw-c" className="label">Confirm</label><input id="pw-c" type="password" autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
      <button className="btn btn-dark" disabled={busy}>Update</button>
    </form>
  );
}

const SETTING_FIELDS: Record<string, { label: string; type: "text" | "number" | "bool" | "select"; options?: string[] }> = {
  organization_name: { label: "Organization name", type: "text" },
  support_email: { label: "Support e-mail (login page)", type: "text" },
  reservation_hold_hours: { label: "Reservation hold (hours)", type: "number" },
  default_loan_days: { label: "Default loan period (days)", type: "number" },
  email_notifications_enabled: { label: "E-mail notifications", type: "bool" },
  label_size: { label: "Default label size", type: "select", options: ["2x1", "3x2", "4x6"] },
};

export function OrgSettings({ settings }: { settings: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const [vals, setVals] = useState<Record<string, unknown>>(Object.fromEntries(settings.map((s) => [s.key, s.value])));
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const hold = Number(vals.reservation_hold_hours);
    const loan = Number(vals.default_loan_days);
    if (!(hold >= 1 && hold <= 168)) return toast("error", "Hold hours must be between 1 and 168");
    if (!(loan >= 1 && loan <= 180)) return toast("error", "Loan days must be between 1 and 180");
    setBusy(true);
    const supabase = createClient();
    for (const s of settings) {
      if (JSON.stringify(s.value) === JSON.stringify(vals[s.key])) continue;
      const field = SETTING_FIELDS[s.key];
      const value = field?.type === "number" ? Number(vals[s.key]) : vals[s.key];
      const { error } = await supabase.from("app_settings").update({ value }).eq("key", s.key);
      if (error) {
        setBusy(false);
        return toast("error", errorMessage(error));
      }
    }
    setBusy(false);
    toast("success", "Settings saved");
    router.refresh();
  }
  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      {settings.filter((s) => SETTING_FIELDS[s.key]).map((s) => {
        const f = SETTING_FIELDS[s.key];
        const id = `set-${s.key}`;
        return (
          <div key={s.key}>
            {f.type === "bool" ? (
              <label className="flex min-h-[44px] items-center gap-2 font-semibold"><input id={id} type="checkbox" className="h-5 w-5 accent-brand-yellow" checked={!!vals[s.key]} onChange={(e) => setVals({ ...vals, [s.key]: e.target.checked })} /> {f.label}</label>
            ) : (
              <>
                <label htmlFor={id} className="label">{f.label}</label>
                {f.type === "select" ? (
                  <select id={id} className="input" value={String(vals[s.key])} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
                ) : (
                  <input id={id} type={f.type} className="input" value={String(vals[s.key] ?? "")} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />
                )}
              </>
            )}
            {s.description && <p className="help">{s.description}</p>}
          </div>
        );
      })}
      <div className="sm:col-span-2"><button className="btn btn-primary" disabled={busy}>Save settings</button></div>
    </form>
  );
}

export function CategorySettings({ categories }: { categories: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[A-Z]{2,4}$/.test(code)) return toast("error", "Code must be 2–4 capital letters (used in parent codes)");
    if (name.trim().length < 2) return toast("error", "Name is required");
    setBusy(true);
    const { error } = await createClient().from("tool_categories").insert({ name: name.trim(), code });
    setBusy(false);
    if (error) return toast("error", error.code === "23505" ? "Name or code already exists" : errorMessage(error));
    setName("");
    setCode("");
    toast("success", "Category added");
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {categories.map((c) => <li key={c.id} className="chip border-zinc-300 dark:border-zinc-700"><span className="font-mono text-xs">{c.code}</span> {c.name}</li>)}
      </ul>
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_120px_auto] sm:items-end">
        <div><label htmlFor="cat-name" className="label">New category</label><input id="cat-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pressure Washers" /></div>
        <div><label htmlFor="cat-code" className="label">Code</label><input id="cat-code" className="input font-mono uppercase" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PWS" /></div>
        <button className="btn btn-outline" disabled={busy}>Add</button>
      </form>
    </div>
  );
}
