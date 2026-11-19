import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserManager } from "./UserManager";
import type { Row } from "@/lib/queries";

export const metadata: Metadata = { title: "Users & Roles" };

export default async function UsersPage() {
  const me = await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: users }, { data: members }, { data: projects }, { data: active }, { data: invitations }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("project_members").select("user_id, member_role, project:projects(id, name)"),
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("checkouts").select("holder_id").eq("status", "active"),
    supabase.from("user_invitations").select("id, email, full_name, role, status, invited_at, last_sent_at, send_count, accepted_at, auth_user_id, inviter:profiles!user_invitations_invited_by_fkey(full_name)").order("invited_at", { ascending: false }).limit(100),
  ]);
  const holding: Record<string, number> = {};
  for (const c of (active ?? []) as Row[]) holding[c.holder_id] = (holding[c.holder_id] ?? 0) + 1;
  return <UserManager meId={me.id} users={(users ?? []) as Row[]} members={(members ?? []) as Row[]} projects={(projects ?? []) as Row[]} holding={holding} invitations={(invitations ?? []) as Row[]} />;
}
