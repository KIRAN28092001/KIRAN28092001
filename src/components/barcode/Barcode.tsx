"use client";
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/** Code 128 barcode rendered as SVG (crisp for print + screen). */
export function Barcode({ value, height = 60, width = 2, displayValue = true, fontSize = 14, className }: { value: string; height?: number; width?: number; displayValue?: boolean; fontSize?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: "CODE128", height, width, displayValue, fontSize, margin: 6, background: "#ffffff", lineColor: "#111111", font: "monospace" });
    } catch {
      /* invalid characters are impossible for generated codes */
    }
  }, [value, height, width, displayValue, fontSize]);
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} className={className} />;
}
