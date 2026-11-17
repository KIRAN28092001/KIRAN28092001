"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ToolImage } from "@/components/ToolImage";
import { money, toCSV } from "@/lib/utils";
import type { CatalogItem, Category } from "@/lib/types";

export function InventoryTable({ items, categories }: { items: CatalogItem[]; categories: Category[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [stock, setStock] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((i) => {
      if (!showArchived && i.is_archived) return false;
      if (cat !== "all" && i.category_id !== cat) return false;
      if (stock === "low" && !(i.available_units < i.min_stock_threshold)) return false;
      if (stock === "attention" && i.attention_units === 0) return false;
      if (t && ![i.name, i.brand, i.parent_code, i.model_number, i.unit_search, i.supplier].join(" ").toLowerCase().includes(t)) return false;
      return true;
    });
  }, [items, q, cat, stock, showArchived]);

  function exportCSV() {
    const csv = toCSV(rows.map((i) => ({ parent_code: i.parent_code, name: i.name, brand: i.brand, category: i.category_name, model: i.model_number, total: i.total_units, available: i.available_units, checked_out: i.checked_out_units, reserved: i.reserved_units, attention: i.attention_units, min_stock: i.min_stock_threshold, home_project: i.home_project_name, location: i.storage_location, unit_value: i.purchase_value, supplier: i.supplier })));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-3">
      <div className="card card-pad grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <label htmlFor="inv-q" className="sr-only">Search inventory</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input id="inv-q" className="input pl-10" placeholder="Search name, code, serial, supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="sr-only" htmlFor="inv-cat">Category</label>
        <select id="inv-cat" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="inv-stock">Stock filter</label>
        <select id="inv-stock" className="input" value={stock} onChange={(e) => setStock(e.target.value)}>
          <option value="all">All stock levels</option>
          <option value="low">Below minimum stock</option>
          <option value="attention">Has damaged / maintenance / missing</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-5 w-5 accent-brand-yellow" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived</label>
        <button className="btn btn-outline" onClick={exportCSV}><Download className="h-4 w-4" aria-hidden /> CSV</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <caption className="sr-only">Inventory list</caption>
          <thead>
            <tr><th scope="col">Tool</th><th scope="col">Parent code</th><th scope="col">Category</th><th scope="col" className="text-right">Avail / Total</th><th scope="col">Out</th><th scope="col">Attention</th><th scope="col">Home</th><th scope="col" className="text-right">Value</th></tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const low = i.available_units < i.min_stock_threshold;
              return (
                <tr key={i.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td>
                    <Link href={`/inventory/${i.id}`} className="flex items-center gap-2 font-semibold hover:underline">
                      <ToolImage src={i.image_url ?? i.category_image_url} alt="" className="h-10 w-10 shrink-0" />
                      <span><span className="block">{i.name}</span><span className="text-xs font-normal text-zinc-500">{i.brand}{i.is_archived ? " · archived" : ""}</span></span>
                    </Link>
                  </td>
                  <td className="font-mono text-xs">{i.parent_code}</td>
                  <td>{i.category_name}</td>
                  <td className="text-right"><Badge tone={i.available_units === 0 ? "red" : low ? "yellow" : "green"}>{i.available_units}/{i.total_units}</Badge></td>
                  <td className="tabular-nums">{i.checked_out_units}</td>
                  <td>{i.attention_units > 0 ? <Badge tone="orange">{i.attention_units}</Badge> : "—"}</td>
                  <td className="text-xs">{i.home_project_name ?? "Crib"}</td>
                  <td className="text-right tabular-nums">{money((Number(i.purchase_value) || 0) * i.total_units)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-zinc-500">No tools match these filters.</p>}
      </div>
    </div>
  );
}
