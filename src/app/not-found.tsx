import Link from "next/link";
import { LogoMark } from "@/components/shell/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark className="h-14 w-14" />
      <h1 className="text-3xl font-extrabold">Not found</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">That record doesn&apos;t exist or you don&apos;t have access to it.</p>
      <Link href="/dashboard" className="btn btn-primary">Back to dashboard</Link>
    </main>
  );
}
