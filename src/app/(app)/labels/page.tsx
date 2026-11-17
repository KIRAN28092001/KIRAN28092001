import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LabelCenter } from "./LabelCenter";
import type { Row } from "@/lib/queries";

export const metadata: Metadata = { title: "Barcode Label Center" };

export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ parent?: string }> }) {
  const sp = await searchParams;
  await requireRole(["admin", "inventory_manager", "project_lead"]);
  const supabase = await createClient();
  const [{ data: parents }, { data: units }, { data: labels }, { data: settings }] = await Promise.all([
    supabase.from("parent_tools").select("id, name, brand, parent_code").eq("is_archived", false).order("parent_code"),
    supabase.from("tool_units").select("id, parent_tool_id, unit_code, serial_number, status").neq("status", "retired").order("unit_code"),
    supabase.from("barcode_labels").select("unit_id, parent_tool_id, label_type, print_count, last_printed_at"),
    supabase.from("app_settings").select("key, value").in("key", ["organization_name", "label_size"]),
  ]);
  const s = Object.fromEntries(((settings ?? []) as Row[]).map((r) => [r.key, r.value]));
  return (
    <LabelCenter
      parents={(parents ?? []) as Row[]}
      units={(units ?? []) as Row[]}
      labels={(labels ?? []) as Row[]}
      org={String(s.organization_name ?? "")}
      defaultSize={(s.label_size as "2x1" | "3x2" | "4x6") ?? "2x1"}
      initialParent={sp.parent ?? null}
    />
  );
}
