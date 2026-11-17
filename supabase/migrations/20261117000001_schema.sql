-- =====================================================================
-- Tool Connected App — core schema
-- Tables, enums, sequences, indexes, views
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.tool_status as enum (
  'available', 'reserved', 'pending_approval', 'checked_out', 'in_transfer',
  'maintenance', 'damaged', 'missing', 'retired'
);
create type public.tool_condition as enum ('good', 'fair', 'damaged', 'needs_maintenance', 'missing');
create type public.request_status as enum ('pending', 'approved', 'waitlisted', 'rejected', 'cancelled', 'fulfilled', 'expired');
create type public.transfer_status as enum ('pending_acknowledgment', 'completed', 'declined', 'rejected', 'cancelled');
create type public.lead_review_status as enum ('pending', 'approved', 'rejected', 'flagged');
create type public.checkout_status as enum ('active', 'returned', 'transferred');
create type public.return_condition as enum ('good', 'damaged', 'needs_maintenance', 'missing');
create type public.maintenance_status as enum ('open', 'in_progress', 'completed', 'cancelled');
create type public.maintenance_type as enum ('scheduled', 'repair', 'inspection', 'calibration');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed');
create type public.member_role as enum ('lead', 'member');

-- ---------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and to_jsonb(new) ? 'updated_by' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_by', auth.uid()));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Roles & profiles
-- ---------------------------------------------------------------------
create table public.roles (
  id          text primary key check (id in ('admin', 'project_lead', 'labor', 'inventory_manager')),
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

insert into public.roles (id, name, description) values
  ('admin', 'Admin', 'Full access to users, projects, inventory, approvals, reports, settings and audit history.'),
  ('project_lead', 'Project Lead', 'Approves requests and transfers for assigned projects; manages project tools.'),
  ('inventory_manager', 'Inventory Manager', 'Manages inventory, labels, check-outs/check-ins and audits.'),
  ('labor', 'Labor / Employee', 'Requests, collects, transfers and returns tools on assigned projects.');

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  full_name      text not null default '',
  role           text not null default 'labor' references public.roles (id),
  employee_code  text unique,
  phone          text,
  job_title      text,
  avatar_url     text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  updated_by     uuid references auth.users (id) on delete set null
);
create index profiles_role_idx on public.profiles (role);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (key, value, description) values
  ('organization_name', '"Tool Connected Construction"', 'Company name shown on labels and reports'),
  ('reservation_hold_hours', '24', 'Hours an approved tool stays reserved before returning to stock'),
  ('default_loan_days', '7', 'Default number of days between checkout and expected return'),
  ('email_notifications_enabled', 'true', 'Send email for important events (requires the email Edge Function)'),
  ('support_email', '"tool-support@example.com"', 'Shown on the login page for account support'),
  ('label_size', '"2x1"', 'Default barcode label size: 2x1, 3x2 or 4x6 (inches)');

-- ---------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  location    text,
  status      public.project_status not null default 'active',
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null,
  constraint project_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  member_role public.member_role not null default 'member',
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  unique (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------
-- Tool catalog
-- ---------------------------------------------------------------------
create table public.tool_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  code        text not null unique check (code ~ '^[A-Z]{2,4}$'),
  description text,
  image_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  updated_by  uuid references auth.users (id) on delete set null
);
create trigger tool_categories_updated_at before update on public.tool_categories
  for each row execute function public.set_updated_at();

create table public.parent_tools (
  id                        uuid primary key default gen_random_uuid(),
  parent_code               text not null unique,
  name                      text not null check (length(trim(name)) > 1),
  brand                     text not null check (length(trim(brand)) > 0),
  category_id               uuid not null references public.tool_categories (id),
  model_number              text,
  description               text,
  quantity                  integer not null default 0 check (quantity >= 0),
  purchase_date             date,
  purchase_value            numeric(12, 2) check (purchase_value is null or purchase_value >= 0),
  supplier                  text,
  min_stock_threshold       integer not null default 1 check (min_stock_threshold >= 0),
  maintenance_interval_days integer check (maintenance_interval_days is null or maintenance_interval_days > 0),
  home_project_id           uuid references public.projects (id) on delete set null,
  storage_location          text,
  notes                     text,
  image_url                 text,
  times_requested           integer not null default 0,
  is_archived               boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid references auth.users (id) on delete set null,
  updated_by                uuid references auth.users (id) on delete set null
);
create index parent_tools_category_idx on public.parent_tools (category_id);
create index parent_tools_home_project_idx on public.parent_tools (home_project_id);
create index parent_tools_search_idx on public.parent_tools using gin (
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(parent_code, '') || ' ' || coalesce(model_number, ''))
);
create trigger parent_tools_updated_at before update on public.parent_tools
  for each row execute function public.set_updated_at();

create table public.tool_units (
  id                      uuid primary key default gen_random_uuid(),
  parent_tool_id          uuid not null references public.parent_tools (id) on delete cascade,
  unit_number             integer not null check (unit_number > 0),
  unit_code               text not null unique,
  serial_number           text,
  status                  public.tool_status not null default 'available',
  condition               public.tool_condition not null default 'good',
  current_holder_id       uuid references public.profiles (id) on delete set null,
  current_project_id      uuid references public.projects (id) on delete set null,
  location                text,
  reserved_for_request_id uuid,
  reserved_until          timestamptz,
  last_maintenance_at     timestamptz,
  next_maintenance_due    date,
  maintenance_notified_at timestamptz,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid references auth.users (id) on delete set null,
  updated_by              uuid references auth.users (id) on delete set null,
  unique (parent_tool_id, unit_number)
);
create index tool_units_parent_idx on public.tool_units (parent_tool_id);
create index tool_units_status_idx on public.tool_units (status);
create index tool_units_holder_idx on public.tool_units (current_holder_id);
create index tool_units_project_idx on public.tool_units (current_project_id);
create unique index tool_units_serial_uidx on public.tool_units (serial_number) where serial_number is not null;
create trigger tool_units_updated_at before update on public.tool_units
  for each row execute function public.set_updated_at();

create table public.tool_images (
  id             uuid primary key default gen_random_uuid(),
  parent_tool_id uuid references public.parent_tools (id) on delete cascade,
  unit_id        uuid references public.tool_units (id) on delete cascade,
  storage_path   text,
  url            text not null,
  caption        text,
  is_primary     boolean not null default false,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  constraint tool_images_owner check (parent_tool_id is not null or unit_id is not null)
);
create index tool_images_parent_idx on public.tool_images (parent_tool_id);

create table public.barcode_labels (
  id              uuid primary key default gen_random_uuid(),
  parent_tool_id  uuid references public.parent_tools (id) on delete cascade,
  unit_id         uuid references public.tool_units (id) on delete cascade,
  code            text not null unique,
  symbology       text not null default 'CODE128',
  label_type      text not null default 'unit' check (label_type in ('unit', 'parent')),
  print_count     integer not null default 0,
  last_printed_at timestamptz,
  last_printed_by uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------
-- Requests & approvals
-- ---------------------------------------------------------------------
create sequence public.request_number_seq start 1001;
create table public.tool_requests (
  id                     uuid primary key default gen_random_uuid(),
  request_number         text not null unique default ('REQ-' || nextval('public.request_number_seq')),
  parent_tool_id         uuid not null references public.parent_tools (id) on delete restrict,
  requester_id           uuid not null references public.profiles (id) on delete cascade,
  project_id             uuid not null references public.projects (id),
  reason                 text not null check (length(trim(reason)) >= 3),
  note                   text,
  expected_return_date   date not null,
  status                 public.request_status not null default 'pending',
  reserved_unit_id       uuid references public.tool_units (id) on delete set null,
  reservation_expires_at timestamptz,
  decided_by             uuid references public.profiles (id) on delete set null,
  decided_at             timestamptz,
  decision_comment       text,
  fulfilled_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references auth.users (id) on delete set null,
  updated_by             uuid references auth.users (id) on delete set null
);
create index tool_requests_requester_idx on public.tool_requests (requester_id);
create index tool_requests_project_idx on public.tool_requests (project_id, status);
create index tool_requests_parent_idx on public.tool_requests (parent_tool_id, status, created_at);
create trigger tool_requests_updated_at before update on public.tool_requests
  for each row execute function public.set_updated_at();

alter table public.tool_units
  add constraint tool_units_reserved_request_fk
  foreign key (reserved_for_request_id) references public.tool_requests (id) on delete set null;

create table public.request_approvals (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.tool_requests (id) on delete cascade,
  approver_id uuid not null references public.profiles (id),
  decision    text not null check (decision in ('approved', 'rejected')),
  comment     text,
  created_at  timestamptz not null default now()
);
create index request_approvals_request_idx on public.request_approvals (request_id);

-- ---------------------------------------------------------------------
-- Custody: checkouts, transfers, returns
-- ---------------------------------------------------------------------
create table public.checkouts (
  id                   uuid primary key default gen_random_uuid(),
  unit_id              uuid not null references public.tool_units (id) on delete restrict,
  request_id           uuid references public.tool_requests (id) on delete set null,
  transfer_id          uuid,
  holder_id            uuid not null references public.profiles (id),
  project_id           uuid not null references public.projects (id),
  approved_by          uuid references public.profiles (id) on delete set null,
  processed_by         uuid references public.profiles (id) on delete set null,
  checked_out_at       timestamptz not null default now(),
  expected_return_date date not null,
  returned_at          timestamptz,
  status               public.checkout_status not null default 'active',
  overdue_notified_at  timestamptz,
  notes                text,
  created_at           timestamptz not null default now()
);
create unique index checkouts_one_active_per_unit on public.checkouts (unit_id) where status = 'active';
create index checkouts_holder_idx on public.checkouts (holder_id, status);
create index checkouts_project_idx on public.checkouts (project_id, status);

create sequence public.transfer_number_seq start 501;
create table public.transfers (
  id                    uuid primary key default gen_random_uuid(),
  transfer_number       text not null unique default ('TRF-' || nextval('public.transfer_number_seq')),
  unit_id               uuid not null references public.tool_units (id) on delete restrict,
  from_user_id          uuid not null references public.profiles (id),
  to_user_id            uuid not null references public.profiles (id),
  project_id            uuid not null references public.projects (id),
  reason                text not null check (length(trim(reason)) >= 3),
  condition_at_transfer public.tool_condition not null default 'good',
  notes                 text,
  photo_urls            text[] not null default '{}',
  status                public.transfer_status not null default 'pending_acknowledgment',
  lead_review           public.lead_review_status not null default 'pending',
  reviewed_by           uuid references public.profiles (id) on delete set null,
  reviewed_at           timestamptz,
  review_comment        text,
  from_checkout_id      uuid references public.checkouts (id) on delete set null,
  to_checkout_id        uuid references public.checkouts (id) on delete set null,
  completed_at          timestamptz,
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint transfer_different_people check (from_user_id <> to_user_id)
);
create index transfers_unit_idx on public.transfers (unit_id, created_at);
create index transfers_from_idx on public.transfers (from_user_id);
create index transfers_to_idx on public.transfers (to_user_id);
create index transfers_project_idx on public.transfers (project_id, status);
create trigger transfers_updated_at before update on public.transfers
  for each row execute function public.set_updated_at();

alter table public.checkouts
  add constraint checkouts_transfer_fk foreign key (transfer_id) references public.transfers (id) on delete set null;

create table public.transfer_acknowledgments (
  id           uuid primary key default gen_random_uuid(),
  transfer_id  uuid not null references public.transfers (id) on delete cascade,
  user_id      uuid not null references public.profiles (id),
  method       text not null check (method in ('scan', 'confirm')),
  scanned_code text,
  accepted     boolean not null,
  comment      text,
  created_at   timestamptz not null default now()
);
create index transfer_ack_transfer_idx on public.transfer_acknowledgments (transfer_id);

create table public.returns (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references public.tool_units (id) on delete restrict,
  checkout_id uuid references public.checkouts (id) on delete set null,
  project_id  uuid references public.projects (id) on delete set null,
  returned_by uuid not null references public.profiles (id),
  holder_id   uuid references public.profiles (id),
  condition   public.return_condition not null,
  notes       text,
  photo_urls  text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index returns_unit_idx on public.returns (unit_id);
create index returns_project_idx on public.returns (project_id);

create table public.maintenance_records (
  id                uuid primary key default gen_random_uuid(),
  unit_id           uuid not null references public.tool_units (id) on delete cascade,
  type              public.maintenance_type not null default 'repair',
  status            public.maintenance_status not null default 'open',
  description       text not null check (length(trim(description)) >= 3),
  resolution        text,
  cost              numeric(12, 2) check (cost is null or cost >= 0),
  vendor            text,
  opened_by         uuid references public.profiles (id) on delete set null,
  completed_by      uuid references public.profiles (id) on delete set null,
  opened_at         timestamptz not null default now(),
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index maintenance_unit_idx on public.maintenance_records (unit_id, status);
create trigger maintenance_records_updated_at before update on public.maintenance_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Notifications & audit
-- ---------------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  type         text not null,
  title        text not null,
  body         text,
  link         text,
  entity_type  text,
  entity_id    uuid,
  is_read      boolean not null default false,
  read_at      timestamptz,
  send_email   boolean not null default false,
  email_status text not null default 'skipped' check (email_status in ('pending', 'sent', 'skipped', 'failed')),
  created_at   timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  unit_id     uuid references public.tool_units (id) on delete set null,
  project_id  uuid references public.projects (id) on delete set null,
  summary     text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_unit_idx on public.audit_logs (unit_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_project_idx on public.audit_logs (project_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
