"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, Pencil, RefreshCw, Search, UserPlus, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABEL, errorMessage, fmtDateTime, timeAgo } from "@/lib/utils";
import type { Role } from "@/lib/types";
import type { Row } from "@/lib/queries";

const ROLES: Role[] = ["admin", "project_lead", "inventory_manager", "labor"];
const ROLE_TONE = { admin: "red", project_lead: "blue", inventory_manager: "purple", labor: "gray" } as const;

export function UserManager({ meId, users, members, projects, holding, invitations }: { meId: string; users: Row[]; members: Row[]; projects: Row[]; holding: Record<string, number>; invitations: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [edit, setEdit] = useState<Row | null>(null);
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean | string[]>>({});
  const [revoking, setRevoking] = useState<Row | null>(null);
  const pending = invitations.filter((i) => i.status === "pending");
  const pendingIds = new Set(pending.map((i) => i.auth_user_id));

  const shown = useMemo(() => {
    const t = q.toLowerCase();
    return users.filter((u) => !pendingIds.has(u.id) && (role === "all" || u.role === role) && (!t || [u.full_name, u.email, u.employee_code, u.job_title].join(" ").toLowerCase().includes(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, q, role, invitations]);
  const projectsOf = (id: string) => members.filter((m) => m.user_id === id);

  function openEdit(u: Row) {
    setForm({ full_name: u.full_name, role: u.role, is_active: u.is_active, employee_code: u.employee_code ?? "", job_title: u.job_title ?? "", phone: u.phone ?? "" });
    setEdit(u);
  }
  function openCreate() {
    setForm({ full_name: "", email: "", role: "labor", employee_code: "", job_title: "", phone: "", project_ids: [] });
    setCreate(true);
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    const { error } = await createClient().rpc("admin_update_user", {
      p_user: edit.id, p_role: form.role, p_active: form.is_active, p_full_name: form.full_name, p_employee_code: form.employee_code, p_job_title: form.job_title, p_phone: form.phone,
    });
    setBusy(false);
    if (error) return toast("error", error.code === "23505" ? "Employee code already in use" : errorMessage(error));
    toast("success", "User updated");
    setEdit(null);
    router.refresh();
  }
  async function saveCreate() {
    setBusy(true);
    const res = await fetch("/api/admin/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast("error", body.error ?? "Could not send invitation");
    toast("success", `Invitation sent to ${form.email}`);
    setCreate(false);
    router.refresh();
  }
  async function invitationAction(inv: Row, method: "PATCH" | "DELETE") {
    setBusy(true);
    const res = await fetch("/api/admin/invitations", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: inv.id }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setRevoking(null);
    if (!res.ok) return toast("error", body.error ?? "Request failed");
    toast("success", method === "PATCH" ? `Invitation re-sent to ${inv.email}` : `Invitation for ${inv.full_name} revoked`);
    router.refresh();
  }
  async function sendReset(u: Row) {
    const res = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: u.id }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast("error", body.error ?? "Could not send reset e-mail");
    toast("success", `Password reset e-mail sent to ${u.email}`);
  }

  const field = (k: string, label: string, type = "text", extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label htmlFor={`u-${k}`} className="label">{label}</label><input id={`u-${k}`} type={type} className="input" value={String(form[k] ?? "")} onChange={set(k)} {...extra} /></div>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Users & Roles" subtitle={`${users.length - pending.length} accounts · ${pending.length} pending invitation${pending.length === 1 ? "" : "s"} · accounts are created by invitation only`} actions={<button className="btn btn-primary" onClick={openCreate}><UserPlus className="h-5 w-5" aria-hidden /> Invite user</button>} />

      {invitations.length > 0 && (
        <section className="card" aria-labelledby="inv-h">
          <h2 id="inv-h" className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 text-base font-extrabold dark:border-zinc-800"><Mail className="h-5 w-5" aria-hidden /> Invitations</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th scope="col">Invitee</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Sent</th><th scope="col">Invited by</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {invitations.slice(0, 25).map((i) => (
                  <tr key={i.id}>
                    <td><div className="font-semibold">{i.full_name}</div><div className="text-xs text-zinc-500">{i.email}</div></td>
                    <td><Badge tone={ROLE_TONE[i.role as Role]} dot={false}>{ROLE_LABEL[i.role as Role]}</Badge></td>
                    <td>{i.status === "pending" ? <Badge tone="yellow">Pending</Badge> : i.status === "accepted" ? <Badge tone="green">Accepted {timeAgo(i.accepted_at)}</Badge> : <Badge tone="gray">Revoked</Badge>}</td>
                    <td className="whitespace-nowrap text-xs" title={fmtDateTime(i.last_sent_at)}>{timeAgo(i.last_sent_at)}{i.send_count > 1 ? ` · sent ${i.send_count}×` : ""}</td>
                    <td className="text-xs">{i.inviter?.full_name ?? "—"}</td>
                    <td className="whitespace-nowrap">
                      {i.status === "pending" && (
                        <>
                          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => invitationAction(i, "PATCH")} aria-label={`Resend invitation to ${i.email}`} title="Resend"><RefreshCw className="h-4 w-4" /></button>
                          <button className="btn btn-ghost btn-sm text-red-700" disabled={busy} onClick={() => setRevoking(i)} aria-label={`Revoke invitation for ${i.email}`} title="Revoke"><XCircle className="h-4 w-4" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="card card-pad flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="u-q" className="sr-only">Search users</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input id="u-q" className="input pl-10" placeholder="Name, e-mail, employee ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label htmlFor="u-role" className="sr-only">Role</label>
        <select id="u-role" className="input sm:w-56" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="all">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Employee ID</th><th scope="col">Projects</th><th scope="col">Holding</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td><div className="font-semibold">{u.full_name}{u.id === meId && " (you)"}</div><div className="text-xs text-zinc-500">{u.email}{u.job_title ? ` · ${u.job_title}` : ""}</div></td>
                <td><Badge tone={ROLE_TONE[u.role as Role]} dot={false}>{ROLE_LABEL[u.role as Role]}</Badge></td>
                <td className="font-mono text-xs">{u.employee_code ?? "—"}</td>
                <td className="text-xs">{projectsOf(u.id).map((m) => `${m.project?.name}${m.member_role === "lead" ? " (lead)" : ""}`).join(", ") || "—"}</td>
                <td className="tabular-nums">{holding[u.id] ?? 0}</td>
                <td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}</td>
                <td className="whitespace-nowrap">
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)} aria-label={`Edit ${u.full_name}`}><Pencil className="h-4 w-4" /></button>
                  <button className="btn btn-ghost btn-sm" onClick={() => sendReset(u)} aria-label={`Send password reset to ${u.full_name}`} title="Send password reset"><KeyRound className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!edit} onClose={() => setEdit(null)} title={`Edit ${edit?.full_name ?? ""}`} footer={<><button className="btn btn-outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={saveEdit} disabled={busy}>Save</button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("full_name", "Full name")}</div>
          <div><label htmlFor="u-role-e" className="label">Role</label>
            <select id="u-role-e" className="input" value={String(form.role)} onChange={set("role")} disabled={edit?.id === meId}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select></div>
          {field("employee_code", "Employee ID (badge)")}
          {field("job_title", "Job title")}
          {field("phone", "Phone", "tel")}
          <label className="flex items-center gap-2 font-semibold sm:col-span-2"><input type="checkbox" className="h-5 w-5 accent-brand-yellow" checked={!!form.is_active} onChange={set("is_active")} disabled={edit?.id === meId} /> Account active</label>
          {edit && (holding[edit.id] ?? 0) > 0 && !form.is_active && <p className="field-error sm:col-span-2">This user still holds {holding[edit.id]} tool(s). Recover them before deactivating.</p>}
          <p className="help sm:col-span-2">Project assignments are managed from each project&apos;s Team panel.</p>
        </div>
      </Dialog>

      <Dialog open={create} onClose={() => setCreate(false)} title="Invite user" size="lg" footer={<><button className="btn btn-outline" onClick={() => setCreate(false)}>Cancel</button><button className="btn btn-primary" onClick={saveCreate} disabled={busy}>{busy ? "Sending…" : "Send invitation"}</button></>}>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">The person receives an e-mail with a one-time link to set their password. Their role and project access are fixed by this invitation and only take effect once they accept.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("full_name", "Full name *")}
          {field("email", "Work e-mail *", "email", { autoComplete: "off" })}
          <div><label htmlFor="u-role-c" className="label">Role *</label>
            <select id="u-role-c" className="input" value={String(form.role)} onChange={set("role")}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select></div>
          {field("employee_code", "Employee ID (badge)")}
          {field("job_title", "Job title")}
          {field("phone", "Phone", "tel")}
          <fieldset className="sm:col-span-2">
            <legend className="label">Assign to projects</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-brand-yellow" checked={(form.project_ids as string[] | undefined)?.includes(p.id) ?? false}
                    onChange={(e) => setForm((f) => ({ ...f, project_ids: e.target.checked ? [...((f.project_ids as string[]) ?? []), p.id] : ((f.project_ids as string[]) ?? []).filter((x) => x !== p.id) }))} />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </Dialog>

      <ConfirmDialog open={!!revoking} onClose={() => setRevoking(null)} onConfirm={() => revoking && invitationAction(revoking, "DELETE")} busy={busy} tone="danger" title="Revoke invitation?" confirmLabel="Revoke">
        The link sent to {revoking?.email} stops working and the pending account is removed. You can invite them again later.
      </ConfirmDialog>
    </div>
  );
}
