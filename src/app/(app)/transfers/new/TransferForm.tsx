"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanInput } from "@/components/scanner/ScanInput";
import { PhotoUpload } from "@/components/PhotoUpload";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { cn, errorMessage } from "@/lib/utils";
import type { Row } from "@/lib/queries";

const CONDS = [
  ["good", "Good"],
  ["fair", "Fair"],
  ["needs_maintenance", "Needs maintenance"],
  ["damaged", "Damaged"],
] as const;

export function TransferForm({ me, units, members, projects, initialCode, userId }: { me: { id: string; name: string }; units: Row[]; members: Row[]; projects: Row[]; initialCode: string; userId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const unit = units.find((u) => u.unit_code === code);
  const [projectId, setProjectId] = useState<string>(unit?.current_project_id ?? projects[0]?.id ?? "");
  const [toUser, setToUser] = useState("");
  const [reason, setReason] = useState("");
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const receivers = useMemo(() => {
    const seen = new Set<string>();
    return members
      .filter((m) => m.project_id === projectId && m.user && m.user.id !== (unit?.current_holder_id ?? me.id))
      .map((m) => m.user)
      .filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [members, projectId, unit, me.id]);

  function pickUnit(c: string) {
    const up = c.toUpperCase();
    setCode(up);
    const u = units.find((x) => x.unit_code === up);
    if (!u) setErrors({ code: `${up} is not a checked-out tool you can transfer.` });
    else {
      setErrors({});
      if (u.current_project_id) setProjectId(u.current_project_id);
    }
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!unit) e.code = "Scan or select the tool you are handing over";
    if (!projectId) e.project = "Choose a project";
    if (!toUser) e.to = "Choose who is receiving the tool";
    if (reason.trim().length < 3) e.reason = "Give a short reason";
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit() {
    setBusy(true);
    const { data, error } = await createClient().rpc("initiate_transfer", {
      p_code: code,
      p_to_user: toUser,
      p_project: projectId,
      p_reason: reason.trim(),
      p_condition: condition,
      p_notes: notes.trim() || null,
      p_photos: photos,
    });
    setBusy(false);
    setConfirm(false);
    if (error) return toast("error", errorMessage(error));
    const res = data as { id: string; transfer_number: string };
    toast("success", `${res.transfer_number} sent. Waiting for the receiver to confirm.`);
    router.push(`/transfers/${res.id}`);
    router.refresh();
  }

  const receiverName = receivers.find((r) => r.id === toUser)?.full_name;

  return (
    <form
      className="card card-pad space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (validate()) setConfirm(true);
      }}
    >
      <fieldset className="space-y-2">
        <legend className="label">1. Tool barcode</legend>
        {unit ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-brand-yellow bg-brand-yellow/10 p-3">
            <div>
              <div className="font-mono text-lg font-bold">{unit.unit_code}</div>
              <div className="text-sm">{unit.parent?.name} · held by {unit.current_holder_id === me.id ? "you" : unit.holder?.full_name}</div>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setCode("")}>Change</button>
          </div>
        ) : (
          <>
            <ScanInput onSubmit={pickUnit} autoFocus={false} submitLabel="Select" placeholder="Scan the tool label" />
            {units.length > 0 && (
              <div>
                <label htmlFor="tf-unit" className="sr-only">Or pick from your tools</label>
                <select id="tf-unit" className="input" value="" onChange={(e) => pickUnit(e.target.value)}>
                  <option value="">…or pick from {units.length} checked-out tool{units.length > 1 ? "s" : ""}</option>
                  {units.map((u) => <option key={u.id} value={u.unit_code}>{u.unit_code} — {u.parent?.name}{u.current_holder_id !== me.id ? ` (${u.holder?.full_name ?? "crew"})` : ""}</option>)}
                </select>
              </div>
            )}
          </>
        )}
        {errors.code && <p className="field-error">{errors.code}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="label">Current holder</span>
          <div className="input flex items-center bg-zinc-100 dark:bg-zinc-800">{unit ? (unit.current_holder_id === me.id ? `${me.name} (you)` : unit.holder?.full_name) : me.name}</div>
        </div>
        <div>
          <label htmlFor="tf-project" className="label">2. Project <span className="text-red-700">*</span></label>
          <select id="tf-project" className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setToUser(""); }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {errors.project && <p className="field-error">{errors.project}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="tf-to" className="label">3. Receiving employee <span className="text-red-700">*</span></label>
        <select id="tf-to" className="input" value={toUser} onChange={(e) => setToUser(e.target.value)} aria-invalid={!!errors.to}>
          <option value="">Select a crew member on this project…</option>
          {receivers.map((r) => <option key={r.id} value={r.id}>{r.full_name}{r.job_title ? ` — ${r.job_title}` : ""}</option>)}
        </select>
        {errors.to && <p className="field-error">{errors.to}</p>}
      </div>

      <div>
        <label htmlFor="tf-reason" className="label">4. Transfer reason <span className="text-red-700">*</span></label>
        <input id="tf-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Shift change, task handoff" aria-invalid={!!errors.reason} />
        {errors.reason && <p className="field-error">{errors.reason}</p>}
      </div>

      <fieldset>
        <legend className="label">5. Condition at transfer</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CONDS.map(([v, l]) => (
            <label key={v} className={cn("flex min-h-[48px] cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-center text-sm font-bold", condition === v ? "border-brand-charcoal bg-brand-charcoal text-brand-yellow dark:border-brand-yellow" : "border-zinc-300 dark:border-zinc-700")}>
              <input type="radio" name="cond" value={v} checked={condition === v} onChange={() => setCondition(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="tf-notes" className="label">Notes</label>
        <textarea id="tf-notes" className="input min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <PhotoUpload userId={userId} value={photos} onChange={setPhotos} />

      <button type="submit" className="btn btn-primary btn-lg w-full">Review transfer</button>

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={submit} busy={busy} title="Send this transfer?" confirmLabel="Send transfer">
        <p><span className="font-mono font-bold">{code}</span> goes to <strong>{receiverName}</strong> on {projects.find((p) => p.id === projectId)?.name}. The tool shows as <em>In Transfer</em> until they scan or confirm receipt. You remain responsible until then.</p>
      </ConfirmDialog>
    </form>
  );
}
