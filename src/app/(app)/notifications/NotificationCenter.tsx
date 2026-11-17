"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { cn, fmtDateTime, timeAgo, errorMessage } from "@/lib/utils";
import type { NotificationRow } from "@/lib/types";

const TYPE_COLOR: Record<string, string> = {
  request_submitted: "bg-amber-500",
  request_ready: "bg-emerald-600",
  request_approved: "bg-emerald-600",
  request_rejected: "bg-red-600",
  transfer_initiated: "bg-orange-500",
  transfer_completed: "bg-emerald-600",
  transfer_rejected: "bg-red-600",
  transfer_flagged: "bg-red-600",
  tool_overdue: "bg-red-600",
  tool_damaged: "bg-red-600",
  tool_missing: "bg-red-700",
  tool_needs_maintenance: "bg-orange-500",
  maintenance_due: "bg-orange-500",
};

export function NotificationCenter({ initial, userId }: { initial: NotificationRow[]; userId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  useEffect(() => setItems(initial), [initial]);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`notif-page:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (p: { new: NotificationRow }) => setItems((s) => [p.new, ...s]))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  async function markRead(ids: string[] | null) {
    const { error } = await createClient().rpc("mark_notifications_read", { p_ids: ids });
    if (error) return toast("error", errorMessage(error));
    setItems((s) => s.map((n) => (ids === null || ids.includes(n.id) ? { ...n, is_read: true } : n)));
    router.refresh();
  }
  async function clearRead() {
    const { error } = await createClient().from("notifications").delete().eq("user_id", userId).eq("is_read", true);
    if (error) return toast("error", errorMessage(error));
    setItems((s) => s.filter((n) => !n.is_read));
    toast("success", "Read notifications cleared");
  }

  const shown = filter === "unread" ? items.filter((n) => !n.is_read) : items;
  const unread = items.filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread · updates arrive live`}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => markRead(null)} disabled={!unread}><CheckCheck className="h-4 w-4" aria-hidden /> Mark all read</button>
            <button className="btn btn-ghost" onClick={clearRead}><Trash2 className="h-4 w-4" aria-hidden /> Clear read</button>
          </>
        }
      />
      <div className="flex gap-2" role="group" aria-label="Filter notifications">
        {(["all", "unread"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={cn("chip", filter === f ? "border-brand-charcoal bg-brand-charcoal text-white dark:border-brand-yellow dark:bg-brand-yellow dark:text-black" : "border-zinc-300 dark:border-zinc-700")}>
            {f === "all" ? "All" : `Unread (${unread})`}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up">New requests, approvals, transfers and alerts appear here instantly.</EmptyState>
      ) : (
        <ul className="card divide-y divide-zinc-100 dark:divide-zinc-800">
          {shown.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 p-4", !n.is_read && "bg-brand-yellow/10")}>
              <span className={cn("mt-1.5 h-3 w-3 shrink-0 rounded-full", TYPE_COLOR[n.type] ?? "bg-zinc-400", n.is_read && "opacity-30")} aria-hidden />
              <div className="min-w-0 flex-1">
                {n.link ? (
                  <Link href={n.link} onClick={() => !n.is_read && markRead([n.id])} className="font-bold hover:underline">
                    {n.title}
                  </Link>
                ) : (
                  <span className="font-bold">{n.title}</span>
                )}
                {!n.is_read && <span className="sr-only"> (unread)</span>}
                {n.body && <p className="text-sm text-zinc-700 dark:text-zinc-300">{n.body}</p>}
                <time className="text-xs text-zinc-500" dateTime={n.created_at} title={fmtDateTime(n.created_at)}>{timeAgo(n.created_at)}</time>
              </div>
              {!n.is_read && (
                <button className="btn btn-ghost btn-sm" onClick={() => markRead([n.id])} aria-label={`Mark "${n.title}" as read`}>Mark read</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
