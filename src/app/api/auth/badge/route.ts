import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ code: z.string().trim().min(3).max(64), password: z.string().min(1).max(200) });

/**
 * Employee badge sign-in: the badge barcode identifies the employee, the password
 * authenticates them. The e-mail lookup runs server-side with the service role,
 * so addresses are never exposed to the browser.
 */
export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Scan your badge and enter your password." }, { status: 400 });

  const generic = NextResponse.json({ error: "Badge or password is incorrect." }, { status: 401 });
  let email: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.rpc("email_for_employee_code", { p_code: parsed.data.code });
    email = (data as string | null) ?? null;
  } catch {
    return NextResponse.json({ error: "Badge sign-in is not configured on this server." }, { status: 503 });
  }
  if (!email) return generic;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error || !data.user) return generic;
  return NextResponse.json({ ok: true });
}
