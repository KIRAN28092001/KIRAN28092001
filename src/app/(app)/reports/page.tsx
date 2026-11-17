import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReportTable, type Report } from "./ReportTable";
import { CHECKOUT_SELECT, REQUEST_SELECT, TRANSFER_SELECT, type Row } from "@/lib/queries";
import { cn, fmtDate, fmtDateTime, STATUS_META, REQUEST_META, TRANSFER_META, REVIEW_META } from "@/lib/utils";
import type { ToolStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Reports" };

const TABS = [
  ["availability", "Availability"],
  ["checked_out", "Checked out by employee"],
  ["utilization", "Utilization"],
  ["overdue", "Overdue"],
  ["attention", "Missing / damaged / maintenance"],
  ["transfers", "Transfer history"],
  ["requests", "Requests by project & employee"],
] as const;

const days = (a: string, b?: string | null) => Math.max(0, Math.round(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 864e5));

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; project?: string }> }) {
  const sp = await searchParams;
  const profile = await requireRole(["admin", "inventory_manager", "project_lead"]);
  const supabase = await createClient();
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "availability") as (typeof TABS)[number][0];
  const { data: projectsData } = await supabase.from("projects").select("id, name").order("name");
  const projects = (projectsData ?? []) as Row[];
  let projectIds: string[] | null = null;
  if (profile.role === "project_lead") {
    const { data } = await supabase.from("project_members").select("project_id").eq("user_id", profile.id).eq("member_role", "lead");
    projectIds = ((data ?? []) as Row[]).map((d) => d.project_id);
  }
  const project = sp.project && sp.project !== "all" ? sp.project : null;
  const scope = (q: Row): Row => {
    if (project) return q.eq("project_id", project);
    if (projectIds) return q.in("project_id", projectIds.length ? projectIds : ["00000000-0000-0000-0000-000000000000"]);
    return q;
  };

  let report: Report;
  const today = new Date().toISOString().slice(0, 10);

  if (tab === "availability") {
    const [{ data: cat }, { data: units }] = await Promise.all([
      supabase.from("v_catalog").select("*").eq("is_archived", false),
      supabase.from("tool_units").select("status, current_project_id, parent:parent_tools(home_project_id, category:tool_categories(name))").neq("status", "retired"),
    ]);
    const rows = (units ?? []) as Row[];
    const pid = project;
    const filtered = pid ? rows.filter((u) => u.current_project_id === pid || u.parent?.home_project_id === pid) : rows;
    const byCat = new Map<string, Record<string, number>>();
    for (const u of filtered) {
      const k = u.parent?.category?.name ?? "Other";
      const m = byCat.get(k) ?? {};
      m[u.status] = (m[u.status] ?? 0) + 1;
      m.total = (m.total ?? 0) + 1;
      byCat.set(k, m);
    }
    const statuses: ToolStatus[] = ["available", "reserved", "pending_approval", "checked_out", "in_transfer", "maintenance", "damaged", "missing"];
    report = {
      title: "Inventory availability by tool type",
      description: pid ? `Units based at or deployed to ${projects.find((p) => p.id === pid)?.name}` : "All active units, grouped by category",
      columns: ["Category", "Total", ...statuses.map((s) => STATUS_META[s].label), "Availability %"],
      rows: [...byCat.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, m]) => [k, m.total, ...statuses.map((s) => m[s] ?? 0), `${Math.round(((m.available ?? 0) / m.total) * 100)}%`]),
      summary: [
        { label: "Tool types", value: (cat ?? []).length },
        { label: "Units", value: filtered.length },
        { label: "Available", value: filtered.filter((u) => u.status === "available").length },
        { label: "Below min. stock", value: ((cat ?? []) as Row[]).filter((c) => c.available_units < c.min_stock_threshold).length },
      ],
    };
  } else if (tab === "checked_out" || tab === "overdue") {
    let q = scope(supabase.from("checkouts").select(CHECKOUT_SELECT).eq("status", "active"));
    if (tab === "overdue") q = q.lt("expected_return_date", today);
    const { data } = await q.order("expected_return_date");
    const rows = ((data ?? []) as Row[]).sort((a, b) => (a.holder?.full_name ?? "").localeCompare(b.holder?.full_name ?? ""));
    report = {
      title: tab === "overdue" ? "Overdue tools" : "Tools currently checked out by employee",
      description: tab === "overdue" ? "Active checkouts past their expected return date" : "Every unit in someone's custody right now",
      columns: ["Employee", "Tool", "Unit", "Project", "Checked out", "Due back", tab === "overdue" ? "Days overdue" : "Days out", "Approved by"],
      rows: rows.map((c) => [c.holder?.full_name, c.unit?.parent?.name, c.unit?.unit_code, c.project?.name, fmtDate(c.checked_out_at), fmtDate(c.expected_return_date), tab === "overdue" ? days(c.expected_return_date) : days(c.checked_out_at), c.approver?.full_name ?? "Direct issue"]),
      summary: [
        { label: "Units out", value: rows.length },
        { label: "Employees", value: new Set(rows.map((r) => r.holder_id)).size },
        { label: "Projects", value: new Set(rows.map((r) => r.project_id)).size },
        { label: "Avg days out", value: rows.length ? Math.round(rows.reduce((s, c) => s + days(c.checked_out_at), 0) / rows.length) : 0 },
      ],
    };
  } else if (tab === "utilization") {
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    const [{ data: co }, { data: cat }] = await Promise.all([
      scope(supabase.from("checkouts").select("checked_out_at, returned_at, project_id, holder_id, unit:tool_units!checkouts_unit_id_fkey(parent_tool_id)").gte("checked_out_at", since)),
      supabase.from("v_catalog").select("id, name, parent_code, category_name, total_units, times_requested"),
    ]);
    const agg = new Map<string, { n: number; d: number; people: Set<string> }>();
    for (const c of (co ?? []) as Row[]) {
      const k = c.unit?.parent_tool_id;
      if (!k) continue;
      const a = agg.get(k) ?? { n: 0, d: 0, people: new Set<string>() };
      a.n++;
      a.d += Math.max(1, days(c.checked_out_at, c.returned_at));
      a.people.add(c.holder_id);
      agg.set(k, a);
    }
    const rows = ((cat ?? []) as Row[]).map((t) => {
      const a = agg.get(t.id) ?? { n: 0, d: 0, people: new Set() };
      const util = t.total_units ? Math.min(100, Math.round((a.d / (t.total_units * 90)) * 100)) : 0;
      return { t, a, util };
    });
    rows.sort((x, y) => y.util - x.util || y.a.n - x.a.n);
    report = {
      title: "Tool utilization (last 90 days)",
      description: "Checkouts, custody days and utilization rate (custody days ÷ unit-days available)",
      columns: ["Tool", "Parent code", "Category", "Units", "Checkouts", "Custody days", "Distinct users", "Times requested", "Utilization"],
      rows: rows.map(({ t, a, util }) => [t.name, t.parent_code, t.category_name, t.total_units, a.n, a.d, a.people.size, t.times_requested, `${util}%`]),
      summary: [
        { label: "Checkouts (90d)", value: (co ?? []).length },
        { label: "Never used", value: rows.filter((r) => r.a.n === 0).length },
        { label: "Highest utilization", value: rows[0] ? `${rows[0].util}%` : "—" },
        { label: "Avg utilization", value: rows.length ? `${Math.round(rows.reduce((s, r) => s + r.util, 0) / rows.length)}%` : "—" },
      ],
    };
  } else if (tab === "attention") {
    const { data } = await supabase
      .from("tool_units")
      .select("id, unit_code, status, condition, updated_at, location, parent:parent_tools(name, purchase_value), project:projects!tool_units_current_project_id_fkey(id, name)")
      .in("status", ["missing", "damaged", "maintenance"])
      .order("status");
    let rows = (data ?? []) as Row[];
    if (project) rows = rows.filter((u) => u.project?.id === project);
    report = {
      title: "Missing, damaged & maintenance tools",
      description: "Units blocked from checkout until cleared",
      columns: ["Unit", "Tool", "Status", "Condition", "Project", "Location", "Since", "Replacement value"],
      rows: rows.map((u) => [u.unit_code, u.parent?.name, STATUS_META[u.status as ToolStatus].label, u.condition.replace(/_/g, " "), u.project?.name ?? "—", u.location, fmtDate(u.updated_at), u.parent?.purchase_value ? `$${Number(u.parent.purchase_value).toFixed(2)}` : "—"]),
      summary: [
        { label: "Missing", value: rows.filter((r) => r.status === "missing").length },
        { label: "Damaged", value: rows.filter((r) => r.status === "damaged").length },
        { label: "In maintenance", value: rows.filter((r) => r.status === "maintenance").length },
        { label: "Value at risk", value: `$${rows.filter((r) => r.status !== "maintenance").reduce((s, r) => s + Number(r.parent?.purchase_value ?? 0), 0).toFixed(0)}` },
      ],
    };
  } else if (tab === "transfers") {
    const { data } = await scope(supabase.from("transfers").select(TRANSFER_SELECT)).order("created_at", { ascending: false }).limit(500);
    const rows = (data ?? []) as Row[];
    report = {
      title: "Transfer history",
      description: "Complete chain of tool handoffs between employees",
      columns: ["Transfer", "Date", "Unit", "Tool", "From", "To", "Project", "Condition", "Status", "Lead review"],
      rows: rows.map((t) => [t.transfer_number, fmtDateTime(t.created_at), t.unit?.unit_code, t.unit?.parent?.name, t.from_user?.full_name, t.to_user?.full_name, t.project?.name, t.condition_at_transfer.replace(/_/g, " "), TRANSFER_META[t.status as keyof typeof TRANSFER_META].label, REVIEW_META[t.lead_review as keyof typeof REVIEW_META].label]),
      summary: [
        { label: "Transfers", value: rows.length },
        { label: "Completed", value: rows.filter((r) => r.status === "completed").length },
        { label: "Pending receipt", value: rows.filter((r) => r.status === "pending_acknowledgment").length },
        { label: "Flagged", value: rows.filter((r) => r.lead_review === "flagged").length },
      ],
    };
  } else {
    const { data } = await scope(supabase.from("tool_requests").select(REQUEST_SELECT)).order("created_at", { ascending: false }).limit(1000);
    const rows = (data ?? []) as Row[];
    const agg = new Map<string, Record<string, number | string>>();
    for (const r of rows) {
      const k = `${r.project?.name}|${r.requester?.full_name}`;
      const m: Record<string, number | string> = agg.get(k) ?? { project: r.project?.name, employee: r.requester?.full_name, total: 0 };
      m.total = (m.total as number) + 1;
      m[r.status] = ((m[r.status] as number) ?? 0) + 1;
      agg.set(k, m);
    }
    const statuses = Object.keys(REQUEST_META) as (keyof typeof REQUEST_META)[];
    report = {
      title: "Requests by project and employee",
      description: "Request volume and outcomes",
      columns: ["Project", "Employee", "Total", ...statuses.map((s) => REQUEST_META[s].label)],
      rows: [...agg.values()].sort((a, b) => String(a.project).localeCompare(String(b.project)) || (b.total as number) - (a.total as number)).map((m) => [m.project as string, m.employee as string, m.total as number, ...statuses.map((s) => (m[s] as number) ?? 0)]),
      summary: [
        { label: "Requests", value: rows.length },
        { label: "Pending", value: rows.filter((r) => r.status === "pending").length },
        { label: "Approval rate", value: rows.length ? `${Math.round((rows.filter((r) => ["approved", "fulfilled", "waitlisted"].includes(r.status)).length / Math.max(1, rows.filter((r) => r.status !== "pending" && r.status !== "cancelled").length)) * 100)}%` : "—" },
        { label: "Employees", value: new Set(rows.map((r) => r.requester_id)).size },
      ],
    };
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Reports" subtitle={profile.role === "project_lead" ? "Scoped to your projects" : "Company-wide"} />
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Reports">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/reports?tab=${k}${project ? `&project=${project}` : ""}`} aria-current={tab === k ? "page" : undefined} className={cn("chip shrink-0", tab === k ? "border-brand-charcoal bg-brand-charcoal text-white dark:border-brand-yellow dark:bg-brand-yellow dark:text-black" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900")}>{l}</Link>
        ))}
      </nav>
      <form className="flex flex-wrap items-end gap-2" action="/reports">
        <input type="hidden" name="tab" value={tab} />
        <div>
          <label htmlFor="rp-project" className="label">Project</label>
          <select id="rp-project" name="project" defaultValue={project ?? "all"} className="input min-w-[200px]">
            <option value="all">{profile.role === "project_lead" ? "All my projects" : "All projects"}</option>
            {projects.filter((p) => !projectIds || projectIds.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button className="btn btn-outline">Apply</button>
      </form>
      <ReportTable report={report} />
    </div>
  );
}
