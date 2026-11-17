import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserManager } from "./UserManager";
import type { Row } from "@/lib/queries";

export const metadata: Metadata = { title: "Users & Roles" };

export default async function UsersPage() {
  const me = await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: users }, { data: members }, { data: projects }, { data: active }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("project_members").select("user_id, member_role, project:projects(id, name)"),
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("checkouts").select("holder_id").eq("status", "active"),
  ]);
  const holding: Record<string, number> = {};
  for (const c of (active ?? []) as Row[]) holding[c.holder_id] = (holding[c.holder_id] ?? 0) + 1;
  return <UserManager meId={me.id} users={(users ?? []) as Row[]} members={(members ?? []) as Row[]} projects={(projects ?? []) as Row[]} holding={holding} />;
}
