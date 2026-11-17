import Image from "next/image";
import { LogoMark } from "@/components/shell/Logo";

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-brand-cream px-4 py-8">
      <Image src="/login-bg.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[55%_50%] sm:object-center" />
      <div className="relative z-10 w-full max-w-[420px] rounded-3xl border border-white/70 bg-brand-cream-light/95 p-6 text-zinc-900 shadow-panel backdrop-blur-md sm:p-8 [&_.input]:border-zinc-300 [&_.input]:bg-white [&_.input]:text-zinc-900 [&_.label]:text-zinc-800">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="rounded-2xl bg-brand-charcoal p-2 shadow-lg">
            <LogoMark className="h-10 w-10" />
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm font-medium text-zinc-700">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
