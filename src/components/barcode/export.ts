"use client";
import JsBarcode from "jsbarcode";

export interface LabelData {
  code: string;
  title: string;
  subtitle?: string;
  org?: string;
}

export const LABEL_SIZES = {
  "2x1": { w: 2, h: 1, label: '2" × 1" (Dymo / Zebra small)' },
  "3x2": { w: 3, h: 2, label: '3" × 2" (asset tag)' },
  "4x6": { w: 4, h: 6, label: '4" × 6" (shipping)' },
} as const;
export type LabelSize = keyof typeof LABEL_SIZES;

/** Draw one label onto a canvas at the given DPI. */
export function renderLabelCanvas(data: LabelData, size: LabelSize = "2x1", dpi = 300): HTMLCanvasElement {
  const { w, h } = LABEL_SIZES[size];
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * dpi);
  canvas.height = Math.round(h * dpi);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const pad = Math.round(dpi * 0.06);
  const titleSize = Math.round(dpi * (size === "2x1" ? 0.085 : 0.13));
  const subSize = Math.round(titleSize * 0.8);

  // header bar
  ctx.fillStyle = "#111";
  ctx.font = `bold ${titleSize}px sans-serif`;
  ctx.textBaseline = "top";
  const title = fit(ctx, data.title, canvas.width - pad * 2);
  ctx.fillText(title, pad, pad);
  let y = pad + titleSize * 1.15;
  if (data.subtitle) {
    ctx.font = `${subSize}px sans-serif`;
    ctx.fillText(fit(ctx, data.subtitle, canvas.width - pad * 2), pad, y);
    y += subSize * 1.2;
  }

  const bc = document.createElement("canvas");
  JsBarcode(bc, data.code, {
    format: "CODE128",
    width: Math.max(2, Math.round(dpi / 100)),
    height: Math.round(canvas.height - y - pad * 2 - (data.org ? subSize * 1.3 : 0) - dpi * 0.12),
    displayValue: true,
    fontSize: Math.round(subSize * 1.05),
    font: "monospace",
    margin: 0,
  });
  const maxW = canvas.width - pad * 2;
  const scale = Math.min(1, maxW / bc.width);
  const bw = bc.width * scale;
  ctx.drawImage(bc, (canvas.width - bw) / 2, y + pad / 2, bw, bc.height);
  if (data.org) {
    ctx.font = `${Math.round(subSize * 0.85)}px sans-serif`;
    ctx.fillStyle = "#444";
    ctx.textBaseline = "bottom";
    ctx.fillText(fit(ctx, data.org, maxW), pad, canvas.height - pad / 2);
  }
  return canvas;
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

export function downloadPNG(data: LabelData, size: LabelSize = "2x1") {
  const canvas = renderLabelCanvas(data, size);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${data.code}.png`;
  a.click();
}

/** One label per PDF page sized exactly to the label stock (thermal printers), or a Letter sheet grid. */
export async function downloadPDF(labels: LabelData[], size: LabelSize = "2x1", layout: "roll" | "sheet" = "roll", filename = "labels.pdf") {
  const { jsPDF } = await import("jspdf");
  const { w, h } = LABEL_SIZES[size];
  if (layout === "roll") {
    const doc = new jsPDF({ unit: "in", format: [w, h], orientation: w > h ? "landscape" : "portrait" });
    labels.forEach((l, i) => {
      if (i > 0) doc.addPage([w, h], w > h ? "landscape" : "portrait");
      doc.addImage(renderLabelCanvas(l, size).toDataURL("image/png"), "PNG", 0, 0, w, h);
    });
    doc.save(filename);
    return;
  }
  // Letter sheet grid with 0.5" margins
  const doc = new jsPDF({ unit: "in", format: "letter" });
  const margin = 0.5;
  const gap = 0.125;
  const cols = Math.max(1, Math.floor((8.5 - margin * 2 + gap) / (w + gap)));
  const rows = Math.max(1, Math.floor((11 - margin * 2 + gap) / (h + gap)));
  labels.forEach((l, i) => {
    const idx = i % (cols * rows);
    if (i > 0 && idx === 0) doc.addPage();
    const x = margin + (idx % cols) * (w + gap);
    const y = margin + Math.floor(idx / cols) * (h + gap);
    doc.addImage(renderLabelCanvas(l, size).toDataURL("image/png"), "PNG", x, y, w, h);
    doc.setDrawColor(200);
    doc.rect(x, y, w, h);
  });
  doc.save(filename);
}
