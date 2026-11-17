"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine, X } from "lucide-react";
import { CameraScanner } from "./CameraScanner";

/**
 * Big scan/search control: manual entry (works with USB/Bluetooth wedge scanners,
 * which type the code + Enter) plus an optional camera scanner.
 */
export function ScanInput({
  onSubmit,
  label = "Scan or enter barcode",
  placeholder = "e.g. MIL-DRL-101-03",
  autoFocus = true,
  defaultCamera = false,
  submitLabel = "Go",
  busy,
}: {
  onSubmit: (code: string) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  defaultCamera?: boolean;
  submitLabel?: string;
  busy?: boolean;
}) {
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState(defaultCamera);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function submit(code: string) {
    const c = code.trim();
    if (!c) return;
    onSubmit(c);
    setValue("");
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="scan-input" className="sr-only">{label}</label>
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            ref={inputRef}
            id="scan-input"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            placeholder={placeholder}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            className="input min-h-[60px] pl-12 font-mono text-lg tracking-wide"
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary btn-lg flex-1 sm:flex-none" disabled={busy || !value.trim()}>
            {busy ? "Checking…" : submitLabel}
          </button>
          <button
            type="button"
            onClick={() => setCamera((c) => !c)}
            className={`btn btn-lg ${camera ? "btn-dark" : "btn-outline"}`}
            aria-pressed={camera}
            aria-label={camera ? "Close camera scanner" : "Open camera scanner"}
          >
            {camera ? <X className="h-6 w-6" aria-hidden /> : <Camera className="h-6 w-6" aria-hidden />}
            <span className="hidden sm:inline">{camera ? "Close" : "Camera"}</span>
          </button>
        </div>
      </form>
      {camera && (
        <div className="space-y-2">
          <CameraScanner active={camera} onDetected={(c) => submit(c)} />
          <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">Point the camera at the barcode label. It scans automatically.</p>
        </div>
      )}
    </div>
  );
}
