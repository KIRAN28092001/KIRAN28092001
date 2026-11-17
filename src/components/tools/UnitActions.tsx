"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, ShieldAlert, Wrench, CheckCircle2, Download } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { downloadPNG, downloadPDF } from "@/components/barcode/export";
import type { Row } from "@/lib/queries";

type Panel = "edit" | "maint" | "complete" | "status" | null;

export function UnitActions({ unit, openMaintenance, isStaff, org }: { unit: Row; openMaintenance: Row[]; isStaff: boolean; org: string }) {
  const router = useRouter();
  const toast = useToast();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [serial, setSerial] = useState(unit.serial_number ?? "");
  const [location, setLocation] = useState(unit.location ?? "");
  const [notes, setNotes] = useState(unit.notes ?? "");
  const [cond, setCond] = useState(unit.condition);
  const [mType, setMType] = useState("repair");
  const [mDesc, setMDesc] = useState("");
  const [mVendor, setMVendor] = useState("");
  const [record, setRecord] = useState(openMaintenance[0]?.id ?? "");
  const [resolution, setResolution] = useState("");
  const [cost, setCost] = useState("");
  const [backInService, setBackInService] = useState(true);
  const [status, setStatus] = useState("available");
  const [reason, setReason] = useState("");

  const busyUnit = ["checked_out", "in_transfer", "reserved", "pending_approval"].includes(unit.status);
  const label = { code: unit.unit_code, title: unit.parent?.name ?? "", subtitle: `${unit.parent?.brand ?? ""} · S/N ${unit.serial_number ?? "—"}`, org };

  async function run(fn: () => PromiseLike<{ error: unknown }>, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    toast("success", ok);
    setPanel(null);
    router.refresh();
  }
  const sb = () => createClient();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-outline btn-sm" onClick={() => downloadPNG(label)}><Download className="h-4 w-4" aria-hidden /> Label PNG</button>
        <button className="btn btn-outline btn-sm" onClick={() => downloadPDF([label], "2x1", "roll", `${unit.unit_code}.pdf`)}><Download className="h-4 w-4" aria-hidden /> Label PDF</button>
        <button className="btn btn-outline btn-sm" onClick={() => setPanel("edit")}><Pencil className="h-4 w-4" aria-hidden /> Edit</button>
        {openMaintenance.length > 0 ? (
          <button className="btn btn-primary btn-sm" onClick={() => setPanel("complete")}><CheckCircle2 className="h-4 w-4" aria-hidden /> Complete maintenance</button>
        ) : (
          <button className="btn btn-outline btn-sm" onClick={() => setPanel("maint")} disabled={busyUnit || unit.status === "retired"} title={busyUnit ? "Return the unit first" : undefined}><Wrench className="h-4 w-4" aria-hidden /> Send to maintenance</button>
        )}
        <button className="btn btn-outline btn-sm" onClick={() => { setStatus(unit.status === "available" ? "missing" : "available"); setPanel("status"); }}><ShieldAlert className="h-4 w-4" aria-hidden /> Change status</button>
      </div>

      <Dialog open={panel === "edit"} onClose={() => setPanel(null)} title={`Edit ${unit.unit_code}`}
        footer={<><button className="btn btn-outline" onClick={() => setPanel(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => run(() => sb().rpc("update_tool_unit", { p_unit: unit.id, p_serial: serial, p_location: location, p_notes: notes, p_condition: cond }), "Unit updated")}>Save</button></>}>
        <div className="space-y-3">
          <div><label htmlFor="u-serial" className="label">Serial number</label><input id="u-serial" className="input font-mono" value={serial} onChange={(e) => setSerial(e.target.value)} /></div>
          <div><label htmlFor="u-loc" className="label">Location</label><input id="u-loc" className="input" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          <div><label htmlFor="u-cond" className="label">Condition</label>
            <select id="u-cond" className="input" value={cond} onChange={(e) => setCond(e.target.value)}>
              <option value="good">Good</option><option value="fair">Fair</option><option value="needs_maintenance">Needs maintenance</option><option value="damaged">Damaged</option>
            </select>
          </div>
          <div><label htmlFor="u-notes" className="label">Notes</label><textarea id="u-notes" className="input min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
      </Dialog>

      <Dialog open={panel === "maint"} onClose={() => setPanel(null)} title="Send to maintenance"
        footer={<><button className="btn btn-outline" onClick={() => setPanel(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || mDesc.trim().length < 3} onClick={() => run(() => sb().rpc("open_maintenance", { p_unit: unit.id, p_type: mType, p_description: mDesc, p_vendor: mVendor || null }), "Maintenance opened — unit blocked from checkout")}>Open work order</button></>}>
        <div className="space-y-3">
          <div><label htmlFor="m-type" className="label">Type</label>
            <select id="m-type" className="input" value={mType} onChange={(e) => setMType(e.target.value)}>
              <option value="repair">Repair</option><option value="scheduled">Scheduled service</option><option value="inspection">Inspection</option><option value="calibration">Calibration</option>
            </select></div>
          <div><label htmlFor="m-desc" className="label">Description *</label><textarea id="m-desc" className="input min-h-[80px]" value={mDesc} onChange={(e) => setMDesc(e.target.value)} /></div>
          <div><label htmlFor="m-vendor" className="label">Vendor / technician</label><input id="m-vendor" className="input" value={mVendor} onChange={(e) => setMVendor(e.target.value)} /></div>
        </div>
      </Dialog>

      <Dialog open={panel === "complete"} onClose={() => setPanel(null)} title="Complete maintenance"
        footer={<><button className="btn btn-outline" onClick={() => setPanel(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || resolution.trim().length < 3} onClick={() => run(() => sb().rpc("complete_maintenance", { p_record: record, p_resolution: resolution, p_cost: cost ? Number(cost) : null, p_return_to_service: backInService }), backInService ? "Unit back in service" : "Unit retired")}>Complete</button></>}>
        <div className="space-y-3">
          <div><label htmlFor="c-rec" className="label">Work order</label>
            <select id="c-rec" className="input" value={record} onChange={(e) => setRecord(e.target.value)}>
              {openMaintenance.map((m) => <option key={m.id} value={m.id}>{m.type} — {m.description}</option>)}
            </select></div>
          <div><label htmlFor="c-res" className="label">Resolution *</label><textarea id="c-res" className="input min-h-[80px]" value={resolution} onChange={(e) => setResolution(e.target.value)} /></div>
          <div><label htmlFor="c-cost" className="label">Cost (USD)</label><input id="c-cost" type="number" min="0" step="0.01" className="input" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
          <fieldset className="space-y-2"><legend className="label">Outcome</legend>
            <label className="flex items-center gap-2"><input type="radio" checked={backInService} onChange={() => setBackInService(true)} className="h-5 w-5 accent-brand-yellow" /> Return to service (available)</label>
            <label className="flex items-center gap-2"><input type="radio" checked={!backInService} onChange={() => setBackInService(false)} className="h-5 w-5 accent-brand-yellow" /> Beyond repair — retire unit</label>
          </fieldset>
        </div>
      </Dialog>

      <Dialog open={panel === "status"} onClose={() => setPanel(null)} title={`Change status of ${unit.unit_code}`}
        footer={<><button className="btn btn-outline" onClick={() => setPanel(null)}>Cancel</button><button className={`btn ${status === "available" ? "btn-primary" : "btn-danger"}`} disabled={busy || reason.trim().length < 3} onClick={() => run(() => sb().rpc("set_unit_status", { p_unit: unit.id, p_status: status, p_reason: reason }), `Status changed to ${status}`)}>Change status</button></>}>
        <div className="space-y-3">
          <div><label htmlFor="s-status" className="label">New status</label>
            <select id="s-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="available">Available (clear damage / found)</option>
              <option value="damaged">Damaged</option>
              <option value="missing">Missing</option>
              {isStaff && <option value="retired">Retired</option>}
            </select></div>
          <div><label htmlFor="s-reason" className="label">Reason *</label><textarea id="s-reason" className="input min-h-[72px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Found during audit / dropped from lift" /></div>
          <p className="help">Checked-out units can only be marked missing; use Return for everything else. Clearing to Available requires closed maintenance.</p>
        </div>
      </Dialog>
    </>
  );
}
