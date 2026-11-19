import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Invite-only onboarding. Admins send invitations; Supabase e-mails the invitee
 * a secure link to /accept-invite where they choose a password. Role, badge ID
 * and project assignments come from the invitation record (applied by the
 * handle_new_user trigger), never from anything the invitee can edit.
 */

const Invite = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid e-mail"),
  full_name: z.string().trim().min(2, "Name is required").max(120),
  role: z.enum(["admin", "project_lead", "labor", "inventory_manager"]),
  employee_code: z.string().trim().max(32).optional().or(z.literal("")),
  job_title: z.string().trim().max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  project_ids: z.array(z.string().uuid()).default([]),
});
const ById = z.object({ id: z.string().uuid() });

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("id, role, is_active").eq("id", user.id).single();
  return data?.role === "admin" && data.is_active ? data : null;
}

function siteUrl(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

function adminOrError() {
  try {
    return { admin: createAdminClient() };
  } catch {
    return { error: NextResponse.json({ error: "Invitations need SUPABASE_SERVICE_ROLE_KEY configured on the server." }, { status: 503 }) };
  }
}

/** Send a new invitation */
export async function POST(request: NextRequest) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Only administrators can invite users." }, { status: 403 });
  const parsed = Invite.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const b = parsed.data;
  const { admin, error } = adminOrError();
  if (error) return error;

  const { data: existing } = await admin.from("profiles").select("id, is_active").eq("email", b.email).maybeSingle();
  if (existing) return NextResponse.json({ error: "Someone with this e-mail already has an account (or a pending invitation)." }, { status: 409 });
  if (b.employee_code) {
    const { data: codeTaken } = await admin.from("profiles").select("id").ilike("employee_code", b.employee_code).maybeSingle();
    if (codeTaken) return NextResponse.json({ error: "That employee ID is already in use." }, { status: 409 });
  }

  const { data: inv, error: invErr } = await admin
    .from("user_invitations")
    .insert({
      email: b.email,
      full_name: b.full_name,
      role: b.role,
      employee_code: b.employee_code || null,
      job_title: b.job_title || null,
      phone: b.phone || null,
      project_ids: b.project_ids,
      invited_by: me.id,
    })
    .select("id")
    .single();
  if (invErr || !inv) {
    return NextResponse.json({ error: invErr?.code === "23505" ? "This e-mail already has a pending invitation — use Resend." : invErr?.message ?? "Could not create invitation" }, { status: 400 });
  }

  const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(b.email, {
    redirectTo: `${siteUrl(request)}/accept-invite`,
    data: { full_name: b.full_name },
  });
  if (sendErr) {
    await admin.from("user_invitations").delete().eq("id", inv.id);
    return NextResponse.json({ error: `Invitation e-mail could not be sent: ${sendErr.message}` }, { status: 400 });
  }
  await admin.from("audit_logs").insert({
    actor_id: me.id, action: "user_invited", entity_type: "invitation", entity_id: inv.id,
    summary: `${b.full_name} invited as ${b.role.replace("_", " ")}`, details: { email: b.email, role: b.role, projects: b.project_ids },
  });
  return NextResponse.json({ ok: true, id: inv.id });
}

/** Resend a pending invitation */
export async function PATCH(request: NextRequest) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Only administrators can manage invitations." }, { status: 403 });
  const parsed = ById.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { admin, error } = adminOrError();
  if (error) return error;
  const { data: inv } = await admin.from("user_invitations").select("*").eq("id", parsed.data.id).single();
  if (!inv || inv.status !== "pending") return NextResponse.json({ error: "Only pending invitations can be resent." }, { status: 400 });

  const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(inv.email, {
    redirectTo: `${siteUrl(request)}/accept-invite`,
    data: { full_name: inv.full_name },
  });
  if (sendErr) return NextResponse.json({ error: `Could not resend: ${sendErr.message}` }, { status: 400 });
  await admin.from("user_invitations").update({ last_sent_at: new Date().toISOString(), send_count: (inv.send_count ?? 1) + 1 }).eq("id", inv.id);
  return NextResponse.json({ ok: true });
}

/** Revoke a pending invitation (removes the not-yet-activated account) */
export async function DELETE(request: NextRequest) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "Only administrators can manage invitations." }, { status: 403 });
  const parsed = ById.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { admin, error } = adminOrError();
  if (error) return error;
  const { data: inv } = await admin.from("user_invitations").select("*").eq("id", parsed.data.id).single();
  if (!inv || inv.status !== "pending") return NextResponse.json({ error: "Only pending invitations can be revoked." }, { status: 400 });

  await admin.from("user_invitations").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", inv.id);
  if (inv.auth_user_id) await admin.auth.admin.deleteUser(inv.auth_user_id);
  await admin.from("audit_logs").insert({
    actor_id: me.id, action: "invitation_revoked", entity_type: "invitation", entity_id: inv.id,
    summary: `Invitation for ${inv.full_name} revoked`, details: { email: inv.email },
  });
  return NextResponse.json({ ok: true });
}
