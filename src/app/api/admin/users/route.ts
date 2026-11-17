import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const CreateUser = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail"),
  password: z.string().min(10, "Password must be at least 10 characters").max(72),
  full_name: z.string().trim().min(2, "Name is required").max(120),
  role: z.enum(["admin", "project_lead", "labor", "inventory_manager"]),
  employee_code: z.string().trim().max(32).optional().or(z.literal("")),
  job_title: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  project_ids: z.array(z.string().uuid()).default([]),
});

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id, role, is_active").eq("id", user.id).single();
  return data?.role === "admin" && data.is_active ? data : null;
}

/** Create a user (admin only). Uses the service role on the server; the key never reaches the browser. */
export async function POST(request: NextRequest) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Only administrators can create users." }, { status: 403 });

  const parsed = CreateUser.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const b = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: b.email,
    password: b.password,
    email_confirm: true,
    app_metadata: { role: b.role, employee_code: b.employee_code || null },
    user_metadata: { full_name: b.full_name, job_title: b.job_title || null, phone: b.phone || null },
  });
  if (error || !data.user) return NextResponse.json({ error: error?.message ?? "Could not create user" }, { status: 400 });

  // Profile is created by trigger; make sure role/fields are set and assign projects
  await admin.from("profiles").update({ role: b.role, full_name: b.full_name, employee_code: b.employee_code || null, job_title: b.job_title || null, phone: b.phone || null, created_by: me.id }).eq("id", data.user.id);
  if (b.project_ids.length) {
    await admin.from("project_members").insert(
      b.project_ids.map((pid) => ({ project_id: pid, user_id: data.user!.id, member_role: b.role === "project_lead" ? "lead" : "member", created_by: me.id }))
    );
  }
  await admin.from("audit_logs").insert({ actor_id: me.id, action: "user_created", entity_type: "profile", entity_id: data.user.id, summary: `User ${b.full_name} created as ${b.role}`, details: { email: b.email, role: b.role } });
  return NextResponse.json({ ok: true, id: data.user.id });
}

const ResetBody = z.object({ user_id: z.string().uuid() });

/** Send a password-reset e-mail to a user (admin only). */
export async function PATCH(request: NextRequest) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Only administrators can reset passwords." }, { status: 403 });
  const parsed = ResetBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("email").eq("id", parsed.data.user_id).single();
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const { error } = await admin.auth.resetPasswordForEmail(profile.email, { redirectTo: `${site}/reset-password` });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
