import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransferStatusBadge, ReviewBadge, ConditionBadge } from "@/components/ui/StatusBadge";
import { ToolImage } from "@/components/ToolImage";
import { ActivityFeed } from "@/components/ActivityFeed";
import { EvidencePhotos } from "@/components/EvidencePhotos";
import { Section } from "@/components/lists";
import { TransferActions } from "@/components/tools/TransferActions";
import { AUDIT_SELECT, TRANSFER_SELECT, type Row } from "@/lib/queries";
import { fmtDateTime } from "@/lib/utils";

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("transfers").select(TRANSFER_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const t = data as Row;
  const [{ data: audit }, { data: acks }, { data: isLead }] = await Promise.all([
    supabase.from("audit_logs").select(AUDIT_SELECT).eq("entity_id", id).order("created_at"),
    supabase.from("transfer_acknowledgments").select("id, method, scanned_code, accepted, comment, created_at, user:profiles(full_name)").eq("transfer_id", id),
    supabase.rpc("is_project_lead", { p_project: t.project_id }),
  ]);
  const pending = t.status === "pending_acknowledgment";
  const open = pending || t.status === "completed";
  const reviewer = profile.role === "admin" || isLead === true;

  return (
    <div className="space-y-5">
      <PageHeader back={{ href: "/transfers", label: "Transfers" }} title={t.transfer_number} subtitle={<span className="flex flex-wrap gap-2"><TransferStatusBadge status={t.status} /><ReviewBadge status={t.lead_review} /></span>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card card-pad space-y-4">
          <Link href={`/units/${t.unit?.id}`} className="flex items-center gap-3">
            <ToolImage src={t.unit?.parent?.image_url} alt="" className="h-20 w-20 shrink-0" />
            <div>
              <div className="font-extrabold hover:underline">{t.unit?.parent?.name}</div>
              <div className="font-mono font-bold">{t.unit?.unit_code}</div>
            </div>
          </Link>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-zinc-100 p-3 text-center text-sm dark:bg-zinc-800">
            <div><div className="text-xs text-zinc-500">From</div><div className="font-bold">{t.from_user?.full_name}</div></div>
            <div aria-hidden className="text-2xl">→</div>
            <div><div className="text-xs text-zinc-500">To</div><div className="font-bold">{t.to_user?.full_name}</div></div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Project</dt><dd className="font-semibold">{t.project?.name}</dd>
            <dt className="text-zinc-500">Reason</dt><dd>{t.reason}</dd>
            <dt className="text-zinc-500">Condition</dt><dd><ConditionBadge condition={t.condition_at_transfer} /></dd>
            {t.notes && (<><dt className="text-zinc-500">Notes</dt><dd>{t.notes}</dd></>)}
            <dt className="text-zinc-500">Initiated</dt><dd>{fmtDateTime(t.created_at)}</dd>
            {t.completed_at && (<><dt className="text-zinc-500">Received</dt><dd>{fmtDateTime(t.completed_at)}</dd></>)}
            {t.reviewer && (<><dt className="text-zinc-500">Reviewed</dt><dd>{t.reviewer.full_name} · {fmtDateTime(t.reviewed_at)}</dd></>)}
            {t.review_comment && (<><dt className="text-zinc-500">Comment</dt><dd className="italic">“{t.review_comment}”</dd></>)}
          </dl>
          {t.photo_urls?.length > 0 && <EvidencePhotos paths={t.photo_urls} />}
          {((acks ?? []) as Row[]).map((a) => (
            <p key={a.id} className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
              {a.accepted ? "Accepted" : "Declined"} by {a.user?.full_name} via {a.method === "scan" ? `barcode scan (${a.scanned_code})` : "in-app confirmation"} · {fmtDateTime(a.created_at)}{a.comment ? ` — “${a.comment}”` : ""}
            </p>
          ))}
          <TransferActions
            transferId={t.id}
            unitCode={t.unit?.unit_code}
            canAcknowledge={pending && t.to_user_id === profile.id}
            canReview={open && reviewer && t.lead_review === "pending"}
            canFlag={open && (reviewer || isStaff(profile.role)) && t.lead_review !== "flagged"}
            canCancel={pending && (t.from_user_id === profile.id || t.created_by === profile.id || isStaff(profile.role) || isLead === true)}
          />
        </div>
        <Section title="Transfer timeline" className="lg:col-span-2">
          <ActivityFeed items={(audit ?? []) as Row[]} absolute />
        </Section>
      </div>
    </div>
  );
}
