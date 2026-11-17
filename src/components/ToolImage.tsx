/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

export function ToolImage({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-cream to-brand-cream-light dark:from-zinc-800 dark:to-zinc-900", className)}>
      {src ? <img src={src} alt={alt} loading="lazy" className="h-full w-full object-contain p-2" /> : <span className="text-xs font-semibold text-zinc-500">No photo</span>}
    </div>
  );
}
