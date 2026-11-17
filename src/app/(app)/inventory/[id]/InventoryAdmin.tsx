"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Plus, Trash2 } from "lucide-react";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";

export function InventoryAdmin({ toolId, archived, isAdmin }: { toolId: string; archived: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [add, setAdd] = useState(false);
  const [count, setCount] = useState("1");
  const [archive, setArchive] = useState(false);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);

  async function addUnits() {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 100) return toast("error", "Enter 1–100 units");
    setBusy(true);
    const { error } = await createClient().rpc("add_tool_units", { p_parent: toolId, p_count: n });
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    toast("success", `${n} unit(s) added with new barcodes`);
    setAdd(false);
    router.refresh();
  }
  async function toggleArchive() {
    setBusy(true);
    const { error } = await createClient().from("parent_tools").update({ is_archived: !archived }).eq("id", toolId);
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    toast("success", archived ? "Tool restored to catalog" : "Tool archived — hidden from the request catalog");
    setArchive(false);
    router.refresh();
  }
  async function remove() {
    setBusy(true);
    const { error } = await createClient().from("parent_tools").delete().eq("id", toolId);
    setBusy(false);
    if (error) return toast("error", error.code === "23503" ? "This tool has history (requests/checkouts). Archive it instead." : errorMessage(error));
    toast("success", "Tool deleted");
    router.push("/inventory");
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn btn-primary btn-sm" onClick={() => setAdd(true)}><Plus className="h-4 w-4" aria-hidden /> Add units</button>
      <button className="btn btn-outline btn-sm" onClick={() => setArchive(true)}><Archive className="h-4 w-4" aria-hidden /> {archived ? "Restore" : "Archive"}</button>
      {isAdmin && <button className="btn btn-outline btn-sm text-red-700" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" aria-hidden /> Delete</button>}
      <Dialog open={add} onClose={() => setAdd(false)} title="Add units" footer={<><button className="btn btn-outline" onClick={() => setAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={addUnits} disabled={busy}>Add & generate barcodes</button></>}>
        <label htmlFor="add-n" className="label">How many new units?</label>
        <input id="add-n" type="number" min={1} max={100} className="input" value={count} onChange={(e) => setCount(e.target.value)} />
        <p className="help">Units are numbered after the highest existing unit; codes are never reused.</p>
      </Dialog>
      <ConfirmDialog open={archive} onClose={() => setArchive(false)} onConfirm={toggleArchive} busy={busy} title={archived ? "Restore tool?" : "Archive tool?"} confirmLabel={archived ? "Restore" : "Archive"}>
        {archived ? "The tool will appear in the request catalog again." : "Archived tools stay in history and reports but can't be requested."}
      </ConfirmDialog>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={remove} busy={busy} tone="danger" title="Permanently delete tool?" confirmLabel="Delete forever">
        This deletes the parent tool, all units, labels and their history. Prefer archiving for tools that have been used.
      </ConfirmDialog>
    </div>
  );
}
