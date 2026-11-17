import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { getProfile, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { ActivityFeed } from "@/components/ActivityFeed";
import { CheckoutList, RequestList, TransferList, Section } from "@/components/lists";
import { ProjectEditor } from "../ProjectEditor";
import { MemberManager } from "./MemberManager";
import { AUDIT_SELECT, CHECKOUT_SELECT, REQUEST_SELECT, TRANSFER_SELECT, type Row } from "@/lib/queries";
import { fmtDate } from "@/lib/utils";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();
  const p = project as Row;
  const { data: isLead } = await supabase.rpc("is_project_lead", { p_project: id });
  const oversight = isStaff(profile.role) || isLead === true;

  const [{ data: members }, { data: custody }, { data: requests }, { data: transfers }, { data: activity }, { data: homeTools }, { data: candidates }] = await Promise.all([
    supabase.from("project_members").select("id, user_id, member_role, user:profiles(full_name, job_title, role)").eq("project_id", id).order("member_role"),
    supabase.from("checkouts").select(CHECKOUT_SELECT).eq("project_id", id).eq("status", "active").order("expected_return_date"),
    supabase.from("tool_requests").select(REQUEST_SELECT).eq("project_id", id).in("status", ["pending", "approved", "waitlisted"]).order("created_at"),
    supabase.from("transfers").select(TRANSFER_SELECT).eq("project_id", id).order("created_at", { ascending: false }).limit(10),
    oversight ? supabase.from("audit_logs").select(AUDIT_SELECT).eq("project_id", id).order("created_at", { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
    supabase.from("v_catalog").select("id, name, parent_code, available_units, total_units").eq("home_project_id", id).order("name"),
    oversight ? supabase.from("profiles").select("id, full_name, role").eq("is_active", true).order("full_name") : Promise.resolve({ data: [] }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/projects", label: "Projects" }}
        title={p.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{p.code} · <MapPin className="h-3 w-3" aria-hidden /> {p.location} · {fmtDate(p.start_date)} – {fmtDate(p.end_date)} <Badge tone={p.status === "active" ? "green" : "blue"}>{p.status.replace("_", " ")}</Badge></span>}
        actions={profile.role === "admin" || isLead === true ? <ProjectEditor project={p} /> : undefined}
      />
      {p.description && <p className="text-zinc-700 dark:text-zinc-300">{p.description}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title={`Team (${(members ?? []).length})`}>
          <MemberManager projectId={id} members={(members ?? []) as Row[]} candidates={(candidates ?? []) as Row[]} isAdmin={profile.role === "admin"} canManage={profile.role === "admin" || isLead === true} />
        </Section>
        <Section title={`Active custody (${(custody ?? []).length})`} className="lg:col-span-2">
          <CheckoutList rows={(custody ?? []) as Row[]} showHolder={oversight || profile.role === "labor"} empty="No tools are checked out on this project." />
        </Section>
        <Section title="Open requests" className="lg:col-span-1">
          <RequestList rows={(requests ?? []) as Row[]} empty="No open requests you can see." />
        </Section>
        <Section title="Tool allocation (home tools)" className="lg:col-span-2">
          {(homeTools ?? []).length === 0 ? <p className="py-3 text-sm text-zinc-500">No tools are based at this project.</p> : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {((homeTools ?? []) as Row[]).map((t) => (
                <li key={t.id}><Link href={`/catalog/${t.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 p-2.5 text-sm hover:border-brand-yellow dark:border-zinc-800">
                  <span className="min-w-0"><span className="block truncate font-semibold">{t.name}</span><span className="font-mono text-xs text-zinc-500">{t.parent_code}</span></span>
                  <Badge tone={t.available_units > 0 ? "green" : "red"}>{t.available_units}/{t.total_units}</Badge>
                </Link></li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Recent transfers" className="lg:col-span-1">
          <TransferList rows={(transfers ?? []) as Row[]} empty="No transfers." />
        </Section>
        {oversight && (
          <Section title="Project history" className="lg:col-span-2">
            <ActivityFeed items={(activity ?? []) as Row[]} />
          </Section>
        )}
      </div>
    </div>
  );
}
