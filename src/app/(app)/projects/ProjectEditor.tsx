"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import type { Row } from "@/lib/queries";

export function ProjectEditor({ project }: { project?: Row }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    code: project?.code ?? "",
    name: project?.name ?? "",
    description: project?.description ?? "",
    location: project?.location ?? "",
    status: project?.status ?? "active",
    start_date: project?.start_date ?? "",
    end_date: project?.end_date ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    if (!f.code.trim() || !f.name.trim()) return toast("error", "Code and name are required");
    if (f.start_date && f.end_date && f.end_date < f.start_date) return toast("error", "End date must be after start date");
    setBusy(true);
    const payload = { ...f, code: f.code.trim().toUpperCase(), name: f.name.trim(), start_date: f.start_date || null, end_date: f.end_date || null };
    const supabase = createClient();
    const { error } = project ? await supabase.from("projects").update(payload).eq("id", project.id) : await supabase.from("projects").insert(payload);
    setBusy(false);
    if (error) return toast("error", error.code === "23505" ? "That project code is already used" : errorMessage(error));
    toast("success", project ? "Project updated" : "Project created");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className={project ? "btn btn-outline" : "btn btn-primary"} onClick={() => setOpen(true)}>
        {project ? <Pencil className="h-4 w-4" aria-hidden /> : <Plus className="h-5 w-5" aria-hidden />} {project ? "Edit project" : "New project"}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={project ? `Edit ${project.name}` : "New project"}
        footer={<><button className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="p-code" className="label">Code *</label><input id="p-code" className="input uppercase" value={f.code} onChange={set("code")} /></div>
          <div><label htmlFor="p-name" className="label">Name *</label><input id="p-name" className="input" value={f.name} onChange={set("name")} /></div>
          <div className="sm:col-span-2"><label htmlFor="p-desc" className="label">Description</label><textarea id="p-desc" className="input" value={f.description} onChange={set("description")} /></div>
          <div className="sm:col-span-2"><label htmlFor="p-loc" className="label">Location</label><input id="p-loc" className="input" value={f.location} onChange={set("location")} /></div>
          <div><label htmlFor="p-status" className="label">Status</label>
            <select id="p-status" className="input" value={f.status} onChange={set("status")}><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></div>
          <div />
          <div><label htmlFor="p-start" className="label">Start</label><input id="p-start" type="date" className="input" value={f.start_date} onChange={set("start_date")} /></div>
          <div><label htmlFor="p-end" className="label">End</label><input id="p-end" type="date" className="input" value={f.end_date} onChange={set("end_date")} /></div>
        </div>
      </Dialog>
    </>
  );
}
