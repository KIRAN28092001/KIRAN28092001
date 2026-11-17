"use client";
import { useMemo, useState } from "react";
import { Download, FileImage, Printer, Search } from "lucide-react";
import { Barcode } from "@/components/barcode/Barcode";
import { LABEL_SIZES, downloadPDF, downloadPNG, type LabelData, type LabelSize } from "@/components/barcode/export";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/utils";
import type { Row } from "@/lib/queries";

export function LabelCenter({ parents, units, labels, org, defaultSize, initialParent }: { parents: Row[]; units: Row[]; labels: Row[]; org: string; defaultSize: LabelSize; initialParent: string | null }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [onlyUnprinted, setOnlyUnprinted] = useState(false);
  const [size, setSize] = useState<LabelSize>(defaultSize);
  const [layout, setLayout] = useState<"roll" | "sheet">("sheet");
  const [includeParent, setIncludeParent] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialParent ? units.filter((u) => u.parent_tool_id === initialParent).map((u) => u.id) : []));
  const parentById = useMemo(() => new Map(parents.map((p) => [p.id, p])), [parents]);
  const printInfo = useMemo(() => new Map(labels.filter((l) => l.unit_id).map((l) => [l.unit_id, l])), [labels]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return units.filter((u) => {
      const p = parentById.get(u.parent_tool_id);
      if (!p) return false;
      if (onlyUnprinted && (printInfo.get(u.id)?.print_count ?? 0) > 0) return false;
      if (t && ![u.unit_code, u.serial_number, p.name, p.brand].join(" ").toLowerCase().includes(t)) return false;
      return true;
    });
  }, [units, q, onlyUnprinted, parentById, printInfo]);

  const chosenUnits = units.filter((u) => selected.has(u.id));
  const chosenParents = includeParent ? Array.from(new Set(chosenUnits.map((u) => u.parent_tool_id))) : [];
  const labelData: LabelData[] = [
    ...chosenParents.map((pid) => {
      const p = parentById.get(pid)!;
      return { code: p.parent_code, title: `${p.name} (PARENT)`, subtitle: p.brand, org };
    }),
    ...chosenUnits.map((u) => {
      const p = parentById.get(u.parent_tool_id)!;
      return { code: u.unit_code, title: p.name, subtitle: `${p.brand}${u.serial_number ? ` · S/N ${u.serial_number}` : ""}`, org };
    }),
  ];

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  async function record() {
    await createClient().rpc("record_label_print", { p_unit_ids: chosenUnits.map((u) => u.id), p_parent_ids: chosenParents });
  }
  async function pdf() {
    if (!labelData.length) return toast("error", "Select at least one unit");
    await downloadPDF(labelData, size, layout, `labels-${new Date().toISOString().slice(0, 10)}.pdf`);
    await record();
    toast("success", `${labelData.length} label(s) exported to PDF`);
  }
  async function png() {
    if (!labelData.length) return toast("error", "Select at least one unit");
    if (labelData.length > 20) return toast("error", "PNG export is limited to 20 labels — use PDF for larger batches");
    labelData.forEach((l) => downloadPNG(l, size));
    await record();
  }
  async function print() {
    if (!labelData.length) return toast("error", "Select at least one unit");
    await record();
    window.print();
  }

  const { w, h } = LABEL_SIZES[size];

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader title="Barcode Label Center" subtitle="Code 128 labels for every tracked unit. Export PDF for thermal or sheet printers, PNG for single labels." />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="card card-pad space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <label htmlFor="lbl-q" className="sr-only">Search units</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden />
                <input id="lbl-q" className="input pl-10" placeholder="Search unit code, tool, serial…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-5 w-5 accent-brand-yellow" checked={onlyUnprinted} onChange={(e) => setOnlyUnprinted(e.target.checked)} /> Never printed</label>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button className="btn btn-outline btn-sm" onClick={() => setSelected(new Set([...selected, ...visible.map((u) => u.id)]))}>Select all shown ({visible.length})</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear selection</button>
              <span className="self-center font-semibold">{selected.size} selected</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="table">
                <thead className="sticky top-0"><tr><th scope="col" className="w-10"><span className="sr-only">Select</span></th><th scope="col">Unit</th><th scope="col">Tool</th><th scope="col">Printed</th></tr></thead>
                <tbody>
                  {visible.map((u) => {
                    const p = parentById.get(u.parent_tool_id);
                    const info = printInfo.get(u.id);
                    return (
                      <tr key={u.id} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40" onClick={() => toggle(u.id)}>
                        <td><input type="checkbox" className="h-5 w-5 accent-brand-yellow" checked={selected.has(u.id)} onChange={() => toggle(u.id)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${u.unit_code}`} /></td>
                        <td className="font-mono font-bold">{u.unit_code}</td>
                        <td className="text-sm">{p?.name}</td>
                        <td className="text-xs">{info?.print_count ? <Badge tone="green" dot={false}>{info.print_count}× · {fmtDate(info.last_printed_at)}</Badge> : <Badge tone="yellow" dot={false}>Never</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card card-pad space-y-4">
            <div>
              <label htmlFor="lbl-size" className="label">Label size</label>
              <select id="lbl-size" className="input" value={size} onChange={(e) => setSize(e.target.value as LabelSize)}>
                {Object.entries(LABEL_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <fieldset>
              <legend className="label">PDF layout</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" className="h-5 w-5 accent-brand-yellow" checked={layout === "sheet"} onChange={() => setLayout("sheet")} /> Letter sheet (laser / inkjet)</label>
              <label className="mt-1 flex items-center gap-2 text-sm"><input type="radio" className="h-5 w-5 accent-brand-yellow" checked={layout === "roll"} onChange={() => setLayout("roll")} /> One label per page (thermal roll)</label>
            </fieldset>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="h-5 w-5 accent-brand-yellow" checked={includeParent} onChange={(e) => setIncludeParent(e.target.checked)} /> Include parent-code shelf labels</label>
            <div className="grid gap-2">
              <button className="btn btn-primary btn-lg" onClick={pdf}><Download className="h-5 w-5" aria-hidden /> Download PDF ({labelData.length})</button>
              <button className="btn btn-outline" onClick={png}><FileImage className="h-5 w-5" aria-hidden /> Download PNG</button>
              <button className="btn btn-outline" onClick={print}><Printer className="h-5 w-5" aria-hidden /> Print preview</button>
            </div>
          </div>
        </div>
        {labelData.length > 0 && <h2 className="mb-2 mt-6 text-lg font-extrabold">Preview</h2>}
      </div>

      {/* Printable preview (also used by window.print) */}
      <div className="flex flex-wrap gap-3 print:gap-1">
        {labelData.slice(0, 120).map((l) => (
          <div key={l.code} className="flex flex-col justify-between overflow-hidden rounded-md border border-zinc-300 bg-white p-1.5 text-black print:break-inside-avoid print:rounded-none" style={{ width: `${w}in`, height: `${h}in` }}>
            <div className="truncate text-[9px] font-bold leading-tight">{l.title}</div>
            {l.subtitle && <div className="truncate text-[8px] leading-tight">{l.subtitle}</div>}
            <Barcode value={l.code} height={size === "2x1" ? 30 : 60} width={1.3} fontSize={10} className="mx-auto h-auto max-h-full w-full" />
            {org && <div className="truncate text-[7px] text-zinc-600">{org}</div>}
          </div>
        ))}
      </div>
      {labelData.length > 120 && <p className="no-print text-sm text-zinc-500">Showing first 120 labels — the PDF includes all {labelData.length}.</p>}
    </div>
  );
}
