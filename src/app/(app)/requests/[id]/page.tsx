import Link from "next/link";
import { notFound } from "next/navigation";
import { ScanLine } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequestStatusBadge } from "@/components/ui/StatusBadge";
import { ToolImage } from "@/components/ToolImage";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Section } from "@/components/lists";
import { DecisionButtons, CancelRequestButton } from "@/components/tools/RequestActions";
import { AUDIT_SELECT, REQUEST_SELECT, type Row } from "@/lib/queries";
import { fmtDate, fmtDateTime } from "@/lib/utils";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("tool_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as Row;
  const [{ data: audit }, { data: queuePos }, { data: isLead }] = await Promise.all([
    supabase.from("audit_logs").select(AUDIT_SELECT).eq("entity_id", id).order("created_at"),
    supabase.rpc("request_queue_position", { p_request: id }),
    supabase.rpc("is_project_lead", { p_project: r.project_id }),
  ]);
  const mine = r.requester_id === profile.id;
  const canDecide = r.status === "pending" && !mine && (profile.role === "admin" || isLead === true);
  const canCancel = ["pending", "approved", "waitlisted"].includes(r.status) && (mine || profile.role === "admin" || profile.role === "inventory_manager" || isLead === true);

  return (
    <div className="space-y-5">
      <PageHeader back={{ href: "/requests", label: "Requests" }} title={`${r.request_number}`} subtitle={<RequestStatusBadge status={r.status} />} />

      {r.status === "approved" && (
        <div className="flex flex-col gap-3 rounded-2xl border-4 border-emerald-600 bg-emerald-50 p-5 dark:bg-emerald-950/40 sm:flex-row sm:items-center sm:justify-between" role="status">
          <div>
            <div className="text-lg font-extrabold text-emerald-900 dark:text-emerald-100">Ready for collection</div>
            <p className="text-sm text-emerald-900 dark:text-emerald-200">
              Unit <span className="font-mono font-bold">{r.unit?.unit_code}</span> is reserved until <strong>{fmtDateTime(r.reservation_expires_at)}</strong>. Scan its barcode to complete checkout.
            </p>
          </div>
          {(mine || profile.role !== "labor") && (
            <Link href={`/scanner?mode=collect&request=${r.id}`} className="btn btn-primary btn-lg shrink-0"><ScanLine className="h-6 w-6" aria-hidden /> Scan to collect</Link>
          )}
        </div>
      )}
      {queuePos ? (
        <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 p-4 text-sm font-semibold text-violet-950 dark:bg-violet-950/40 dark:text-violet-100" role="status">
          Queue position #{queuePos as number} — you&apos;ll be notified the moment a unit is reserved.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card card-pad space-y-4">
          <Link href={`/catalog/${r.parent?.id}`} className="flex items-center gap-3">
            <ToolImage src={r.parent?.image_url} alt="" className="h-20 w-20 shrink-0" />
            <div>
              <div className="text-xs font-bold uppercase text-zinc-500">{r.parent?.brand}</div>
              <div className="font-extrabold hover:underline">{r.parent?.name}</div>
              <div className="font-mono text-xs">{r.parent?.parent_code}</div>
            </div>
          </Link>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Requested by</dt><dd className="font-semibold">{r.requester?.full_name}</dd>
            <dt className="text-zinc-500">Project</dt><dd className="font-semibold"><Link className="link" href={`/projects/${r.project?.id}`}>{r.project?.name}</Link></dd>
            <dt className="text-zinc-500">Reason</dt><dd>{r.reason}</dd>
            {r.note && (<><dt className="text-zinc-500">Note</dt><dd>{r.note}</dd></>)}
            <dt className="text-zinc-500">Expected return</dt><dd className="font-semibold">{fmtDate(r.expected_return_date)}</dd>
            <dt className="text-zinc-500">Submitted</dt><dd>{fmtDateTime(r.created_at)}</dd>
            <dt className="text-zinc-500">Unit</dt><dd>{r.unit ? <Link href={`/units/${r.unit.id}`} className="font-mono font-bold hover:underline">{r.unit.unit_code}</Link> : "Not yet assigned"}</dd>
            {r.decider && (<><dt className="text-zinc-500">Decided by</dt><dd>{r.decider.full_name} · {fmtDateTime(r.decided_at)}</dd></>)}
            {r.decision_comment && (<><dt className="text-zinc-500">Comment</dt><dd className="italic">“{r.decision_comment}”</dd></>)}
          </dl>
          <div className="flex flex-wrap gap-2">
            {canDecide && <DecisionButtons requestId={r.id} requestNumber={r.request_number} toolName={r.parent?.name} requester={r.requester?.full_name} />}
            {canCancel && <CancelRequestButton requestId={r.id} requestNumber={r.request_number} />}
          </div>
        </div>
        <Section title="Timeline" className="lg:col-span-2">
          <ActivityFeed items={(audit ?? []) as Row[]} absolute />
        </Section>
      </div>
    </div>
  );
}
