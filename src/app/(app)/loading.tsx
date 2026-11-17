export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-9 w-64 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
