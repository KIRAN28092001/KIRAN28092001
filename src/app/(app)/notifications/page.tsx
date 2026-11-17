import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NotificationCenter } from "./NotificationCenter";
import type { NotificationRow } from "@/lib/types";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, type, title, body, link, is_read, created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(200);
  return <NotificationCenter initial={(data ?? []) as NotificationRow[]} userId={profile.id} />;
}
