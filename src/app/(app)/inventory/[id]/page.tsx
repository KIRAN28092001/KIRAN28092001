import Link from "next/link";
import { notFound } from "next/navigation";
import { Tag } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolStatusBadge, ConditionBadge } from "@/components/ui/StatusBadge";
import { Barcode } from "@/components/barcode/Barcode";
import { ParentToolForm } from "@/components/tools/ParentToolForm";
import { Section } from "@/components/lists";
import { InventoryAdmin } from "./InventoryAdmin";
import { fmtDate } from "@/lib/utils";
import type { Row } from "@/lib/queries";

export default async function InventoryDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const profile = await requireRole(["admin", "inventory_manager", "project_lead"]);
  const supabase = await createClient();
  const [{ data: tool }, { data: units }, { data: categories }, { data: projects }] = await Promise.all([
    supabase.from("parent_tools").select("*").eq("id", id).maybeSingle(),
    supabase.from("tool_units").select("id, unit_code, unit_number, serial_number, status, condition, location, next_maintenance_due, holder:profiles!tool_units_current_holder_id_fkey(full_name), project:projects!tool_units_current_project_id_fkey(name)").eq("parent_tool_id", id).order("unit_number"),
    supabase.from("tool_categories").select("id, name, code, image_url").order("name"),
    supabase.from("projects").select("id, name").order("name"),
  ]);
  if (!tool) notFound();
  const t = tool as Row;

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/inventory", label: "Inventory" }}
        title={t.name}
        subtitle={<><span className="font-mono font-bold">{t.parent_code}</span> · {t.brand} · {(units ?? []).length} units{t.is_archived ? " · ARCHIVED" : ""}</>}
        actions={<><Link href={`/labels?parent=${t.id}`} className="btn btn-primary"><Tag className="h-5 w-5" aria-hidden /> Print labels</Link><Link href={`/catalog/${t.id}`} className="btn btn-outline">Custody view</Link></>}
      />
      {created && <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-3 font-semibold text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100" role="status">Tool created. Every unit below has its own Code 128 barcode — print labels and stick them on before issuing.</div>}

      <Section title={`Individual units (${(units ?? []).length})`} action={<InventoryAdmin toolId={t.id} archived={t.is_archived} isAdmin={profile.role === "admin"} />}>
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="table">
            <thead><tr><th scope="col">Barcode</th><th scope="col">Unit</th><th scope="col">Serial</th><th scope="col">Status</th><th scope="col">Condition</th><th scope="col">Holder / location</th><th scope="col">Next service</th></tr></thead>
            <tbody>
              {((units ?? []) as Row[]).map((u) => (
                <tr key={u.id}>
                  <td className="w-44"><Link href={`/units/${u.id}`} aria-label={`Open unit ${u.unit_code}`}><Barcode value={u.unit_code} height={36} width={1.2} fontSize={11} className="h-auto w-40 rounded bg-white" /></Link></td>
                  <td><Link href={`/units/${u.id}`} className="font-mono font-bold hover:underline">{u.unit_code}</Link></td>
                  <td className="font-mono text-xs">{u.serial_number ?? "—"}</td>
                  <td><ToolStatusBadge status={u.status} /></td>
                  <td><ConditionBadge condition={u.condition} /></td>
                  <td className="text-sm">{u.holder?.full_name ? <>{u.holder.full_name}<div className="text-xs text-zinc-500">{u.project?.name}</div></> : u.location ?? "—"}</td>
                  <td className="whitespace-nowrap text-sm">{fmtDate(u.next_maintenance_due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <h2 className="text-lg font-extrabold">Tool details</h2>
      <ParentToolForm categories={(categories ?? []) as Row[]} projects={(projects ?? []) as Row[]} tool={t} />
    </div>
  );
}
