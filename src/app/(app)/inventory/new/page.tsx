import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ParentToolForm } from "@/components/tools/ParentToolForm";
import type { Row } from "@/lib/queries";

export const metadata: Metadata = { title: "Add Tool" };

export default async function NewToolPage() {
  await requireRole(["admin", "inventory_manager", "project_lead"]);
  const supabase = await createClient();
  const [{ data: categories }, { data: projects }] = await Promise.all([
    supabase.from("tool_categories").select("id, name, code, image_url").order("name"),
    supabase.from("projects").select("id, name").order("name"),
  ]);
  return (
    <div>
      <PageHeader back={{ href: "/inventory", label: "Inventory" }} title="Add a tool" subtitle="A unique parent code and an individual barcode for every unit are generated automatically." />
      <ParentToolForm categories={(categories ?? []) as Row[]} projects={(projects ?? []) as Row[]} />
    </div>
  );
}
