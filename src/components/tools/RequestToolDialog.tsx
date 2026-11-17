"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, todayPlus } from "@/lib/utils";

export interface RequestTarget {
  id: string;
  name: string;
  brand: string;
  parent_code: string;
  available_units: number;
  unit_code?: string | null;
}

const QUICK_REASONS = ["Daily task on site", "Install / fastening", "Cutting / demolition", "Layout & measuring", "Safety requirement", "Replacement for broken tool"];

export function RequestToolDialog({
  target,
  projects,
  defaultProjectId,
  loanDays = 7,
  onClose,
  onSubmitted,
}: {
  target: RequestTarget | null;
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
  loanDays?: number;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [returnDate, setReturnDate] = useState(todayPlus(loanDays));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setReason("");
      setNote("");
      setErrors({});
      setReturnDate(todayPlus(loanDays));
      if (!projectId && projects[0]) setProjectId(projects[0].id);
    }
  }, [target, loanDays, projectId, projects]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    const errs: Record<string, string> = {};
    if (!projectId) errs.project = "Choose a project";
    if (reason.trim().length < 3) errs.reason = "Tell your lead what it's for (3+ characters)";
    if (!returnDate || returnDate < todayPlus(0)) errs.date = "Return date must be today or later";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("submit_tool_request", {
      p_parent_tool: target.id,
      p_project: projectId,
      p_reason: reason.trim(),
      p_expected_return: returnDate,
      p_note: note.trim() || null,
      p_unit_code: target.unit_code ?? null,
    });
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    const res = data as { request_number: string; queued: boolean; queue_position: number | null; unit_code: string | null };
    toast(
      "success",
      res.queued
        ? `${res.request_number} submitted. No unit free right now — you're #${res.queue_position} in the queue.`
        : `${res.request_number} sent to your Project Lead for approval. ${res.unit_code} is held for you.`
    );
    onSubmitted?.();
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={!!target} onClose={onClose} title={target ? `Request: ${target.name}` : "Request tool"}>
      {target && (
        <form id="request-form" onSubmit={submit} noValidate className="space-y-4">
          <div className="rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
            <div className="font-bold">{target.brand} · {target.name}</div>
            <div className="font-mono text-xs">{target.unit_code ? `Unit ${target.unit_code}` : `Parent ${target.parent_code}`}</div>
            <div className="mt-1 text-xs font-semibold">
              {target.available_units > 0 ? `${target.available_units} available — one will be held for you` : "Unavailable — your request will join the queue"}
            </div>
          </div>

          <div>
            <label htmlFor="rq-project" className="label">Project <span className="text-red-700" aria-hidden>*</span></label>
            {projects.length === 0 ? (
              <p className="field-error">You are not assigned to any project. Ask your Project Lead to add you.</p>
            ) : (
              <select id="rq-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-invalid={!!errors.project}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            {errors.project && <p className="field-error">{errors.project}</p>}
          </div>

          <div>
            <label htmlFor="rq-reason" className="label">Reason / purpose <span className="text-red-700" aria-hidden>*</span></label>
            <div className="mb-2 flex flex-wrap gap-2" aria-label="Quick reasons">
              {QUICK_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className={`chip text-xs ${reason === r ? "border-brand-yellow bg-brand-yellow text-brand-charcoal" : "border-zinc-300 dark:border-zinc-700"}`} aria-pressed={reason === r}>
                  {r}
                </button>
              ))}
            </div>
            <input id="rq-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Drilling anchors at grid B-4" aria-invalid={!!errors.reason} aria-describedby={errors.reason ? "rq-reason-err" : undefined} />
            {errors.reason && <p id="rq-reason-err" className="field-error">{errors.reason}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rq-date" className="label">Expected return <span className="text-red-700" aria-hidden>*</span></label>
              <input id="rq-date" type="date" className="input" min={todayPlus(0)} max={todayPlus(180)} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} aria-invalid={!!errors.date} />
              {errors.date && <p className="field-error">{errors.date}</p>}
            </div>
            <div>
              <span className="label" id="rq-quick-label">Quick pick</span>
              <div className="flex gap-2" role="group" aria-labelledby="rq-quick-label">
                {[1, 3, 7, 14].map((d) => (
                  <button key={d} type="button" className={`chip flex-1 justify-center ${returnDate === todayPlus(d) ? "border-brand-yellow bg-brand-yellow/30" : "border-zinc-300 dark:border-zinc-700"}`} onClick={() => setReturnDate(todayPlus(d))}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="rq-note" className="label">Note (optional)</label>
            <textarea id="rq-note" className="input min-h-[72px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything your lead should know" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" className="btn btn-outline flex-1" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-lg flex-[2]" disabled={busy || projects.length === 0}>
              {busy ? "Submitting…" : target.available_units > 0 ? "Submit request" : "Join queue"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
