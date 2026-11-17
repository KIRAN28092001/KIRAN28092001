import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Tag, ScanLine } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { InventoryTable } from "./InventoryTable";
import type { CatalogItem, Category } from "@/lib/types";

export const metadata: Metadata = { title: "Inventory Management" };

export default async function InventoryPage() {
  await requireRole(["admin", "inventory_manager", "project_lead"]);
  const supabase = await createClient();
  const [{ data: items }, { data: categories }] = await Promise.all([
    supabase.from("v_catalog").select("*").order("parent_code"),
    supabase.from("tool_categories").select("id, name, code, image_url").order("name"),
  ]);
  const list = (items ?? []) as CatalogItem[];
  const value = list.reduce((s, i) => s + (Number(i.purchase_value) || 0) * i.total_units, 0);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory Management"
        subtitle={`${list.length} tool types · ${list.reduce((s, i) => s + i.total_units, 0)} tracked units · ${value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} asset value`}
        actions={
          <>
            <Link href="/inventory/new" className="btn btn-primary"><Plus className="h-5 w-5" aria-hidden /> Add tool</Link>
            <Link href="/labels" className="btn btn-outline"><Tag className="h-5 w-5" aria-hidden /> Print labels</Link>
            <Link href="/scanner?mode=return" className="btn btn-outline"><ScanLine className="h-5 w-5" aria-hidden /> Check-in</Link>
          </>
        }
      />
      <InventoryTable items={list} categories={(categories ?? []) as Category[]} />
    </div>
  );
}
