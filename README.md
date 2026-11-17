# Tool Connected

Construction tool inventory, requests, approvals, transfers, barcode tracking and project-level accountability.

**Stack:** Next.js 15 (App Router, TypeScript, Tailwind CSS) · Supabase (PostgreSQL, Auth, Storage, Realtime, RLS, Edge Functions, pg_cron) · Code 128 barcodes (JsBarcode + jsPDF) · camera scanning (html5-qrcode / native BarcodeDetector).

---

## Features

| Area | What it does |
| --- | --- |
| **Auth** | E-mail/password sign-in, **badge (Employee ID) scan sign-in**, forgot/reset password, "remember me" (session-only cookies when unchecked), protected routes, role-based landing dashboards, logout. |
| **Dashboards** | Labor: *Request Tool*, *Scan*, ready-for-collection, My Active Tools, My Project. Project Lead: pending approvals, transfers to acknowledge/review, overdue tools, project allocation. Admin / Inventory Manager: company KPIs (total, available, checked-out, pending, overdue, needs attention), tools by project, low-stock & maintenance alerts, recent activity. |
| **Catalog / requests** | Instant client-side search across name, brand, category, parent code, unit barcode, serial, project, location; filters (category, availability, project, condition, location) and sorts (availability, name, recently added, most requested, category, project). Camera scan opens a request for that exact unit. Unavailable tools show who holds each unit, project, checkout date, due date and the **request queue** (names masked for labor outside their projects). |
| **Request workflow** | Submit → a unit is *held* (Pending Approval) → lead approves/rejects with comment → unit **Reserved** for N hours → employee scans the **exact** barcode → **Checked Out**. Wrong unit scanned? If it is free it swaps the reservation, otherwise explains which unit is reserved. Uncollected reservations expire and return to stock automatically. When nothing is free the request queues; returned units are auto-offered to the next approved/queued request. |
| **Transfers** | Holder initiates (barcode, receiver, project, reason, condition, notes, photos) → unit **In Transfer** → receiver accepts by scanning or confirming (or declines) → lead/IM notified → lead approves, rejects (custody reverts) or flags. Full custody chain is preserved. |
| **Check-in / returns** | Scan to return with condition Good / Damaged / Needs Maintenance / Missing, notes and photo evidence. Non-good returns block checkout, open a maintenance work order where relevant, and alert the Project Lead + Inventory Managers. |
| **Inventory** | Parent tool + individual units. Parent code auto-generated from brand + type (`MIL-DRL-101`), units `MIL-DRL-101-01…`. Never duplicated (advisory lock + unique constraint). Photos in Supabase Storage. Add units, edit, archive, maintenance, status changes (damaged/missing/retired/clear). |
| **Barcode Label Center** | Code 128 label preview, **PDF** (thermal roll one-per-page or Letter sheet grid) and **PNG** export, 2×1 / 3×2 / 4×6 sizes, parent shelf labels, print counts. |
| **Scanner** | Collect, Return, Receive transfer, Issue (walk-up checkout for IM/leads/admin), Look up. Camera + manual entry + USB/Bluetooth wedge scanners. |
| **Notifications** | Realtime in-app (Supabase Realtime) with unread badge, toasts, deep links, read/unread, clear. E-mail via Edge Function + Resend for: new request, approved/rejected, ready for collection, transfer initiated/completed/rejected/flagged, overdue, damaged/missing, maintenance due. |
| **Reports** | Availability by type & project, checked out by employee, utilization (90 days), overdue, missing/damaged/maintenance, transfer history, requests by project & employee — each exportable to **CSV** and **PDF**. |
| **Audit** | Immutable audit log of every workflow step and master-data change (with field-level diffs); per-unit activity timeline on every unit page. |
| **Admin** | Users & roles (create users, change role, deactivate, send reset e-mail, badge IDs), project team management, organization settings, tool categories. |
| **UX / a11y** | Mobile-first, bottom nav on phones, persistent sidebar on desktop, 44–60 px touch targets for gloved hands, high-contrast status colors with text labels, dark/light mode, skip link, visible focus rings, labelled inputs, `aria-live` toasts, confirmation dialogs for checkout/transfer/return/destructive actions, reduced-motion support. |

## Roles

| Capability | Admin | Project Lead | Inventory Manager | Labor |
| --- | :-: | :-: | :-: | :-: |
| Browse catalog, request, collect, return, transfer own tools | ✅ | ✅ | ✅ | ✅ |
| Approve / reject requests | ✅ all | ✅ own projects | — | — |
| Review (approve / reject / flag) transfers | ✅ | ✅ own projects | flag | — |
| Add / edit tools, units, maintenance, labels | ✅ | ✅ | ✅ | — |
| Retire units | ✅ | — | ✅ | — |
| Direct issue (walk-up checkout) | ✅ | ✅ own projects | ✅ | — |
| See full custody details | ✅ | ✅ | ✅ | own projects |
| Reports & audit log | ✅ all | ✅ own projects | ✅ all | — |
| Users, roles, settings, projects | ✅ | team members of own projects | categories | — |

All rules are enforced **in the database** (RLS + `SECURITY DEFINER` workflow functions that check the caller's role) — the UI only mirrors them.

---

## Project structure

```
supabase/
  migrations/
    20261117000001_schema.sql            tables, enums, indexes
    20261117000002_functions.sql         RLS helpers, workflow RPCs, triggers, housekeeping
    20261117000003_rls_views.sql         row level security, grants, v_catalog view
    20261117000004_storage_realtime_cron.sql  buckets, realtime publication, pg_cron job
  seed.sql                               demo users, projects, 50 tools, live workflow history
  functions/send-notification-email/     Edge Function (Resend e-mail)
  templates/recovery.html                password-reset e-mail template
  config.toml                            Supabase CLI local config
src/
  app/login, forgot-password, reset-password, auth/*   authentication
  app/(app)/*                            protected application pages
  app/api/admin/users                    admin user creation / reset (service role, server-only)
  app/api/auth/badge                     badge sign-in (server-side e-mail lookup)
  app/api/cron/housekeeping              optional cron fallback
  components/                            UI, shell, barcode, scanner, tool workflows
  lib/                                   Supabase clients, auth guards, types, utils
public/login-bg.jpg                      login background
public/tools/*.svg                       category illustrations used by seed data
```

### Database tables
`profiles, roles, projects, project_members, tool_categories, parent_tools, tool_units, tool_images, tool_requests, request_approvals, checkouts, transfers, transfer_acknowledgments, returns, maintenance_records, notifications, audit_logs, barcode_labels, app_settings` — all with foreign keys, timestamps and `created_by` / `updated_by` where relevant.

### Workflow functions (RPC)
`create_parent_tool, add_tool_units, update_tool_unit, submit_tool_request, decide_tool_request, cancel_tool_request, checkout_scan, direct_checkout, return_tool, initiate_transfer, acknowledge_transfer, review_transfer, cancel_transfer, open_maintenance, complete_maintenance, set_unit_status, record_label_print, mark_notifications_read, admin_update_user, run_housekeeping, dashboard_stats, tool_custody, request_queue_position`.
Each one validates input, checks permissions, locks rows, writes the audit log and sends notifications in a single transaction.

---

## Setup

### Prerequisites
- Node.js 20+ and npm
- A Supabase project (free tier works) **or** the [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker for local development

### 1. Install

```bash
npm install
```

```bash
cp .env.example .env.local
```

### 2a. Local Supabase (CLI + Docker)

```bash
supabase start
```

```bash
supabase db reset
```

`db reset` applies all migrations and runs `supabase/seed.sql`. Copy the printed `API URL`, `anon key` and `service_role key` into `.env.local`. Local e-mails (password reset) appear in Inbucket at http://localhost:54324.

### 2b. Hosted Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Link and push the migrations:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   ```bash
   supabase db push
   ```
   (Or paste each file from `supabase/migrations/` into **SQL Editor** in order.)
3. Load demo data: open **SQL Editor**, paste the contents of `supabase/seed.sql` and run it.
4. **Project Settings → API**: copy URL, `anon` key and `service_role` key into `.env.local`.
5. **Authentication → URL Configuration**: set *Site URL* to your app URL and add `https://YOUR_APP/auth/callback` and `https://YOUR_APP/reset-password` to *Redirect URLs*.
6. **Authentication → Providers → Email**: disable public sign-ups (accounts are created by admins).
7. **Authentication → Email Templates → Reset Password** (recommended, works across devices): use the content of `supabase/templates/recovery.html`, i.e. link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
8. **Database → Extensions**: `pg_cron` is enabled by migration 4 and schedules `run_housekeeping()` every 10 minutes (reservation expiry, overdue and maintenance-due alerts). If your plan lacks pg_cron, use the Vercel cron below.

### 3. E-mail notifications (optional but recommended)

1. Create a [Resend](https://resend.com) API key and verify your sending domain.
2. Deploy the Edge Function and set its secrets:
   ```bash
   supabase functions deploy send-notification-email --no-verify-jwt
   ```
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FROM="Tool Connected <tools@yourdomain.com>" APP_URL=https://your-app.example.com WEBHOOK_SECRET=a-long-random-string
   ```
3. **Database → Webhooks → Create**: table `public.notifications`, event `INSERT`, type *Supabase Edge Function* → `send-notification-email`, method `POST`, add HTTP header `x-webhook-secret: <WEBHOOK_SECRET>`.

Only notifications flagged `send_email` (important events) are mailed; the result is written back to `notifications.email_status`. E-mail can be switched off globally in **Settings → Organization settings**.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. The camera scanner requires HTTPS (or `localhost`).

---

## Demo credentials

All demo accounts use the password **`ToolConnect#2026`**.

| Role | E-mail | Badge (Employee ID) |
| --- | --- | --- |
| Admin | `admin@toolconnected.demo` | `ADM-001` |
| Inventory Manager | `inventory@toolconnected.demo` | `INV-001` |
| Project Lead (Lead A — Project A) | `lead.a@toolconnected.demo` | `LD-201` |
| Project Lead (Lead B — Project B) | `lead.b@toolconnected.demo` | `LD-202` |
| Project Lead (Lead C — Project C) | `lead.c@toolconnected.demo` | `LD-203` |
| Project Lead (Lead D — Projects D & E) | `lead.d@toolconnected.demo` | `LD-204` |
| Labor | `marcus.reed@toolconnected.demo` | `EMP-1001` |
| Labor | `sofia.alvarez@toolconnected.demo` | `EMP-1002` |
| Labor | `jamal.carter@toolconnected.demo` … `nora.ibrahim@toolconnected.demo` | `EMP-1003` … `EMP-1016` |

**Change or remove these accounts before going to production.**

### What the seed contains
- 5 projects (Project A–E) with leads and crews, 22 users (1 admin, 1 inventory manager, 4 leads, 16 employees)
- 14 categories, **50 parent tools / 144 individually barcoded units** with serial numbers and images
- 25+ active checkouts (some **overdue**), **pending approvals**, approved-and-ready reservations, a **waitlisted** request, a **queued** request, a rejected request
- Completed, pending-acknowledgment and **flagged** transfers
- Good, **damaged** and **needs-maintenance** returns, a **missing** unit, open and completed **maintenance** records, maintenance-due alerts
- ~100 notifications and ~500 audit events generated by the real workflow functions

Suggested walkthrough: sign in as **marcus.reed** → request a tool → sign in as **lead.a** → approve it (watch the realtime notification) → back as Marcus, open *Scanner → Collect* and type the reserved unit code → transfer it to **emily.nguyen** → sign in as Emily and accept → sign in as **inventory** and check it back in as *Damaged*.

---

## Deployment (Vercel)

1. Push this repository to GitHub and import it in Vercel (framework: Next.js).
2. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (your Vercel URL), `CRON_SECRET`.
3. Deploy. `vercel.json` schedules `/api/cron/housekeeping` hourly as a fallback to pg_cron (Vercel sends `Authorization: Bearer $CRON_SECRET`).
4. Update Supabase **Site URL / Redirect URLs** and the Edge Function `APP_URL` to the production domain.

Any Node host works: `npm run build` then `npm start`.

## Security notes
- The service-role key is only read in server code (`src/lib/supabase/admin.ts`, imported with `server-only`) — never exposed to the browser.
- Roles live in `profiles.role`; new users get their role from `app_metadata` (settable only with the service role), and a trigger blocks non-admins from changing role, status, e-mail or badge ID.
- Every table has RLS. Workflow tables have **no** direct insert/update policies — changes go through the audited functions. Internal helpers (`log_audit`, `notify`, …) are not executable by API roles.
- Evidence photos live in a private bucket, served with short-lived signed URLs; uploads are restricted to the user's own folder.
- Badge sign-in resolves the e-mail on the server and still requires the password.
- Security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` allowing camera on same origin) are set in `next.config.ts`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | TypeScript check |
