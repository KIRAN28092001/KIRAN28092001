import Link from "next/link";
import type { Metadata } from "next";
import { Building2, MapPin } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ProjectEditor } from "./ProjectEditor";
import { fmtDate } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types";
import type { Row } from "@/lib/queries";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const [{ data: projects }, { data: members }, { data: stats }] = await Promise.all([
    supabase.from("projects").select("*").order("code"),
    supabase.from("project_members").select("project_id, member_role, user:profiles(full_name)"),
    supabase.rpc("dashboard_stats"),
  ]);
  const byProject = new Map(((stats as DashboardStats)?.by_project ?? []).map((p) => [p.id, p]));
  const memberRows = (members ?? []) as Row[];

  return (
    <div className="space-y-4">
      <PageHeader title="Projects" subtitle={profile.role === "admin" || profile.role === "inventory_manager" ? "All company projects" : "Projects you are assigned to"} actions={profile.role === "admin" ? <ProjectEditor /> : undefined} />
      {(projects ?? []).length === 0 ? (
        <EmptyState icon={Building2} title="No projects">You haven't been assigned to a project yet.</EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {((projects ?? []) as Row[]).map((p) => {
            const s = byProject.get(p.id);
            const leads = memberRows.filter((m) => m.project_id === p.id && m.member_role === "lead").map((m) => m.user?.full_name);
            const crew = memberRows.filter((m) => m.project_id === p.id && m.member_role === "member").length;
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="card card-pad block h-full transition hover:border-brand-yellow">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">{p.code}</div>
                      <h2 className="text-xl font-extrabold">{p.name}</h2>
                    </div>
                    <Badge tone={p.status === "active" ? "green" : p.status === "planning" ? "blue" : p.status === "on_hold" ? "yellow" : "gray"}>{p.status.replace("_", " ")}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">{p.description}</p>
                  <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500"><MapPin className="h-3 w-3" aria-hidden /> {p.location ?? "—"}</p>
                  <p className="mt-1 text-xs text-zinc-500">{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</p>
                  <div className="mt-3 text-sm"><span className="font-semibold">Lead:</span> {leads.join(", ") || "Unassigned"} · <span className="font-semibold">Crew:</span> {crew}</div>
                  {s && (
                    <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-zinc-100 p-2 text-center text-xs dark:bg-zinc-800">
                      <div><dt className="text-zinc-500">Checked out</dt><dd className="text-lg font-extrabold">{s.checked_out}</dd></div>
                      <div><dt className="text-zinc-500">Home tools</dt><dd className="text-lg font-extrabold">{s.home_tools}</dd></div>
                      <div><dt className="text-zinc-500">Open requests</dt><dd className="text-lg font-extrabold">{s.open_requests}</dd></div>
                    </dl>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
