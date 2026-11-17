"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, PackageCheck, PackagePlus, RotateCcw, Search } from "lucide-react";
import { ScanInput } from "@/components/scanner/ScanInput";
import { ToolImage } from "@/components/ToolImage";
import { ToolStatusBadge, ConditionBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { PhotoUpload } from "@/components/PhotoUpload";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { cn, errorMessage, todayPlus } from "@/lib/utils";
import type { Role, ReturnCondition } from "@/lib/types";
import type { Row } from "@/lib/queries";

type Mode = "collect" | "return" | "issue" | "receive" | "lookup";

const MODES: { key: Mode; label: string; icon: typeof PackageCheck; hint: string; staffOnly?: boolean }[] = [
  { key: "collect", label: "Collect", icon: PackageCheck, hint: "Scan the exact unit reserved for an approved request to check it out." },
  { key: "return", label: "Return", icon: RotateCcw, hint: "Scan a checked-out unit to check it back in and record its condition." },
  { key: "receive", label: "Receive transfer", icon: ArrowLeftRight, hint: "Scan a tool being handed to you to acknowledge the transfer." },
  { key: "issue", label: "Issue", icon: PackagePlus, hint: "Walk-up checkout: issue an available unit directly to an employee.", staffOnly: true },
  { key: "lookup", label: "Look up", icon: Search, hint: "Scan any label to open its full history." },
];

const UNIT_SELECT =
  "id, unit_code, status, condition, current_holder_id, current_project_id, reserved_for_request_id, reserved_until, location, parent:parent_tools(id, name, brand, image_url, parent_code), holder:profiles!tool_units_current_holder_id_fkey(full_name), project:projects!tool_units_current_project_id_fkey(id, name)";

const CONDITIONS: { v: ReturnCondition; label: string; cls: string }[] = [
  { v: "good", label: "Good", cls: "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100" },
  { v: "needs_maintenance", label: "Needs Maintenance", cls: "border-orange-500 bg-orange-50 text-orange-950 dark:bg-orange-950/40 dark:text-orange-100" },
  { v: "damaged", label: "Damaged", cls: "border-red-600 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100" },
  { v: "missing", label: "Missing", cls: "border-red-800 bg-red-100 text-red-950 dark:bg-red-950/60 dark:text-red-100" },
];

export function ScannerConsole({
  userId,
  role,
  initialMode,
  requestId,
  initialCode,
  projects,
  people,
  loanDays,
}: {
  userId: string;
  role: Role;
  initialMode: Mode;
  requestId: string | null;
  initialCode: string | null;
  projects: Row[];
  people: Row[];
  loanDays: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [unit, setUnit] = useState<Row | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<{ title: string; detail: string; href?: string } | null>(null);
  const [transfer, setTransfer] = useState<Row | null>(null);
  // return form
  const [condition, setCondition] = useState<ReturnCondition>("good");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  // issue form
  const [holder, setHolder] = useState("");
  const [project, setProject] = useState(projects[0]?.id ?? "");
  const [due, setDue] = useState(todayPlus(loanDays));

  const modes = MODES.filter((m) => !m.staffOnly || role !== "labor");
  const current = modes.find((m) => m.key === mode) ?? modes[0];

  function reset() {
    setUnit(null);
    setLookupError(null);
    setDone(null);
    setTransfer(null);
    setCondition("good");
    setNotes("");
    setPhotos([]);
  }

  const lookup = useCallback(
    async (raw: string) => {
      reset();
      const code = raw.trim().toUpperCase();
      const supabase = createClient();
      const { data } = await supabase.from("tool_units").select(UNIT_SELECT).eq("unit_code", code).maybeSingle();
      if (!data) {
        const { data: parent } = await supabase.from("parent_tools").select("id, name").eq("parent_code", code).maybeSingle();
        setLookupError(parent ? `${code} is the parent label for “${parent.name}”. Scan the individual unit label (e.g. ${code}-01).` : `No tool found for barcode “${code}”. Check the label and try again.`);
        return;
      }
      setUnit(data);
      if (mode === "lookup") {
        router.push(`/units/${data.id}`);
        return;
      }
      if (mode === "receive") {
        const { data: t } = await supabase
          .from("transfers")
          .select("id, transfer_number, reason, condition_at_transfer, from_user:profiles!transfers_from_user_id_fkey(full_name)")
          .eq("unit_id", data.id)
          .eq("to_user_id", userId)
          .eq("status", "pending_acknowledgment")
          .maybeSingle();
        setTransfer(t);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, userId, router]
  );

  useEffect(() => {
    if (initialCode) lookup(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const problem: string | null = !unit
    ? null
    : mode === "collect"
      ? unit.status === "reserved" || unit.status === "available"
        ? null
        : `This unit is ${unit.status.replace(/_/g, " ")} and can't be collected.`
      : mode === "return"
        ? unit.status === "checked_out"
          ? role === "labor" && unit.current_holder_id !== userId
            ? "This tool is checked out to someone else. Only the holder, a Project Lead or Inventory can return it."
            : null
          : unit.status === "in_transfer"
            ? "This tool has a pending transfer. Complete or cancel the transfer first."
            : `This unit is ${unit.status.replace(/_/g, " ")}, not checked out.`
        : mode === "issue"
          ? unit.status === "available"
            ? null
            : `Only available units can be issued (this one is ${unit.status.replace(/_/g, " ")}).`
          : mode === "receive"
            ? transfer
              ? null
              : "There is no pending transfer of this unit to you."
            : null;

  async function execute() {
    if (!unit) return;
    setBusy(true);
    const supabase = createClient();
    let res: { data: unknown; error: unknown };
    if (mode === "collect") res = await supabase.rpc("checkout_scan", { p_code: unit.unit_code, p_request: requestId });
    else if (mode === "return") res = await supabase.rpc("return_tool", { p_code: unit.unit_code, p_condition: condition, p_notes: notes.trim() || null, p_photos: photos });
    else if (mode === "issue") res = await supabase.rpc("direct_checkout", { p_code: unit.unit_code, p_holder: holder, p_project: project, p_expected_return: due, p_note: notes.trim() || null });
    else res = await supabase.rpc("acknowledge_transfer", { p_transfer: transfer!.id, p_accept: true, p_scanned_code: unit.unit_code, p_comment: notes.trim() || null });
    setBusy(false);
    setConfirm(false);
    if (res.error) {
      toast("error", errorMessage(res.error));
      return;
    }
    const d = (res.data ?? {}) as Row;
    const msg =
      mode === "collect"
        ? { title: "Checked out", detail: `${d.unit_code} is now checked out to ${d.holder}. Due back ${d.expected_return_date}.` }
        : mode === "return"
          ? { title: "Returned", detail: `${d.unit_code} checked in — status: ${String(d.new_status).replace(/_/g, " ")}.` }
          : mode === "issue"
            ? { title: "Issued", detail: `${d.unit_code} issued to ${d.holder}.` }
            : { title: "Transfer received", detail: `${d.unit_code} is now in your custody.` };
    setDone({ ...msg, href: `/units/${unit.id}` });
    toast("success", msg.detail);
    router.refresh();
  }

  const formInvalid =
    (mode === "return" && condition !== "good" && notes.trim().length < 3) || (mode === "issue" && (!holder || !project || !due));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Check-Out / Check-In</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{current.hint}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="tablist" aria-label="Scanner mode">
        {modes.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              role="tab"
              aria-selected={mode === m.key}
              onClick={() => {
                setMode(m.key);
                reset();
              }}
              className={cn(
                "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-bold transition",
                mode === m.key ? "border-brand-charcoal bg-brand-charcoal text-brand-yellow dark:border-brand-yellow" : "border-zinc-300 bg-white hover:border-brand-yellow dark:border-zinc-700 dark:bg-zinc-900"
              )}
            >
              <Icon className="h-6 w-6" aria-hidden />
              {m.label}
            </button>
          );
        })}
      </div>

      {done ? (
        <div className="card card-pad flex flex-col items-center gap-3 border-4 border-emerald-600 py-10 text-center" role="status">
          <CheckCircle2 className="h-16 w-16 text-emerald-600" aria-hidden />
          <div className="text-2xl font-extrabold">{done.title}</div>
          <p className="max-w-md text-zinc-700 dark:text-zinc-300">{done.detail}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn btn-primary btn-lg" onClick={reset} autoFocus>Scan next</button>
            {done.href && <Link href={done.href} className="btn btn-outline btn-lg">View unit history</Link>}
          </div>
        </div>
      ) : (
        <div className="card card-pad">
          <ScanInput onSubmit={lookup} defaultCamera={false} submitLabel={mode === "lookup" ? "Open" : "Find"} />
        </div>
      )}

      {lookupError && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-red-400 bg-red-50 p-4 font-semibold text-red-950 dark:bg-red-950/40 dark:text-red-100" role="alert">
          <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden /> {lookupError}
        </div>
      )}

      {unit && !done && mode !== "lookup" && (
        <div className="card card-pad space-y-4">
          <div className="flex items-center gap-4">
            <ToolImage src={unit.parent?.image_url} alt="" className="h-20 w-20 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase text-zinc-500">{unit.parent?.brand}</div>
              <div className="text-lg font-extrabold">{unit.parent?.name}</div>
              <div className="font-mono text-base font-bold">{unit.unit_code}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                <ToolStatusBadge status={unit.status} />
                <ConditionBadge condition={unit.condition} />
              </div>
              {unit.holder?.full_name && <p className="mt-1 text-sm">Held by <strong>{unit.current_holder_id === userId ? "you" : unit.holder.full_name}</strong>{unit.project?.name ? ` · ${unit.project.name}` : ""}</p>}
            </div>
          </div>

          {problem ? (
            <div className="flex items-start gap-3 rounded-xl border-2 border-orange-400 bg-orange-50 p-4 font-semibold text-orange-950 dark:bg-orange-950/40 dark:text-orange-100" role="alert">
              <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden /> {problem}
            </div>
          ) : (
            <>
              {mode === "return" && (
                <fieldset className="space-y-3">
                  <legend className="label">Return condition</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {CONDITIONS.map((c) => (
                      <label key={c.v} className={cn("flex min-h-[56px] cursor-pointer items-center justify-center rounded-xl border-4 px-2 text-center font-bold transition", condition === c.v ? c.cls : "border-zinc-200 dark:border-zinc-700")}>
                        <input type="radio" name="condition" value={c.v} checked={condition === c.v} onChange={() => setCondition(c.v)} className="sr-only" />
                        {c.label}
                      </label>
                    ))}
                  </div>
                  <div>
                    <label htmlFor="ret-notes" className="label">Notes {condition !== "good" && <span className="text-red-700">*</span>}</label>
                    <textarea id="ret-notes" className="input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={condition === "good" ? "Optional" : "Describe the damage / issue"} />
                    {condition !== "good" && <p className="help">Damaged, maintenance and missing returns block future checkout and alert the Project Lead and Inventory Manager.</p>}
                  </div>
                  <PhotoUpload userId={userId} value={photos} onChange={setPhotos} />
                </fieldset>
              )}

              {mode === "issue" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="iss-holder" className="label">Issue to <span className="text-red-700">*</span></label>
                    <select id="iss-holder" className="input" value={holder} onChange={(e) => setHolder(e.target.value)}>
                      <option value="">Select employee…</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.employee_code ? ` (${p.employee_code})` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="iss-project" className="label">Project <span className="text-red-700">*</span></label>
                    <select id="iss-project" className="input" value={project} onChange={(e) => setProject(e.target.value)}>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="iss-due" className="label">Expected return <span className="text-red-700">*</span></label>
                    <input id="iss-due" type="date" className="input" min={todayPlus(0)} value={due} onChange={(e) => setDue(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="iss-note" className="label">Note</label>
                    <input id="iss-note" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>
              )}

              {mode === "receive" && transfer && (
                <div className="rounded-xl bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
                  <strong>{transfer.transfer_number}</strong> from {transfer.from_user?.full_name}: “{transfer.reason}”. Condition at transfer: {transfer.condition_at_transfer.replace(/_/g, " ")}.
                </div>
              )}

              <button className="btn btn-primary btn-lg w-full text-lg" onClick={() => setConfirm(true)} disabled={formInvalid}>
                {mode === "collect" ? "Confirm checkout" : mode === "return" ? "Confirm return" : mode === "issue" ? "Issue tool" : "Confirm receipt"}
              </button>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={execute}
        busy={busy}
        title={mode === "collect" ? "Check out this tool?" : mode === "return" ? "Return this tool?" : mode === "issue" ? "Issue this tool?" : "Accept this transfer?"}
        confirmLabel={mode === "collect" ? "Check out" : mode === "return" ? "Return tool" : mode === "issue" ? "Issue" : "Accept"}
        tone={mode === "return" && condition !== "good" ? "danger" : "primary"}
      >
        {unit && (
          <p>
            <span className="font-mono font-bold">{unit.unit_code}</span> — {unit.parent?.name}
            {mode === "return" && <> will be checked in as <strong>{condition.replace(/_/g, " ")}</strong>.</>}
            {mode === "collect" && <> will be recorded as checked out to the approved requester. You become responsible for it.</>}
            {mode === "issue" && <> will be issued to <strong>{people.find((p) => p.id === holder)?.full_name}</strong> until {due}.</>}
            {mode === "receive" && <> custody moves to you. Inspect the tool before accepting.</>}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
