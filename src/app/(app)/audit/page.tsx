import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ReportTable } from "../reports/ReportTable";
import { AUDIT_SELECT, type Row } from "@/lib/queries";
import { cn, fmtDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit Log" };
const PAGE = 50;

const ENTITY_TYPES = ["tool_request", "checkout", "transfer", "return", "maintenance", "tool_unit", "parent_tools", "projects", "project_members", "profiles", "profile", "barcode_label", "app_settings", "tool_categories"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireRole(["admin", "inventory_manager", "project_lead"]);
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page ?? 1));
  const view = sp.view === "table" ? "table" : "timeline";

  let q = supabase.from("audit_logs").select(AUDIT_SELECT, { count: "exact" }).order("created_at", { ascending: false });
  if (sp.entity) q = q.eq("entity_type", sp.entity);
  if (sp.q) q = q.ilike("summary", `%${sp.q.replace(/[%_]/g, "")}%`);
  if (sp.from) q = q.gte("created_at", sp.from);
  if (sp.to) q = q.lte("created_at", `${sp.to}T23:59:59`);
  const { data, count } = await q.range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as Row[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
    return `/audit?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Audit Log" subtitle={`${count ?? 0} immutable events · every request, approval, custody change and edit is recorded`} />
      <form action="/audit" className="card card-pad grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="view" value={view} />
        <div className="lg:col-span-2"><label htmlFor="a-q" className="label">Search</label><input id="a-q" name="q" defaultValue={sp.q} className="input" placeholder="Unit code, name, request #…" /></div>
        <div><label htmlFor="a-e" className="label">Record type</label>
          <select id="a-e" name="entity" defaultValue={sp.entity ?? ""} className="input"><option value="">All types</option>{ENTITY_TYPES.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}</select></div>
        <div><label htmlFor="a-f" className="label">From</label><input id="a-f" type="date" name="from" defaultValue={sp.from} className="input" /></div>
        <div><label htmlFor="a-t" className="label">To</label><input id="a-t" type="date" name="to" defaultValue={sp.to} className="input" /></div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <button className="btn btn-primary">Filter</button>
          <Link href="/audit" className="btn btn-ghost">Reset</Link>
          <span className="flex-1" />
          <Link href={qs({ view: "timeline", page: 1 })} className={cn("chip", view === "timeline" ? "border-brand-yellow bg-brand-yellow text-black" : "border-zinc-300 dark:border-zinc-700")}>Timeline</Link>
          <Link href={qs({ view: "table", page: 1 })} className={cn("chip", view === "table" ? "border-brand-yellow bg-brand-yellow text-black" : "border-zinc-300 dark:border-zinc-700")}>Table / export</Link>
        </div>
      </form>

      {view === "timeline" ? (
        <div className="card card-pad"><ActivityFeed items={rows} absolute empty="No audit events match." /></div>
      ) : (
        <ReportTable
          report={{
            title: "Audit log",
            description: `Page ${page} of ${pages}`,
            columns: ["When", "Actor", "Action", "Record", "Summary", "Details"],
            rows: rows.map((a) => [fmtDateTime(a.created_at), a.actor?.full_name ?? "System", a.action, a.entity_type, a.summary, JSON.stringify(a.details).slice(0, 200)]),
          }}
        />
      )}

      <nav className="flex items-center justify-between" aria-label="Pagination">
        {page > 1 ? <Link className="btn btn-outline" href={qs({ page: page - 1 })}>← Newer</Link> : <span />}
        <span className="text-sm font-semibold">Page {page} of {pages}</span>
        {page < pages ? <Link className="btn btn-outline" href={qs({ page: page + 1 })}>Older →</Link> : <span />}
      </nav>
    </div>
  );
}
