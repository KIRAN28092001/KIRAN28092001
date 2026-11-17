export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="12" fill="#F5B800" />
      <path d="M14 30.5l9.2-9.2a6.5 6.5 0 018.6-8.4l-4.3 4.3.9 3.4 3.4.9 4.3-4.3a6.5 6.5 0 01-8.4 8.6L18.5 35a3.2 3.2 0 01-4.5-4.5z" fill="#1C1C1E" />
      <circle cx="16.3" cy="32.7" r="1.3" fill="#F5B800" />
      <path d="M33 31h6M33 35h4M33 27h3" stroke="#1C1C1E" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="h-9 w-9" />
      <div className="leading-tight">
        <div className="text-base font-extrabold tracking-tight">Tool Connected</div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Inventory & Tracking</div>
      </div>
    </div>
  );
}
