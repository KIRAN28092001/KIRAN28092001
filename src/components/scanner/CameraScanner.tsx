"use client";
import { useEffect, useId, useRef, useState } from "react";
import { CameraOff } from "lucide-react";

/**
 * Live camera scanner for Code 128 / QR / common 1D codes.
 * Uses html5-qrcode (loaded lazily, client-only). Calls onDetected once per distinct code.
 */
export function CameraScanner({ onDetected, active }: { onDetected: (code: string) => void; active: boolean }) {
  const id = useId().replace(/:/g, "");
  const regionId = `scanner-${id}`;
  const [error, setError] = useState<string | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const cbRef = useRef(onDetected);
  cbRef.current = onDetected;

  useEffect(() => {
    if (!active) return;
    let scanner: { stop: () => Promise<void>; clear: () => void; isScanning?: boolean } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("html5-qrcode");
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = mod;
        if (cancelled) return;
        const s = new Html5Qrcode(regionId, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.DATA_MATRIX,
          ],
          useBarCodeDetectorIfSupported: true,
        });
        scanner = s as unknown as typeof scanner;
        await s.start(
          { facingMode: "environment" },
          { fps: 12, qrbox: (w: number, h: number) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(h * 0.5, 180)) }) },
          (text: string) => {
            const now = Date.now();
            if (text === lastRef.current.code && now - lastRef.current.at < 3000) return;
            lastRef.current = { code: text, at: now };
            if (navigator.vibrate) navigator.vibrate(80);
            cbRef.current(text.trim());
          },
          () => {}
        );
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          /permission|notallowed/i.test(msg)
            ? "Camera permission was denied. Allow camera access in your browser settings, or type the barcode below."
            : /notfound|no camera|requested device/i.test(msg)
              ? "No camera found on this device. Type or use a USB/Bluetooth scanner below."
              : "Camera could not start. Make sure the site is opened over HTTPS, then try again."
        );
      }
    })();
    return () => {
      cancelled = true;
      if (scanner) {
        scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              scanner?.clear();
            } catch {}
          });
      }
    };
  }, [active, regionId]);

  if (error) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl border-2 border-orange-400 bg-orange-50 p-4 text-sm font-medium text-orange-950 dark:bg-orange-950/40 dark:text-orange-100">
        <CameraOff className="h-5 w-5 shrink-0" aria-hidden />
        {error}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border-4 border-brand-yellow bg-black">
      <div id={regionId} className="aspect-[4/3] w-full [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" aria-label="Camera viewfinder" />
    </div>
  );
}
