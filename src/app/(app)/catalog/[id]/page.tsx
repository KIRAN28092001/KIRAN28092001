import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Users } from "lucide-react";
import { getProfile, canManageTools, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolImage } from "@/components/ToolImage";
import { Badge } from "@/components/ui/Badge";
import { ToolStatusBadge, ConditionBadge, RequestStatusBadge } from "@/components/ui/StatusBadge";
import { RequestButton } from "@/components/tools/RequestButton";
import { Section } from "@/components/lists";
import { fmtDate, isOverdue, timeAgo } from "@/lib/utils";
import type { CatalogItem, Custody } from "@/lib/types";
import type { Row } from "@/lib/queries";

export default async function ToolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();
  const [{ data: tool }, { data: custodyData }, { data: memberships }, { data: allProjects }, { data: loan }, { data: myOpen }] = await Promise.all([
    supabase.from("v_catalog").select("*").eq("id", id).maybeSingle(),
    supabase.rpc("tool_custody", { p_parent: id }),
    supabase.from("project_members").select("project:projects(id, name, status)").eq("user_id", profile.id),
    supabase.from("projects").select("id, name, status").in("status", ["active", "planning"]).order("name"),
    supabase.from("app_settings").select("value").eq("key", "default_loan_days").maybeSingle(),
    supabase.from("tool_requests").select("id, request_number, status").eq("requester_id", profile.id).eq("parent_tool_id", id).in("status", ["pending", "approved", "waitlisted"]).maybeSingle(),
  ]);
  if (!tool) notFound();
  const t = tool as CatalogItem;
  const custody = (custodyData ?? { units: [], queue: [], full_access: false }) as Custody;
  const requestProjects = isStaff(profile.role)
    ? ((allProjects ?? []) as Row[]).map((p) => ({ id: p.id, name: p.name }))
    : ((memberships ?? []) as Row[]).map((m) => m.project).filter((p) => p && ["active", "planning"].includes(p.status)).map((p: Row) => ({ id: p.id, name: p.name }));
  const available = t.available_units > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/catalog", label: "Tool catalog" }}
        title={t.name}
        subtitle={<>{t.brand} · {t.category_name} · <span className="font-mono">{t.parent_code}</span>{t.model_number ? ` · Model ${t.model_number}` : ""}</>}
        actions={canManageTools(profile.role) ? <Link href={`/inventory/${t.id}`} className="btn btn-outline"><Pencil className="h-4 w-4" aria-hidden /> Manage</Link> : undefined}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card card-pad space-y-4 lg:col-span-1">
          <ToolImage src={t.image_url ?? t.category_image_url} alt={`${t.brand} ${t.name}`} className="aspect-square w-full" />
          <div className="flex flex-wrap gap-2">
            {available ? <Badge tone="green">{t.available_units} of {t.total_units} available</Badge> : <Badge tone="red">Unavailable</Badge>}
            {t.checked_out_units > 0 && <Badge tone="blue">{t.checked_out_units} checked out</Badge>}
            {t.reserved_units > 0 && <Badge tone="purple">{t.reserved_units} reserved/held</Badge>}
            {t.attention_units > 0 && <Badge tone="orange">{t.attention_units} in maintenance/damaged</Badge>}
          </div>
          {myOpen ? (
            <Link href={`/requests/${myOpen.id}`} className="btn btn-outline btn-lg w-full">
              You requested this ({myOpen.request_number}) <RequestStatusBadge status={myOpen.status} />
            </Link>
          ) : (
            <RequestButton
              target={{ id: t.id, name: t.name, brand: t.brand, parent_code: t.parent_code, available_units: t.available_units }}
              projects={requestProjects}
              loanDays={Number(loan?.value ?? 7)}
              label={available ? "Request this tool" : "Unavailable — join queue"}
              className={`btn btn-lg w-full ${available ? "btn-primary" : "btn-outline"}`}
            />
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt className="text-zinc-500">Home project</dt><dd className="font-semibold">{t.home_project_name ?? "—"}</dd>
            <dt className="text-zinc-500">Storage</dt><dd className="font-semibold">{t.storage_location ?? "—"}</dd>
            <dt className="text-zinc-500">Times requested</dt><dd className="font-semibold">{t.times_requested}</dd>
            {t.maintenance_interval_days && (<><dt className="text-zinc-500">Service interval</dt><dd className="font-semibold">{t.maintenance_interval_days} days</dd></>)}
          </dl>
          {t.description && <p className="text-sm text-zinc-700 dark:text-zinc-300">{t.description}</p>}
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Section title={`Units & custody (${custody.units.length})`}>
            {!custody.full_access && <p className="mb-2 text-xs text-zinc-500">Names are shown for crew on your projects.</p>}
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="table">
                <thead>
                  <tr><th scope="col">Unit</th><th scope="col">Status</th><th scope="col">Held by / project</th><th scope="col">Out since</th><th scope="col">Due back</th></tr>
                </thead>
                <tbody>
                  {custody.units.map((u) => (
                    <tr key={u.id} className={u.is_mine ? "bg-brand-yellow/10" : undefined}>
                      <td>
                        <Link href={`/units/${u.id}`} className="font-mono font-bold hover:underline">{u.unit_code}</Link>
                        <div className="mt-1"><ConditionBadge condition={u.condition} /></div>
                      </td>
                      <td><ToolStatusBadge status={u.status} />{u.reserved_until && <div className="mt-1 text-xs text-zinc-500">until {fmtDate(u.reserved_until, { hour: "numeric", minute: "2-digit" })}</div>}</td>
                      <td>
                        {u.holder_name ? <div className="font-semibold">{u.is_mine ? "You" : u.holder_name}</div> : <div className="text-zinc-500">{u.location ?? "In stock"}</div>}
                        {u.project_name && u.holder_name && <div className="text-xs text-zinc-500">{u.project_name}</div>}
                        {u.approved_by && <div className="text-xs text-zinc-500">Approved by {u.approved_by}</div>}
                      </td>
                      <td className="whitespace-nowrap">{u.checked_out_at ? fmtDate(u.checked_out_at) : "—"}</td>
                      <td className={`whitespace-nowrap ${isOverdue(u.expected_return_date) ? "font-bold text-red-700 dark:text-red-400" : ""}`}>
                        {u.expected_return_date ? fmtDate(u.expected_return_date) : "—"}
                        {isOverdue(u.expected_return_date) && <div className="text-xs">Overdue</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Request queue (${custody.queue.length})`} action={<Users className="h-5 w-5 text-zinc-400" aria-hidden />}>
            {custody.queue.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">Nobody is waiting for this tool.</p>
            ) : (
              <ol className="space-y-2">
                {custody.queue.map((qe) => (
                  <li key={qe.position} className={`flex items-center gap-3 rounded-xl border-2 p-3 ${qe.is_mine ? "border-brand-yellow bg-brand-yellow/10" : "border-zinc-200 dark:border-zinc-800"}`}>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-charcoal font-extrabold text-brand-yellow">#{qe.position}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{qe.is_mine ? "You" : qe.requester_name}{qe.request_number ? ` · ${qe.request_number}` : ""}</div>
                      <div className="text-xs text-zinc-500">{qe.project_name} · {timeAgo(qe.created_at)}</div>
                    </div>
                    <RequestStatusBadge status={qe.status} />
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
