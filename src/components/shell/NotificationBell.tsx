"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import type { NotificationRow } from "@/lib/types";

/** Live unread counter backed by Supabase Realtime (RLS limits rows to the signed-in user). */
export function NotificationBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => setUnread(initialUnread), [initialUnread]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload: { new: NotificationRow }) => {
        setUnread((n) => n + 1);
        toast("info", payload.new.title);
        router.refresh();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, async () => {
        const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false);
        setUnread(count ?? 0);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, toast, router]);

  return (
    <Link href="/notifications" className="btn btn-ghost relative px-3" aria-label={`Notifications, ${unread} unread`}>
      <Bell className="h-6 w-6" aria-hidden />
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white" aria-hidden>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
