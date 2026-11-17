import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  let supportEmail = "tool-support@example.com";
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("app_settings").select("value").eq("key", "support_email").maybeSingle();
    if (data?.value) supportEmail = String(data.value);
  } catch {}

  const notice =
    params.error === "inactive"
      ? "Your account is deactivated. Contact your administrator."
      : params.error === "link"
        ? "That link is invalid or has expired. Request a new one."
        : params.error === "profile"
          ? "Your account has no profile yet. Contact your administrator."
          : params.expired
            ? "Your session ended when the browser was closed. Please sign in again."
            : params.signedout
              ? "You have been signed out."
              : params.reset
                ? "Password updated. Sign in with your new password."
                : null;

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-brand-cream px-4 py-8">
      {/* Full-bleed construction-tools background: covers on desktop, crops to center on phones */}
      <Image src="/login-bg.jpg" alt="" fill priority sizes="100vw" className="object-cover object-[55%_50%] sm:object-center" />
      {/* Soft vignette keeps edges visible while improving card contrast */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(243,233,210,0.55)_0%,rgba(243,233,210,0.15)_45%,transparent_70%)]" aria-hidden />
      <LoginForm next={params.next} notice={notice} supportEmail={supportEmail} />
    </main>
  );
}
