import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ScannerConsole } from "./ScannerConsole";
import type { Row } from "@/lib/queries";

export const metadata: Metadata = { title: "Check-Out / Check-In Scanner" };

export default async function ScannerPage({ searchParams }: { searchParams: Promise<{ mode?: string; request?: string; code?: string }> }) {
  const sp = await searchParams;
  const profile = await getProfile();
  const supabase = await createClient();
  const canIssue = profile.role !== "labor";
  const [{ data: projects }, { data: people }, { data: loan }] = await Promise.all([
    supabase.from("projects").select("id, name").in("status", ["active", "planning"]).order("name"),
    canIssue ? supabase.from("profiles").select("id, full_name, employee_code, role").eq("is_active", true).order("full_name") : Promise.resolve({ data: [] }),
    supabase.from("app_settings").select("value").eq("key", "default_loan_days").maybeSingle(),
  ]);
  return (
    <ScannerConsole
      userId={profile.id}
      role={profile.role}
      initialMode={(sp.mode as "collect" | "return" | "issue" | "lookup" | "receive") ?? (profile.role === "inventory_manager" ? "return" : "collect")}
      requestId={sp.request ?? null}
      initialCode={sp.code ?? null}
      projects={(projects ?? []) as Row[]}
      people={(people ?? []) as Row[]}
      loanDays={Number(loan?.value ?? 7)}
    />
  );
}
