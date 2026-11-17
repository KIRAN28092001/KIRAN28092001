"use client";
import { Download, FileText } from "lucide-react";
import { toCSV } from "@/lib/utils";

export interface Report {
  title: string;
  description: string;
  columns: string[];
  rows: (string | number | null)[][];
  summary?: { label: string; value: string | number }[];
}

export function ReportTable({ report }: { report: Report }) {
  const fname = report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + new Date().toISOString().slice(0, 10);

  function csv() {
    const objs = report.rows.map((r) => Object.fromEntries(report.columns.map((c, i) => [c, r[i]])));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCSV(objs)], { type: "text/csv" }));
    a.download = `${fname}.csv`;
    a.click();
  }
  async function pdf() {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: report.columns.length > 5 ? "landscape" : "portrait", unit: "pt", format: "letter" });
    doc.setFontSize(16);
    doc.text(`Tool Connected — ${report.title}`, 40, 40);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generated ${new Date().toLocaleString()}`, 40, 56);
    autoTable(doc, {
      startY: 70,
      head: [report.columns],
      body: report.rows.map((r) => r.map((c) => (c === null ? "" : String(c)))),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [28, 28, 30], textColor: [245, 184, 0] },
      alternateRowStyles: { fillColor: [250, 245, 234] },
    });
    doc.save(`${fname}.pdf`);
  }

  return (
    <section className="card" aria-labelledby="report-title">
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="report-title" className="text-lg font-extrabold">{report.title}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{report.description}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={csv} disabled={!report.rows.length}><Download className="h-4 w-4" aria-hidden /> CSV</button>
          <button className="btn btn-dark" onClick={pdf} disabled={!report.rows.length}><FileText className="h-4 w-4" aria-hidden /> PDF</button>
        </div>
      </div>
      {report.summary && (
        <dl className="grid grid-cols-2 gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 sm:grid-cols-4">
          {report.summary.map((s) => (
            <div key={s.label} className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
              <dt className="text-xs font-semibold text-zinc-500">{s.label}</dt>
              <dd className="text-xl font-extrabold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr>{report.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {report.rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === "number" ? "tabular-nums" : undefined}>{c ?? "—"}</td>)}</tr>
            ))}
          </tbody>
        </table>
        {report.rows.length === 0 && <p className="p-8 text-center text-sm text-zinc-500">No data for this report.</p>}
      </div>
    </section>
  );
}
