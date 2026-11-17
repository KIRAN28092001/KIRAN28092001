import Link from "next/link";
import {
  ArrowLeftRight, CheckCircle2, ClipboardList, PackageCheck, PackagePlus, RotateCcw, ShieldAlert, Wrench, XCircle, Tag, Pencil, Clock,
  type LucideIcon,
} from "lucide-react";
import { fmtDateTime, timeAgo } from "@/lib/utils";
import type { AuditRow } from "@/lib/types";

const ICON: Record<string, { icon: LucideIcon; color: string }> = {
  request_submitted: { icon: ClipboardList, color: "bg-amber-100 text-amber-800" },
  request_approved: { icon: CheckCircle2, color: "bg-emerald-100 text-emerald-800" },
  request_rejected: { icon: XCircle, color: "bg-red-100 text-red-800" },
  request_cancelled: { icon: XCircle, color: "bg-zinc-200 text-zinc-700" },
  checked_out: { icon: PackageCheck, color: "bg-sky-100 text-sky-800" },
  returned: { icon: RotateCcw, color: "bg-emerald-100 text-emerald-800" },
  transfer_initiated: { icon: ArrowLeftRight, color: "bg-orange-100 text-orange-800" },
  transfer_completed: { icon: ArrowLeftRight, color: "bg-emerald-100 text-emerald-800" },
  transfer_flagged: { icon: ShieldAlert, color: "bg-red-100 text-red-800" },
  transfer_rejected: { icon: XCircle, color: "bg-red-100 text-red-800" },
  maintenance_opened: { icon: Wrench, color: "bg-orange-100 text-orange-800" },
  maintenance_completed: { icon: Wrench, color: "bg-emerald-100 text-emerald-800" },
  unit_created: { icon: PackagePlus, color: "bg-zinc-200 text-zinc-700" },
  status_changed: { icon: ShieldAlert, color: "bg-red-100 text-red-800" },
  labels_printed: { icon: Tag, color: "bg-zinc-200 text-zinc-700" },
  reservation_expired: { icon: Clock, color: "bg-zinc-200 text-zinc-700" },
};

export function linkForAudit(a: AuditRow): string | null {
  if (a.entity_type === "tool_request" && a.entity_id) return `/requests/${a.entity_id}`;
  if (a.entity_type === "transfer" && a.entity_id) return `/transfers/${a.entity_id}`;
  if (a.unit_id) return `/units/${a.unit_id}`;
  if (a.entity_type === "parent_tools" && a.entity_id) return `/inventory/${a.entity_id}`;
  if (a.entity_type === "projects" && a.entity_id) return `/projects/${a.entity_id}`;
  return null;
}

/** Vertical timeline used for dashboards and the per-unit activity history. */
export function ActivityFeed({ items, empty = "No activity yet.", absolute = false }: { items: AuditRow[]; empty?: string; absolute?: boolean }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-zinc-500">{empty}</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[19px] before:top-2 before:w-0.5 before:bg-zinc-200 dark:before:bg-zinc-800">
      {items.map((a) => {
        const meta = ICON[a.action] ?? { icon: Pencil, color: "bg-zinc-200 text-zinc-700" };
        const Icon = meta.icon;
        const href = linkForAudit(a);
        const text = a.summary ?? a.action.replace(/_/g, " ");
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-zinc-900 ${meta.color}`}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm font-semibold leading-snug">{href ? <Link href={href} className="hover:underline">{text}</Link> : text}</p>
              <p className="text-xs text-zinc-500">
                {a.actor?.full_name ?? "System"} · <time dateTime={a.created_at} title={fmtDateTime(a.created_at)}>{absolute ? fmtDateTime(a.created_at) : timeAgo(a.created_at)}</time>
              </p>
              {typeof a.details?.comment === "string" && a.details.comment && <p className="mt-1 rounded-lg bg-zinc-100 px-2 py-1 text-xs italic dark:bg-zinc-800">“{a.details.comment}”</p>}
              {typeof a.details?.reason === "string" && a.action !== "request_submitted" && a.details.reason && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Reason: {a.details.reason}</p>}
              {typeof a.details?.notes === "string" && a.details.notes && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Notes: {a.details.notes}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
