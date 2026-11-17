"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Dialog({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; size?: "md" | "lg" }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
      className={`w-[calc(100%-2rem)] ${size === "lg" ? "max-w-2xl" : "max-w-lg"} rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-panel backdrop:bg-black/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
            <h2 id="dialog-title" className="text-lg font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Close dialog">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = "Confirm",
  tone = "primary",
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm leading-relaxed">{children}</div>
    </Dialog>
  );
}
