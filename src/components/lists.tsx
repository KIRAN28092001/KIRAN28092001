import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { RequestStageBadge, TransferStatusBadge, ReviewBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { ToolImage } from "@/components/ToolImage";
import { fmtDate, isOverdue, timeAgo } from "@/lib/utils";
import type { Row } from "@/lib/queries";

export function RequestList({ rows, showRequester = true, empty = "No requests." }: { rows: Row[]; showRequester?: boolean; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/requests/${r.id}`} className="flex items-center gap-3 rounded-xl px-1 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <ToolImage src={r.parent?.image_url} alt="" className="h-12 w-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-bold">{r.parent?.name}</span>
                <RequestStageBadge status={r.status} pick={r.pick} />
              </div>
              <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                {r.request_number} · {r.project?.name}
                {showRequester && r.requester ? ` · ${r.requester.full_name}` : ""} · {timeAgo(r.created_at)}
                {r.unit?.unit_code ? ` · ${r.unit.unit_code}` : ""}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CheckoutList({ rows, showHolder = true, empty = "Nothing checked out." }: { rows: Row[]; showHolder?: boolean; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.map((c) => {
        const overdue = c.status === "active" && isOverdue(c.expected_return_date);
        return (
          <li key={c.id}>
            <Link href={`/units/${c.unit?.id}`} className="flex items-center gap-3 rounded-xl px-1 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <ToolImage src={c.unit?.parent?.image_url} alt="" className="h-12 w-12 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-bold">{c.unit?.parent?.name}</span>
                  {overdue && <Badge tone="red">Overdue</Badge>}
                  {c.unit?.status === "in_transfer" && <Badge tone="orange">In Transfer</Badge>}
                </div>
                <p className="truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">{c.unit?.unit_code}</p>
                <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                  {showHolder && c.holder ? `${c.holder.full_name} · ` : ""}
                  {c.project?.name} ·{" "}
                  <span className={overdue ? "font-bold text-red-700 dark:text-red-400" : ""}>
                    <CalendarClock className="inline h-3 w-3" aria-hidden /> due {fmtDate(c.expected_return_date)}
                  </span>
                </p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function TransferList({ rows, empty = "No transfers." }: { rows: Row[]; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.map((t) => (
        <li key={t.id}>
          <Link href={`/transfers/${t.id}`} className="flex items-center gap-3 rounded-xl px-1 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <ToolImage src={t.unit?.parent?.image_url} alt="" className="h-12 w-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-bold">{t.unit?.parent?.name}</span>
                <TransferStatusBadge status={t.status} />
                {t.lead_review !== "pending" && <ReviewBadge status={t.lead_review} />}
              </div>
              <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                {t.transfer_number} · <span className="font-mono">{t.unit?.unit_code}</span> · {t.from_user?.full_name ?? "—"} → {t.to_user?.full_name ?? "—"} · {timeAgo(t.created_at)}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Section({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card card-pad ${className}`} aria-labelledby={`sec-${title.replace(/\W+/g, "-")}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id={`sec-${title.replace(/\W+/g, "-")}`} className="text-base font-extrabold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
