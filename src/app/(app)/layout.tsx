import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", profile.id).eq("is_read", false);
  return (
    <AppShell profile={profile} unread={count ?? 0}>
      {children}
    </AppShell>
  );
}
