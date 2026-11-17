import type { Metadata } from "next";
import { getProfile, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { TransferForm } from "./TransferForm";
import type { Row } from "@/lib/queries";

export const metadata: Metadata = { title: "New Transfer" };

export default async function NewTransferPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const sp = await searchParams;
  const profile = await getProfile();
  const supabase = await createClient();
  const staff = isStaff(profile.role) || profile.role === "project_lead";
  let unitsQ = supabase.from("tool_units").select("id, unit_code, current_project_id, current_holder_id, parent:parent_tools(name), holder:profiles!tool_units_current_holder_id_fkey(full_name)").eq("status", "checked_out").order("unit_code");
  if (!staff) unitsQ = unitsQ.eq("current_holder_id", profile.id);
  const [{ data: units }, { data: members }, { data: projects }] = await Promise.all([
    unitsQ,
    supabase.from("project_members").select("project_id, user:profiles(id, full_name, job_title, is_active)"),
    supabase.from("projects").select("id, name").in("status", ["active", "planning"]).order("name"),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={{ href: "/transfers", label: "Transfers" }} title="Transfer a tool" subtitle="The receiver must scan or confirm before custody moves. Your Project Lead and Inventory are notified." />
      <TransferForm
        me={{ id: profile.id, name: profile.full_name }}
        units={(units ?? []) as Row[]}
        members={((members ?? []) as Row[]).filter((m) => m.user?.is_active)}
        projects={(projects ?? []) as Row[]}
        initialCode={sp.code ?? ""}
        userId={profile.id}
      />
    </div>
  );
}
