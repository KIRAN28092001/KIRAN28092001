import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const REASONS = new Set(["inactive", "profile"]);

async function signOut(request: NextRequest, query: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL(`/login?${query}`, request.url), { status: 303 });
  res.cookies.delete("tc_requires_ephemeral");
  res.cookies.delete("tc_ephemeral");
  return res;
}

/** Normal sign-out from the app shell (form POST). */
export async function POST(request: NextRequest) {
  return signOut(request, "signedout=1");
}

/** Forced sign-out used by server guards (deactivated account / missing profile). */
export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("error") ?? "";
  if (!REASONS.has(reason)) return NextResponse.redirect(new URL("/dashboard", request.url));
  return signOut(request, `error=${reason}`);
}
