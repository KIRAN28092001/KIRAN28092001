import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
      <div className="mb-3 rounded-full bg-brand-yellow/20 p-3">
        <Icon className="h-7 w-7 text-amber-700 dark:text-brand-yellow" aria-hidden />
      </div>
      <h3 className="text-base font-bold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-zinc-600 dark:text-zinc-400">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
