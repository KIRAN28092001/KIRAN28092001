import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle, ArrowLeftRight, Boxes, CheckCircle2, ClipboardCheck, Clock, PackageCheck, PackageSearch, Plus, ScanLine, Search, Tag, Wrench, Building2,
} from "lucide-react";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActivityFeed } from "@/components/ActivityFeed";
import { RequestList, CheckoutList, TransferList, Section } from "@/components/lists";
import { ToolStatusBadge, requestStage } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { AUDIT_SELECT, CHECKOUT_SELECT, PICK_SELECT, REQUEST_SELECT, TRANSFER_SELECT, type Row } from "@/lib/queries";
import { fmtDate, ROLE_LABEL } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const profile = await getProfile();
  const supabase = await createClient();
  // Housekeeping is idempotent: expires stale reservations and raises due alerts.
  await supabase.rpc("run_housekeeping");
  const { data: statsData } = await supabase.rpc("dashboard_stats");
  const stats = statsData as DashboardStats;
  const firstName = profile.full_name.split(" ")[0];
  const deniedBanner = denied && (
    <div className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert">
      You don&apos;t have access to that page.
    </div>
  );

  if (profile.role === "labor") return <>{deniedBanner}<LaborDashboard firstName={firstName} userId={profile.id} stats={stats} /></>;
  if (profile.role === "project_lead") return <>{deniedBanner}<LeadDashboard firstName={firstName} userId={profile.id} stats={stats} /></>;
  return <>{deniedBanner}<CompanyDashboard firstName={firstName} role={profile.role} stats={stats} /></>;
}

/* ------------------------------------------------------------------ */
async function LaborDashboard({ firstName, userId, stats }: { firstName: string; userId: string; stats: DashboardStats }) {
  const supabase = await createClient();
  const [{ data: active }, { data: approved }, { data: openData }, { data: incoming }, { data: projects }] = await Promise.all([
    supabase.from("checkouts").select(CHECKOUT_SELECT).eq("holder_id", userId).eq("status", "active").order("expected_return_date"),
    supabase.from("tool_requests").select(REQUEST_SELECT).eq("requester_id", userId).eq("status", "approved").order("created_at"),
    supabase.from("tool_requests").select(REQUEST_SELECT).eq("requester_id", userId).in("status", ["pending", "waitlisted"]).order("created_at", { ascending: false }),
    supabase.from("transfers").select(TRANSFER_SELECT).eq("to_user_id", userId).eq("status", "pending_acknowledgment"),
    supabase.from("project_members").select("member_role, project:projects(id, name, code, location, status)").eq("user_id", userId),
  ]);

  const ready = ((approved ?? []) as Row[]).filter((r) => requestStage(r.status, r.pick).stage === "ready");
  const open = [...((approved ?? []) as Row[]).filter((r) => requestStage(r.status, r.pick).stage !== "ready"), ...((openData ?? []) as Row[])];
  return (
    <div className="space-y-5">
      <PageHeader title={`Hi ${firstName} 👋`} subtitle="Request a tool, collect approved tools and manage what you're holding." />

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/catalog" className="group flex min-h-[96px] items-center gap-4 rounded-2xl bg-brand-yellow p-5 text-brand-charcoal shadow-card transition hover:bg-brand-yellow-dark">
          <span className="rounded-xl bg-brand-charcoal p-3 text-brand-yellow"><Search className="h-8 w-8" aria-hidden /></span>
          <span>
            <span className="block text-xl font-extrabold">Request Tool</span>
            <span className="text-sm font-semibold">Search or scan to find a tool</span>
          </span>
        </Link>
        <Link href="/scanner" className="group flex min-h-[96px] items-center gap-4 rounded-2xl bg-brand-charcoal p-5 text-white shadow-card transition hover:bg-black">
          <span className="rounded-xl bg-brand-yellow p-3 text-brand-charcoal"><ScanLine className="h-8 w-8" aria-hidden /></span>
          <span>
            <span className="block text-xl font-extrabold">Scan Barcode</span>
            <span className="text-sm font-semibold text-zinc-300">Collect, return or look up a tool</span>
          </span>
        </Link>
      </div>

      {ready.length > 0 && (
        <Section title="✅ Ready for pickup" action={<Link href="/scanner" className="btn btn-primary btn-sm">Scan to collect</Link>}>
          <RequestList rows={ready} showRequester={false} />
        </Section>
      )}
      {(incoming?.length ?? 0) > 0 && (
        <Section title="Incoming transfers — confirm receipt">
          <TransferList rows={incoming as Row[]} />
        </Section>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="My active tools" value={stats.my_active} icon={PackageCheck} accent="blue" href="/my-tools" />
        <StatCard label="My open requests" value={open.length + ready.length} icon={ClipboardCheck} accent="yellow" href="/requests" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} accent={stats.overdue ? "red" : "default"} href="/my-tools" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="My Active Tools" action={<Link href="/my-tools" className="link text-sm">View all</Link>}>
          <CheckoutList rows={(active ?? []) as Row[]} showHolder={false} empty="You aren't holding any tools." />
        </Section>
        <div className="space-y-5">
          <Section title="My Project">
            {(projects ?? []).length === 0 ? (
              <p className="py-4 text-sm text-zinc-500">You are not assigned to a project yet. Ask your Project Lead.</p>
            ) : (
              <ul className="space-y-2">
                {(projects as Row[]).map((m) => (
                  <li key={m.project.id}>
                    <Link href={`/projects/${m.project.id}`} className="flex items-center gap-3 rounded-xl border-2 border-zinc-200 p-3 hover:border-brand-yellow dark:border-zinc-800">
                      <Building2 className="h-6 w-6 text-amber-700 dark:text-brand-yellow" aria-hidden />
                      <div className="min-w-0">
                        <div className="font-bold">{m.project.name}</div>
                        <div className="truncate text-xs text-zinc-600 dark:text-zinc-400">{m.project.location}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Requests in progress" action={<Link href="/requests" className="link text-sm">All requests</Link>}>
            <RequestList rows={open} showRequester={false} empty="No pending requests." />
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
async function LeadDashboard({ firstName, userId, stats }: { firstName: string; userId: string; stats: DashboardStats }) {
  const supabase = await createClient();
  const { data: memberships } = await supabase.from("project_members").select("project_id").eq("user_id", userId).eq("member_role", "lead");
  const projectIds = (memberships ?? []).map((m: Row) => m.project_id);
  const ids = projectIds.length ? projectIds : ["00000000-0000-0000-0000-000000000000"];
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: pending }, { data: transfers }, { data: allocated }, { data: overdue }, { data: activity }] = await Promise.all([
    supabase.from("tool_requests").select(REQUEST_SELECT).in("project_id", ids).eq("status", "pending").order("created_at"),
    supabase.from("transfers").select(TRANSFER_SELECT).in("project_id", ids).or("status.eq.pending_acknowledgment,and(status.eq.completed,lead_review.eq.pending)").order("created_at", { ascending: false }),
    supabase.from("checkouts").select(CHECKOUT_SELECT).in("project_id", ids).eq("status", "active").order("expected_return_date").limit(12),
    supabase.from("checkouts").select(CHECKOUT_SELECT).in("project_id", ids).eq("status", "active").lt("expected_return_date", today).order("expected_return_date"),
    supabase.from("audit_logs").select(AUDIT_SELECT).in("project_id", ids).order("created_at", { ascending: false }).limit(10),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title={`Good to see you, ${firstName}`} subtitle="Project Lead dashboard — approvals, custody and accountability for your projects." actions={<Link href="/inventory/new" className="btn btn-outline"><Plus className="h-5 w-5" aria-hidden /> Add tool</Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pending approvals" value={stats.pending_requests} icon={ClipboardCheck} accent="yellow" href="/requests?tab=approvals" />
        <StatCard label="Transfers to review" value={stats.transfers_to_review} icon={ArrowLeftRight} accent="blue" href="/transfers" />
        <StatCard label="Overdue tools" value={stats.overdue} icon={AlertTriangle} accent={stats.overdue ? "red" : "default"} />
        <StatCard label="Available company-wide" value={stats.available} icon={CheckCircle2} accent="green" href="/catalog" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={`Pending approvals (${pending?.length ?? 0})`} action={<Link href="/requests?tab=approvals" className="link text-sm">Review all</Link>}>
          <RequestList rows={(pending ?? []) as Row[]} empty="Nothing waiting for your approval. 🎉" />
        </Section>
        <Section title="Transfers awaiting acknowledgment / review" action={<Link href="/transfers" className="link text-sm">All transfers</Link>}>
          <TransferList rows={(transfers ?? []) as Row[]} empty="No transfers need attention." />
        </Section>
        <Section title="Overdue tools">
          <CheckoutList rows={(overdue ?? []) as Row[]} empty="No overdue tools on your projects." />
        </Section>
        <Section title="Tools allocated to my projects">
          <CheckoutList rows={(allocated ?? []) as Row[]} empty="No tools checked out on your projects." />
        </Section>
      </div>
      <ProjectStats stats={stats} />
      <Section title="Recent project activity">
        <ActivityFeed items={(activity ?? []) as Row[]} />
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
async function CompanyDashboard({ firstName, role, stats }: { firstName: string; role: "admin" | "inventory_manager"; stats: DashboardStats }) {
  const supabase = await createClient();
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [{ data: pending }, { data: transfers }, { data: activity }, { data: catalog }, { data: attention }, { data: due }, { data: picks }] = await Promise.all([
    supabase.from("tool_requests").select(REQUEST_SELECT).eq("status", "pending").order("created_at").limit(6),
    supabase.from("transfers").select(TRANSFER_SELECT).order("created_at", { ascending: false }).limit(6),
    supabase.from("audit_logs").select(AUDIT_SELECT).order("created_at", { ascending: false }).limit(12),
    supabase.from("v_catalog").select("id, name, parent_code, available_units, total_units, min_stock_threshold").eq("is_archived", false),
    supabase.from("tool_units").select("id, unit_code, status, parent:parent_tools(name)").in("status", ["maintenance", "damaged", "missing"]).order("updated_at", { ascending: false }).limit(10),
    supabase.from("tool_units").select("id, unit_code, status, next_maintenance_due, parent:parent_tools(name)").lte("next_maintenance_due", soon).neq("status", "retired").order("next_maintenance_due").limit(8),
    supabase.from("pick_tickets").select(PICK_SELECT).eq("status", "open").order("created_at").limit(8),
  ]);
  const lowStock = ((catalog ?? []) as Row[]).filter((c) => c.available_units < c.min_stock_threshold).sort((a, b) => a.available_units - b.available_units);
  const im = role === "inventory_manager";

  return (
    <div className="space-y-5">
      <PageHeader
        title={im ? `Inventory control — ${firstName}` : `Company overview — ${firstName}`}
        subtitle={`${ROLE_LABEL[role]} dashboard · all projects`}
        actions={
          <>
            <Link href="/scanner" className="btn btn-primary"><ScanLine className="h-5 w-5" aria-hidden /> Check-out / Check-in</Link>
            <Link href="/inventory/new" className="btn btn-outline"><Plus className="h-5 w-5" aria-hidden /> Add tool</Link>
            {im && <Link href="/labels" className="btn btn-outline"><Tag className="h-5 w-5" aria-hidden /> Labels</Link>}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total tools" value={stats.total_tools} icon={Boxes} href="/inventory" />
        <StatCard label="Available" value={stats.available} icon={CheckCircle2} accent="green" href="/catalog?availability=available" />
        <StatCard label="Checked out" value={stats.checked_out} icon={PackageCheck} accent="blue" href="/reports?tab=checked_out" />
        <StatCard label="Pending requests" value={stats.pending_requests} icon={ClipboardCheck} accent="yellow" href="/requests?tab=approvals" />
        <StatCard label="Overdue" value={stats.overdue} icon={Clock} accent={stats.overdue ? "red" : "default"} href="/reports?tab=overdue" />
        <StatCard label="Needs attention" value={stats.attention} icon={Wrench} accent={stats.attention ? "red" : "default"} href="/reports?tab=attention" />
      </div>

      <Section title={`Pick tickets to fill (${(picks ?? []).length})`} action={<Link href="/pick-tickets" className="btn btn-primary btn-sm"><PackageCheck className="h-4 w-4" aria-hidden /> Open pick queue</Link>}>
        {(picks ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-500">No approved requests waiting to be picked.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {((picks ?? []) as Row[]).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0"><span className="font-mono font-bold">{t.ticket_number}</span> · <strong>{t.parent?.name}</strong> for {t.requester?.full_name} · {t.project?.name}</span>
                <span className="text-xs text-zinc-500">Pick from {t.pick_from ?? "tool crib"}{t.unit?.unit_code ? ` · ${t.unit.unit_code}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ProjectStats stats={stats} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Pending approvals" className="lg:col-span-1" action={<Link href="/requests?tab=approvals" className="link text-sm">All</Link>}>
          <RequestList rows={(pending ?? []) as Row[]} empty="No pending requests." />
        </Section>
        <Section title="Recent transfers" action={<Link href="/transfers" className="link text-sm">All</Link>}>
          <TransferList rows={(transfers ?? []) as Row[]} />
        </Section>
        <Section title="Low stock & maintenance alerts">
          <ul className="space-y-2 text-sm">
            {lowStock.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <Link href={`/catalog/${c.id}`} className="truncate font-semibold hover:underline">{c.name}</Link>
                <Badge tone={c.available_units === 0 ? "red" : "yellow"}>{c.available_units}/{c.total_units} avail.</Badge>
              </li>
            ))}
            {((attention ?? []) as Row[]).map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2">
                <Link href={`/units/${u.id}`} className="truncate font-semibold hover:underline"><span className="font-mono">{u.unit_code}</span> {u.parent?.name}</Link>
                <ToolStatusBadge status={u.status} />
              </li>
            ))}
            {((due ?? []) as Row[]).map((u) => (
              <li key={`due-${u.id}`} className="flex items-center justify-between gap-2">
                <Link href={`/units/${u.id}`} className="truncate font-semibold hover:underline"><span className="font-mono">{u.unit_code}</span> service due</Link>
                <Badge tone={u.next_maintenance_due < new Date().toISOString().slice(0, 10) ? "red" : "orange"}>{fmtDate(u.next_maintenance_due)}</Badge>
              </li>
            ))}
            {!lowStock.length && !(attention ?? []).length && !(due ?? []).length && <li className="py-4 text-center text-zinc-500">All clear.</li>}
          </ul>
        </Section>
      </div>
      <Section title="Recent activity" action={<Link href="/audit" className="link text-sm">Audit log</Link>}>
        <ActivityFeed items={(activity ?? []) as Row[]} />
      </Section>
    </div>
  );
}

function ProjectStats({ stats }: { stats: DashboardStats }) {
  if (!stats.by_project?.length) return null;
  return (
    <section aria-labelledby="by-project" className="card card-pad">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="by-project" className="text-base font-extrabold">Tools by project</h2>
        <PackageSearch className="h-5 w-5 text-zinc-400" aria-hidden />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.by_project.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="rounded-xl border-2 border-zinc-200 p-3 transition hover:border-brand-yellow dark:border-zinc-800">
            <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">{p.code}</div>
            <div className="font-extrabold">{p.name}</div>
            <dl className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
              <div><dt className="text-zinc-500">Out</dt><dd className="text-lg font-extrabold tabular-nums">{p.checked_out}</dd></div>
              <div><dt className="text-zinc-500">Home</dt><dd className="text-lg font-extrabold tabular-nums">{p.home_tools}</dd></div>
              <div><dt className="text-zinc-500">Requests</dt><dd className="text-lg font-extrabold tabular-nums">{p.open_requests}</dd></div>
            </dl>
          </Link>
        ))}
      </div>
    </section>
  );
}
