import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, icon: Icon, href, accent = "default", hint }: { label: string; value: number | string; icon: LucideIcon; href?: string; accent?: "default" | "yellow" | "red" | "green" | "blue"; hint?: string }) {
  const accents = {
    default: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    yellow: "bg-brand-yellow text-brand-charcoal",
    red: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
    blue: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  };
  const body = (
    <div className="card card-pad flex h-full items-center gap-4 transition hover:border-brand-yellow">
      <div className={cn("rounded-xl p-3", accents[accent])}>
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</div>
        <div className="truncate text-sm font-semibold text-zinc-600 dark:text-zinc-400">{label}</div>
        {hint && <div className="text-xs text-zinc-500">{hint}</div>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl" aria-label={`${label}: ${value}`}>
      {body}
    </Link>
  ) : (
    body
  );
}
