import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, RotateCcw } from "lucide-react";
import { getProfile, canManageTools, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ToolStatusBadge, ConditionBadge, TransferStatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Barcode } from "@/components/barcode/Barcode";
import { ToolImage } from "@/components/ToolImage";
import { ActivityFeed } from "@/components/ActivityFeed";
import { EvidencePhotos } from "@/components/EvidencePhotos";
import { Section } from "@/components/lists";
import { UnitActions } from "@/components/tools/UnitActions";
import { AUDIT_SELECT, CHECKOUT_SELECT, TRANSFER_SELECT, type Row } from "@/lib/queries";
import { fmtDate, fmtDateTime, isOverdue, money } from "@/lib/utils";

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();
  const { data: unit } = await supabase
    .from("tool_units")
    .select("*, parent:parent_tools(id, name, brand, parent_code, image_url, model_number, maintenance_interval_days), holder:profiles!tool_units_current_holder_id_fkey(id, full_name), project:projects!tool_units_current_project_id_fkey(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (!unit) notFound();
  const u = unit as Row;
  const [{ data: audit }, { data: checkouts }, { data: transfers }, { data: returns }, { data: maintenance }, { data: org }] = await Promise.all([
    supabase.from("audit_logs").select(AUDIT_SELECT).eq("unit_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("checkouts").select(CHECKOUT_SELECT).eq("unit_id", id).order("checked_out_at", { ascending: false }),
    supabase.from("transfers").select(TRANSFER_SELECT).eq("unit_id", id).order("created_at", { ascending: false }),
    supabase.from("returns").select("id, condition, notes, photo_urls, created_at, returned_by:profiles!returns_returned_by_fkey(full_name)").eq("unit_id", id).order("created_at", { ascending: false }),
    supabase.from("maintenance_records").select("*, opener:profiles!maintenance_records_opened_by_fkey(full_name), completer:profiles!maintenance_records_completed_by_fkey(full_name)").eq("unit_id", id).order("opened_at", { ascending: false }),
    supabase.from("app_settings").select("value").eq("key", "organization_name").maybeSingle(),
  ]);
  const active = ((checkouts ?? []) as Row[]).find((c) => c.status === "active");
  const mine = u.current_holder_id === profile.id;
  const manage = canManageTools(profile.role);
  const openMaint = ((maintenance ?? []) as Row[]).filter((m) => m.status === "open" || m.status === "in_progress");

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: `/catalog/${u.parent?.id}`, label: u.parent?.name }}
        title={u.unit_code}
        subtitle={<>{u.parent?.brand} {u.parent?.name} · Unit #{u.unit_number}</>}
        actions={
          mine && u.status === "checked_out" ? (
            <>
              <Link href={`/scanner?mode=return&code=${encodeURIComponent(u.unit_code)}`} className="btn btn-primary"><RotateCcw className="h-5 w-5" aria-hidden /> Return</Link>
              <Link href={`/transfers/new?code=${encodeURIComponent(u.unit_code)}`} className="btn btn-outline"><ArrowLeftRight className="h-5 w-5" aria-hidden /> Transfer</Link>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <div className="card card-pad space-y-4">
            <div className="flex items-center gap-3">
              <ToolImage src={u.parent?.image_url} alt="" className="h-20 w-20 shrink-0" />
              <div className="flex flex-wrap gap-2">
                <ToolStatusBadge status={u.status} />
                <ConditionBadge condition={u.condition} />
              </div>
            </div>
            <div className="rounded-xl border-2 border-zinc-200 bg-white p-2 dark:border-zinc-700">
              <Barcode value={u.unit_code} className="mx-auto h-auto w-full max-w-xs" />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-zinc-500">Parent code</dt><dd className="font-mono">{u.parent?.parent_code}</dd>
              <dt className="text-zinc-500">Serial</dt><dd className="font-mono">{u.serial_number ?? "—"}</dd>
              <dt className="text-zinc-500">Location</dt><dd>{u.location ?? "—"}</dd>
              <dt className="text-zinc-500">Holder</dt><dd className="font-semibold">{u.holder?.full_name ?? (u.current_holder_id ? "Crew member" : "—")}</dd>
              <dt className="text-zinc-500">Project</dt><dd>{u.project ? <Link className="link" href={`/projects/${u.project.id}`}>{u.project.name}</Link> : "—"}</dd>
              {active && (<><dt className="text-zinc-500">Checked out</dt><dd>{fmtDateTime(active.checked_out_at)}</dd>
                <dt className="text-zinc-500">Approved by</dt><dd>{active.approver?.full_name ?? "—"}</dd>
                <dt className="text-zinc-500">Due back</dt><dd className={isOverdue(active.expected_return_date) ? "font-bold text-red-700 dark:text-red-400" : "font-semibold"}>{fmtDate(active.expected_return_date)}{isOverdue(active.expected_return_date) ? " (overdue)" : ""}</dd></>)}
              {u.reserved_until && (<><dt className="text-zinc-500">Reserved until</dt><dd>{fmtDateTime(u.reserved_until)}</dd></>)}
              <dt className="text-zinc-500">Last service</dt><dd>{fmtDate(u.last_maintenance_at)}</dd>
              <dt className="text-zinc-500">Next service</dt><dd className={isOverdue(u.next_maintenance_due) ? "font-bold text-red-700 dark:text-red-400" : ""}>{fmtDate(u.next_maintenance_due)}</dd>
            </dl>
            {u.notes && <p className="rounded-lg bg-zinc-100 p-2 text-sm dark:bg-zinc-800">{u.notes}</p>}
            {manage && <UnitActions unit={u} openMaintenance={openMaint} isStaff={isStaff(profile.role)} org={String(org?.value ?? "")} />}
          </div>

          <Section title="Maintenance history">
            {(maintenance ?? []).length === 0 ? <p className="py-3 text-sm text-zinc-500">No maintenance recorded.</p> : (
              <ul className="space-y-3">
                {((maintenance ?? []) as Row[]).map((m) => (
                  <li key={m.id} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                    <div className="flex items-center justify-between gap-2"><span className="font-bold capitalize">{m.type}</span><Badge tone={m.status === "completed" ? "green" : "orange"}>{m.status}</Badge></div>
                    <p className="mt-1">{m.description}</p>
                    {m.resolution && <p className="mt-1 text-zinc-600 dark:text-zinc-400">✔ {m.resolution}</p>}
                    <p className="mt-1 text-xs text-zinc-500">Opened {fmtDate(m.opened_at)} by {m.opener?.full_name ?? "—"}{m.completed_at ? ` · closed ${fmtDate(m.completed_at)}` : ""}{m.cost ? ` · ${money(Number(m.cost))}` : ""}{m.vendor ? ` · ${m.vendor}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Section title="Activity timeline">
            <ActivityFeed items={(audit ?? []) as Row[]} absolute empty="No activity visible to you." />
          </Section>

          <Section title="Custody chain">
            {(checkouts ?? []).length === 0 ? <p className="py-3 text-sm text-zinc-500">This unit has never been checked out{profile.role === "labor" ? " by you" : ""}.</p> : (
              <ol className="space-y-2">
                {((checkouts ?? []) as Row[]).map((c, i) => (
                  <li key={c.id} className="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-charcoal text-xs font-bold text-brand-yellow">{(checkouts ?? []).length - i}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{c.holder?.full_name} <span className="font-normal text-zinc-500">· {c.project?.name}</span></div>
                      <div className="text-xs text-zinc-600 dark:text-zinc-400">{fmtDateTime(c.checked_out_at)} → {c.returned_at ? fmtDateTime(c.returned_at) : "now"} · due {fmtDate(c.expected_return_date)}{c.approver ? ` · approved by ${c.approver.full_name}` : ""}</div>
                      {c.notes && <div className="text-xs italic text-zinc-500">{c.notes}</div>}
                    </div>
                    <Badge tone={c.status === "active" ? "blue" : c.status === "returned" ? "green" : "orange"} dot={false}>{c.status}</Badge>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          {(transfers ?? []).length > 0 && (
            <Section title="Transfers">
              <ul className="space-y-2">
                {((transfers ?? []) as Row[]).map((t) => (
                  <li key={t.id}><Link href={`/transfers/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 p-3 text-sm hover:border-brand-yellow dark:border-zinc-800">
                    <span><strong>{t.transfer_number}</strong> · {t.from_user?.full_name} → {t.to_user?.full_name} · {fmtDate(t.created_at)}</span>
                    <TransferStatusBadge status={t.status} />
                  </Link></li>
                ))}
              </ul>
            </Section>
          )}

          {(returns ?? []).length > 0 && (
            <Section title="Returns & condition reports">
              <ul className="space-y-3">
                {((returns ?? []) as Row[]).map((r) => (
                  <li key={r.id} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                    <div className="flex items-center justify-between gap-2"><span className="font-semibold">{r.returned_by?.full_name} · {fmtDateTime(r.created_at)}</span><ConditionBadge condition={r.condition} /></div>
                    {r.notes && <p className="mt-1">{r.notes}</p>}
                    {r.photo_urls?.length > 0 && <div className="mt-2"><EvidencePhotos paths={r.photo_urls} /></div>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
