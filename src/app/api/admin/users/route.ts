import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Accounts are created only through invitations (/api/admin/invitations).
// This route only sends password-reset e-mails for existing users.

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id, role, is_active").eq("id", user.id).single();
  return data?.role === "admin" && data.is_active ? data : null;
}

const ResetBody = z.object({ user_id: z.string().uuid() });

/** Send a password-reset e-mail to a user (admin only). */
export async function PATCH(request: NextRequest) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Only administrators can reset passwords." }, { status: 403 });
  const parsed = ResetBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Password resets need SUPABASE_SERVICE_ROLE_KEY configured on the server." }, { status: 503 });
  }
  const { data: profile } = await admin.from("profiles").select("email").eq("id", parsed.data.user_id).single();
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const { error } = await admin.auth.resetPasswordForEmail(profile.email, { redirectTo: `${site}/reset-password` });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
