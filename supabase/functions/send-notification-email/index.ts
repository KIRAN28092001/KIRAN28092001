// Supabase Edge Function: send-notification-email
// Triggered by a Database Webhook on INSERT into public.notifications.
// Sends an e-mail through Resend for rows where send_email = true, then
// records the delivery status on the notification row.
//
// Required secrets (supabase secrets set ...):
//   RESEND_API_KEY, EMAIL_FROM, APP_URL, WEBHOOK_SECRET
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  send_email: boolean;
  email_status: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function render(n: NotificationRecord, name: string, appUrl: string) {
  const url = n.link ? `${appUrl}${n.link}` : `${appUrl}/notifications`;
  const html = `<!doctype html><html><body style="margin:0;background:#F3E9D2;font-family:Segoe UI,Roboto,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
      <tr><td style="background:#1C1C1E;padding:18px 24px;color:#F5B800;font-weight:800;font-size:18px">Tool Connected</td></tr>
      <tr><td style="padding:24px;color:#1C1C1E">
        <p style="margin:0 0 8px;font-size:14px;color:#555">Hi ${esc(name)},</p>
        <h1 style="margin:0 0 12px;font-size:20px">${esc(n.title)}</h1>
        ${n.body ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.5">${esc(n.body)}</p>` : ""}
        <a href="${esc(url)}" style="display:inline-block;background:#F5B800;color:#1C1C1E;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Open in Tool Connected</a>
      </td></tr>
      <tr><td style="padding:16px 24px;font-size:12px;color:#777;border-top:1px solid #eee">You receive this because you are part of a Tool Connected project. Manage alerts in the app.</td></tr>
    </table></td></tr></table></body></html>`;
  const text = `${n.title}\n\n${n.body ?? ""}\n\nOpen: ${url}`;
  return { html, text };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return new Response("Unauthorized", { status: 401 });

  const payload = await req.json().catch(() => null);
  const record = payload?.record as NotificationRecord | undefined;
  if (!record || payload?.type !== "INSERT" || payload?.table !== "notifications") return new Response("Ignored", { status: 200 });
  if (!record.send_email || record.email_status !== "pending") return new Response("No e-mail required", { status: 200 });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: profile } = await supabase.from("profiles").select("email, full_name, is_active").eq("id", record.user_id).single();
  if (!profile?.email || !profile.is_active) {
    await supabase.from("notifications").update({ email_status: "skipped" }).eq("id", record.id);
    return new Response("Skipped", { status: 200 });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    await supabase.from("notifications").update({ email_status: "failed" }).eq("id", record.id);
    return new Response("RESEND_API_KEY missing", { status: 500 });
  }
  const { html, text } = render(record, profile.full_name || "there", Deno.env.get("APP_URL") ?? "");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("EMAIL_FROM") ?? "Tool Connected <onboarding@resend.dev>", to: [profile.email], subject: record.title, html, text }),
  });
  await supabase.from("notifications").update({ email_status: res.ok ? "sent" : "failed" }).eq("id", record.id);
  return new Response(res.ok ? "Sent" : `Send failed: ${await res.text()}`, { status: res.ok ? 200 : 502 });
});
