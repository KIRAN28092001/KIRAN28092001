"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ToolImage } from "@/components/ToolImage";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import type { Row } from "@/lib/queries";

type FormState = Record<string, string>;

export function ParentToolForm({ categories, projects, tool }: { categories: Row[]; projects: Row[]; tool?: Row }) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState<FormState>({
    name: tool?.name ?? "",
    brand: tool?.brand ?? "",
    category_id: tool?.category_id ?? "",
    model_number: tool?.model_number ?? "",
    quantity: tool ? String(tool.quantity) : "1",
    purchase_date: tool?.purchase_date ?? "",
    purchase_value: tool?.purchase_value != null ? String(tool.purchase_value) : "",
    supplier: tool?.supplier ?? "",
    min_stock_threshold: tool ? String(tool.min_stock_threshold) : "1",
    maintenance_interval_days: tool?.maintenance_interval_days != null ? String(tool.maintenance_interval_days) : "",
    home_project_id: tool?.home_project_id ?? "",
    storage_location: tool?.storage_location ?? "",
    description: tool?.description ?? "",
    notes: tool?.notes ?? "",
    image_url: tool?.image_url ?? "",
    image_path: "",
  });
  const [errors, setErrors] = useState<FormState>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const brandPrefix = f.brand.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  const catCode = categories.find((c) => c.id === f.category_id)?.code;

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("error", "Choose an image file");
    if (file.size > 5 * 1024 * 1024) return toast("error", "Image must be 5 MB or smaller");
    setUploading(true);
    const supabase = createClient();
    const path = `parents/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() || "jpg"}`;
    const { error } = await supabase.storage.from("tool-images").upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) return toast("error", `Upload failed: ${error.message}`);
    const { data } = supabase.storage.from("tool-images").getPublicUrl(path);
    setF((s) => ({ ...s, image_url: data.publicUrl, image_path: path }));
  }

  function validate() {
    const e: FormState = {};
    if (f.name.trim().length < 2) e.name = "Tool name is required";
    if (!f.brand.trim()) e.brand = "Brand is required";
    if (!f.category_id) e.category_id = "Choose a category";
    const q = Number(f.quantity);
    if (!tool && (!Number.isInteger(q) || q < 1 || q > 500)) e.quantity = "Quantity must be 1–500";
    if (f.purchase_value && Number(f.purchase_value) < 0) e.purchase_value = "Must be positive";
    if (f.min_stock_threshold && Number(f.min_stock_threshold) < 0) e.min_stock_threshold = "Must be 0 or more";
    if (f.maintenance_interval_days && Number(f.maintenance_interval_days) <= 0) e.maintenance_interval_days = "Must be more than 0";
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    const supabase = createClient();
    if (!tool) {
      const { data, error } = await supabase.rpc("create_parent_tool", { p: f });
      setBusy(false);
      if (error) return toast("error", errorMessage(error));
      const r = data as { id: string; parent_code: string; units: number };
      toast("success", `Created ${r.parent_code} with ${r.units} barcoded unit${r.units > 1 ? "s" : ""}.`);
      router.push(`/inventory/${r.id}?created=1`);
      return;
    }
    const { error } = await supabase
      .from("parent_tools")
      .update({
        name: f.name.trim(),
        brand: f.brand.trim(),
        category_id: f.category_id,
        model_number: f.model_number || null,
        purchase_date: f.purchase_date || null,
        purchase_value: f.purchase_value ? Number(f.purchase_value) : null,
        supplier: f.supplier || null,
        min_stock_threshold: Number(f.min_stock_threshold || 0),
        maintenance_interval_days: f.maintenance_interval_days ? Number(f.maintenance_interval_days) : null,
        home_project_id: f.home_project_id || null,
        storage_location: f.storage_location || null,
        description: f.description || null,
        notes: f.notes || null,
        image_url: f.image_url || null,
      })
      .eq("id", tool.id);
    if (!error && f.image_path) {
      await supabase.from("tool_images").update({ is_primary: false }).eq("parent_tool_id", tool.id);
      await supabase.from("tool_images").insert({ parent_tool_id: tool.id, url: f.image_url, storage_path: f.image_path, is_primary: true });
    }
    setBusy(false);
    if (error) return toast("error", errorMessage(error));
    toast("success", "Tool updated");
    router.refresh();
  }

  const input = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, required = false) => (
    <div>
      <label htmlFor={`pt-${k}`} className="label">{label} {required && <span className="text-red-700" aria-hidden>*</span>}</label>
      <input id={`pt-${k}`} className="input" value={f[k]} onChange={set(k)} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `pt-${k}-err` : undefined} {...props} />
      {errors[k] && <p id={`pt-${k}-err`} className="field-error">{errors[k]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="card card-pad grid gap-4 sm:grid-cols-[160px_1fr]">
        <div className="space-y-2">
          <ToolImage src={f.image_url || categories.find((c) => c.id === f.category_id)?.image_url} alt="Tool photo preview" className="aspect-square w-full" />
          <label className="btn btn-outline btn-sm w-full cursor-pointer focus-within:ring-4 focus-within:ring-brand-yellow">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
            {uploading ? "Uploading…" : "Upload photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {input("name", "Tool name", { placeholder: "M18 FUEL 1/2\" Drill/Driver" }, true)}
          {input("brand", "Brand", { placeholder: "Milwaukee" }, true)}
          <div>
            <label htmlFor="pt-category_id" className="label">Category / type <span className="text-red-700">*</span></label>
            <select id="pt-category_id" className="input" value={f.category_id} onChange={set("category_id")} aria-invalid={!!errors.category_id}>
              <option value="">Select…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
            {errors.category_id && <p className="field-error">{errors.category_id}</p>}
          </div>
          {input("model_number", "Model number")}
          {tool ? (
            <div><span className="label">Parent code</span><div className="input flex items-center bg-zinc-100 font-mono font-bold dark:bg-zinc-800">{tool.parent_code}</div><p className="help">Codes never change once issued.</p></div>
          ) : (
            <div>
              {input("quantity", "Quantity (units)", { type: "number", min: 1, max: 500, inputMode: "numeric" }, true)}
              <p className="help">
                Parent code preview: <span className="font-mono font-bold">{catCode ? `${brandPrefix}-${catCode}-###` : "choose brand & category"}</span> — each unit gets its own barcode (…-01, -02…).
              </p>
            </div>
          )}
          {input("storage_location", "Storage location", { placeholder: "Tool Crib A — Shelf 1" })}
        </div>
      </div>

      <div className="card card-pad grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {input("purchase_date", "Purchase date", { type: "date" })}
        {input("purchase_value", "Purchase value (USD, per unit)", { type: "number", min: 0, step: "0.01", inputMode: "decimal" })}
        {input("supplier", "Supplier")}
        {input("min_stock_threshold", "Minimum stock threshold", { type: "number", min: 0, inputMode: "numeric" })}
        {input("maintenance_interval_days", "Maintenance interval (days)", { type: "number", min: 1, inputMode: "numeric" })}
        <div>
          <label htmlFor="pt-home" className="label">Project location</label>
          <select id="pt-home" className="input" value={f.home_project_id} onChange={set("home_project_id")}>
            <option value="">Central tool crib</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-3"><label htmlFor="pt-desc" className="label">Description</label><textarea id="pt-desc" className="input min-h-[72px]" value={f.description} onChange={set("description")} /></div>
        <div className="sm:col-span-2 lg:col-span-3"><label htmlFor="pt-notes" className="label">Notes</label><textarea id="pt-notes" className="input min-h-[72px]" value={f.notes} onChange={set("notes")} /></div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-outline" onClick={() => router.back()}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || uploading}>{busy ? "Saving…" : tool ? "Save changes" : "Create tool & generate barcodes"}</button>
      </div>
    </form>
  );
}
