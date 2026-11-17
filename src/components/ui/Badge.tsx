import { cn } from "@/lib/utils";

const TONES = {
  green: "bg-emerald-100 text-emerald-900 ring-emerald-700/30 dark:bg-emerald-900/40 dark:text-emerald-200",
  yellow: "bg-amber-100 text-amber-900 ring-amber-700/30 dark:bg-amber-900/40 dark:text-amber-200",
  blue: "bg-sky-100 text-sky-900 ring-sky-700/30 dark:bg-sky-900/40 dark:text-sky-200",
  orange: "bg-orange-100 text-orange-900 ring-orange-700/30 dark:bg-orange-900/40 dark:text-orange-200",
  red: "bg-red-100 text-red-900 ring-red-700/30 dark:bg-red-900/40 dark:text-red-200",
  gray: "bg-zinc-100 text-zinc-800 ring-zinc-500/30 dark:bg-zinc-800 dark:text-zinc-200",
  purple: "bg-violet-100 text-violet-900 ring-violet-700/30 dark:bg-violet-900/40 dark:text-violet-200",
} as const;

const DOTS = {
  green: "bg-emerald-600",
  yellow: "bg-amber-500",
  blue: "bg-sky-600",
  orange: "bg-orange-500",
  red: "bg-red-600",
  gray: "bg-zinc-500",
  purple: "bg-violet-600",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children, className, dot = true }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset", TONES[tone], className)}>
      {dot && <span aria-hidden className={cn("h-2 w-2 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}
