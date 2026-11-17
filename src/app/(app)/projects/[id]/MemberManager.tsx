"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABEL, errorMessage } from "@/lib/utils";
import type { Row } from "@/lib/queries";

export function MemberManager({ projectId, members, candidates, isAdmin, canManage }: { projectId: string; members: Row[]; candidates: Row[]; isAdmin: boolean; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [userId, setUserId] = useState("");
  const [asLead, setAsLead] = useState(false);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const memberIds = new Set(members.map((m) => m.user_id));
  const options = candidates.filter((c) => !memberIds.has(c.id) && (isAdmin || c.role === "labor"));

  async function add() {
    if (!userId) return;
    setBusy(true);
    const { error } = await createClient().from("project_members").insert({ project_id: projectId, user_id: userId, member_role: asLead ? "lead" : "member" });
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    toast("success", "Member added");
    setUserId("");
    router.refresh();
  }
  async function remove() {
    if (!removing) return;
    setBusy(true);
    const { error } = await createClient().from("project_members").delete().eq("id", removing.id);
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    toast("success", "Member removed");
    setRemoving(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-2">
            <div>
              <div className="font-semibold">{m.user?.full_name}</div>
              <div className="text-xs text-zinc-500">{m.member_role === "lead" ? "Project Lead" : m.user?.job_title ?? ROLE_LABEL[m.user?.role as keyof typeof ROLE_LABEL]}</div>
            </div>
            {canManage && (isAdmin || m.member_role === "member") && (
              <button className="btn btn-ghost btn-sm" onClick={() => setRemoving(m)} aria-label={`Remove ${m.user?.full_name}`}><X className="h-4 w-4" /></button>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <label htmlFor="add-member" className="label">Add member</label>
          <select id="add-member" className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select person…</option>
            {options.map((c) => <option key={c.id} value={c.id}>{c.full_name} — {ROLE_LABEL[c.role as keyof typeof ROLE_LABEL]}</option>)}
          </select>
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-5 w-5 accent-brand-yellow" checked={asLead} onChange={(e) => setAsLead(e.target.checked)} /> Assign as Project Lead</label>
          )}
          <button className="btn btn-primary" onClick={add} disabled={!userId || busy}><UserPlus className="h-4 w-4" aria-hidden /> Add</button>
        </div>
      )}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} busy={busy} tone="danger" title="Remove member?" confirmLabel="Remove">
        {removing?.user?.full_name} will lose access to this project&apos;s requests. Tools they hold stay assigned until returned.
      </ConfirmDialog>
    </div>
  );
}
