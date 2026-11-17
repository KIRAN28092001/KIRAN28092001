"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const Ctx = createContext<(kind: ToastKind, message: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, message }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === "error" ? 8000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-6" aria-live="polite" role="status">
        {items.map((t) => {
          const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? AlertTriangle : Info;
          const color =
            t.kind === "success"
              ? "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"
              : t.kind === "error"
                ? "border-red-600 bg-red-50 text-red-950 dark:bg-red-950 dark:text-red-100"
                : "border-brand-yellow bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100";
          return (
            <div key={t.id} role={t.kind === "error" ? "alert" : undefined} className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border-l-8 p-4 shadow-panel ${color}`}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <p className="flex-1 text-sm font-semibold">{t.message}</p>
              <button className="opacity-70 hover:opacity-100" aria-label="Dismiss" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}>
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
