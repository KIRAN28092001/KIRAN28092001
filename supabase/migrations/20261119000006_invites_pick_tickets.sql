-- =====================================================================
-- Invite-only user setup + warehouse pick-ticket fulfillment
--
-- 1. Users can only join through an admin invitation. A new auth user with
--    no matching invitation (and no server-assigned role) gets an INACTIVE
--    profile, so open sign-ups can never grant access.
-- 2. Approved requests become warehouse PICK TICKETS. Inventory staff pick
--    (scan) the unit and stage it; only then is the requester notified that
--    the tool is ready for pickup, and the reservation clock starts.
--      Submitted -> Approved (pick ticket open) -> Picked / ready for pickup
--      -> Collected by scan (checked out to the employee)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------
create table public.user_invitations (
  id             uuid primary key default gen_random_uuid(),
  email          text not null check (email = lower(trim(email)) and email like '%@%'),
  full_name      text not null check (length(trim(full_name)) >= 2),
  role           text not null default 'labor' references public.roles (id),
  employee_code  text,
  job_title      text,
  phone          text,
  project_ids    uuid[] not null default '{}',
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  auth_user_id   uuid references auth.users (id) on delete set null,
  invited_by     uuid references public.profiles (id) on delete set null,
  invited_at     timestamptz not null default now(),
  last_sent_at   timestamptz not null default now(),
  send_count     integer not null default 1,
  accepted_at    timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index user_invitations_one_pending on public.user_invitations (email) where status = 'pending';
create trigger user_invitations_updated_at before update on public.user_invitations
  for each row execute function public.set_updated_at();

alter table public.user_invitations enable row level security;
create policy invitations_admin_read on public.user_invitations for select to authenticated
  using (public.is_admin() or auth_user_id = auth.uid());
-- writes happen through the server (service role) and accept_invitation()

-- New auth user -> profile. Role and projects come from the admin invitation
-- (or server-only app_metadata used by seeding). Anyone else is inactive.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_inv public.user_invitations;
  v_role text := new.raw_app_meta_data ->> 'role';
  v_active boolean := true;
  p uuid;
begin
  select * into v_inv from public.user_invitations
   where email = lower(new.email) and status = 'pending'
   order by invited_at desc limit 1;

  if v_inv.id is not null then
    v_role := v_inv.role;
    v_active := false; -- activated when the invitee accepts and sets a password
  elsif v_role is null then
    v_role := 'labor';
    v_active := false; -- not invited: no access until an admin activates
  end if;
  if v_role not in ('admin', 'project_lead', 'labor', 'inventory_manager') then v_role := 'labor'; end if;

  insert into public.profiles (id, email, full_name, role, employee_code, job_title, phone, is_active, created_by)
  values (
    new.id, lower(new.email),
    coalesce(v_inv.full_name, new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    v_role,
    coalesce(nullif(v_inv.employee_code, ''), nullif(new.raw_app_meta_data ->> 'employee_code', '')),
    coalesce(nullif(v_inv.job_title, ''), nullif(new.raw_user_meta_data ->> 'job_title', '')),
    coalesce(nullif(v_inv.phone, ''), nullif(new.raw_user_meta_data ->> 'phone', '')),
    v_active, v_inv.invited_by)
  on conflict (id) do nothing;

  if v_inv.id is not null then
    update public.user_invitations set auth_user_id = new.id where id = v_inv.id;
    foreach p in array v_inv.project_ids loop
      insert into public.project_members (project_id, user_id, member_role, created_by)
      values (p, new.id, case when v_role = 'project_lead' then 'lead'::public.member_role else 'member'::public.member_role end, v_inv.invited_by)
      on conflict (project_id, user_id) do nothing;
    end loop;
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Allow trusted functions (accept_invitation) to activate a profile
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.bypass_profile_guard', true) = 'on' then return new; end if;
  if not public.is_admin() then
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active
       or new.employee_code is distinct from old.employee_code or new.email is distinct from old.email then
      raise exception 'Only administrators can change role, status, email or employee code';
    end if;
  end if;
  if new.id = auth.uid() and old.role = 'admin' and new.role <> 'admin' then
    raise exception 'You cannot remove your own admin role';
  end if;
  return new;
end $$;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;

-- Called by the invited user after choosing their password
create or replace function public.accept_invitation()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv public.user_invitations;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_inv from public.user_invitations
   where auth_user_id = auth.uid() and status = 'pending' order by invited_at desc limit 1 for update;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;
  update public.user_invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
  perform set_config('app.bypass_profile_guard', 'on', true);
  update public.profiles set is_active = true where id = auth.uid();
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary, details)
  values (auth.uid(), 'invitation_accepted', 'profile', auth.uid(),
          v_inv.full_name || ' accepted the invitation', jsonb_build_object('role', v_inv.role));
  if v_inv.invited_by is not null then
    perform public.notify(v_inv.invited_by, 'invitation_accepted', v_inv.full_name || ' joined Tool Connected',
      'Invitation accepted (' || v_inv.email || ').', '/users', 'profile', auth.uid(), false);
  end if;
  return jsonb_build_object('status', 'accepted', 'role', v_inv.role);
end $$;
revoke execute on function public.accept_invitation() from public, anon;
grant execute on function public.accept_invitation() to authenticated;

-- ---------------------------------------------------------------------
-- Pick tickets
-- ---------------------------------------------------------------------
create sequence public.pick_ticket_number_seq start 2001;
create table public.pick_tickets (
  id              uuid primary key default gen_random_uuid(),
  ticket_number   text not null unique default ('PT-' || nextval('public.pick_ticket_number_seq')),
  request_id      uuid not null references public.tool_requests (id) on delete cascade,
  parent_tool_id  uuid not null references public.parent_tools (id) on delete restrict,
  project_id      uuid not null references public.projects (id),
  requester_id    uuid not null references public.profiles (id),
  unit_id         uuid references public.tool_units (id) on delete set null,
  status          text not null default 'open' check (status in ('open', 'picked', 'completed', 'cancelled')),
  pick_from       text,
  notes           text,
  picked_by       uuid references public.profiles (id) on delete set null,
  picked_at       timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index pick_tickets_one_active_per_request on public.pick_tickets (request_id) where status in ('open', 'picked');
create index pick_tickets_status_idx on public.pick_tickets (status, created_at);
create index pick_tickets_project_idx on public.pick_tickets (project_id, status);
create trigger pick_tickets_updated_at before update on public.pick_tickets
  for each row execute function public.set_updated_at();

alter table public.pick_tickets enable row level security;
create policy pick_tickets_read on public.pick_tickets for select to authenticated using (
  requester_id = auth.uid() or public.is_staff() or public.is_project_lead(project_id));

alter publication supabase_realtime add table public.pick_tickets;

-- Open a pick ticket for an approved request (internal)
create or replace function public.open_pick_ticket(p_request uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_req public.tool_requests; v_unit public.tool_units; v_parent public.parent_tools; v_id uuid; v_num text;
begin
  select * into v_req from public.tool_requests where id = p_request;
  if exists (select 1 from public.pick_tickets where request_id = p_request and status in ('open', 'picked')) then
    select id into v_id from public.pick_tickets where request_id = p_request and status in ('open', 'picked');
    return v_id;
  end if;
  select * into v_unit from public.tool_units where id = v_req.reserved_unit_id;
  select * into v_parent from public.parent_tools where id = v_req.parent_tool_id;
  insert into public.pick_tickets (request_id, parent_tool_id, project_id, requester_id, unit_id, pick_from)
  values (p_request, v_req.parent_tool_id, v_req.project_id, v_req.requester_id, v_unit.id,
          coalesce(v_unit.location, v_parent.storage_location))
  returning id, ticket_number into v_id, v_num;
  -- no collection deadline until the warehouse has actually picked the tool
  update public.tool_requests set reservation_expires_at = null where id = p_request;
  update public.tool_units set reserved_until = null where id = v_unit.id;
  perform public.log_audit('pick_ticket_opened', 'pick_ticket', v_id, v_unit.id, v_req.project_id,
    v_num || ' opened for ' || v_req.request_number, jsonb_build_object('request_id', p_request));
  perform public.notify_role('inventory_manager', 'pick_ticket_opened', 'New pick ticket ' || v_num,
    v_parent.name || coalesce(' (' || v_unit.unit_code || ')', '') || ' for ' ||
    (select name from public.projects where id = v_req.project_id) || ' — pick from ' ||
    coalesce(v_unit.location, v_parent.storage_location, 'tool crib'),
    '/pick-tickets', 'pick_ticket', v_id, true);
  return v_id;
end $$;
revoke execute on function public.open_pick_ticket(uuid) from public, anon, authenticated;

-- Close tickets automatically when a request leaves the approved state
create or replace function public.sync_pick_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'approved' and new.status <> 'approved' then
    update public.pick_tickets
       set status = case when new.status = 'fulfilled' then 'completed' else 'cancelled' end,
           completed_at = case when new.status = 'fulfilled' then now() else completed_at end
     where request_id = new.id and status in ('open', 'picked');
  elsif new.status = 'approved' and new.reserved_unit_id is distinct from old.reserved_unit_id then
    update public.pick_tickets set unit_id = new.reserved_unit_id
     where request_id = new.id and status = 'open';
  end if;
  return new;
end $$;
revoke execute on function public.sync_pick_ticket() from public, anon, authenticated;
create trigger tool_requests_sync_pick after update of status, reserved_unit_id on public.tool_requests
  for each row execute function public.sync_pick_ticket();

-- Warehouse picks the tool: scan the unit to confirm it is pulled and staged
create or replace function public.pick_ticket_pick(p_ticket uuid, p_code text, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t public.pick_tickets;
  v_req public.tool_requests;
  v_unit public.tool_units;
  v_old uuid;
  v_hours int := coalesce((public.setting('reservation_hold_hours'))::int, 24);
  v_parent public.parent_tools;
begin
  select * into v_t from public.pick_tickets where id = p_ticket for update;
  if not found then raise exception 'Pick ticket not found'; end if;
  if not (public.is_staff() or public.is_project_lead(v_t.project_id)) then
    raise exception 'Only Inventory Managers, Admins or the project lead can pick tickets';
  end if;
  if v_t.status <> 'open' then raise exception 'Pick ticket % is already %', v_t.ticket_number, v_t.status; end if;
  select * into v_req from public.tool_requests where id = v_t.request_id for update;
  if v_req.status <> 'approved' then raise exception 'Request % is no longer approved', v_req.request_number; end if;

  select * into v_unit from public.tool_units where upper(unit_code) = upper(trim(p_code)) for update;
  if not found then raise exception 'No tool unit matches barcode %', p_code; end if;
  if v_unit.parent_tool_id <> v_t.parent_tool_id then
    raise exception 'Wrong tool: % is not a % unit', v_unit.unit_code, (select name from public.parent_tools where id = v_t.parent_tool_id);
  end if;
  if v_unit.id <> coalesce(v_req.reserved_unit_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    if v_unit.status <> 'available' then
      raise exception 'Unit % is % — scan the reserved unit or another available one', v_unit.unit_code, replace(v_unit.status::text, '_', ' ');
    end if;
    -- swap the reservation to the unit actually pulled from the shelf
    v_old := v_req.reserved_unit_id;
    update public.tool_units set status = 'reserved', reserved_for_request_id = v_req.id where id = v_unit.id;
    update public.tool_requests set reserved_unit_id = v_unit.id where id = v_req.id;
    if v_old is not null then
      perform public.release_unit(v_old, 'Released: ' || v_unit.unit_code || ' picked instead for ' || v_req.request_number);
    end if;
  end if;

  update public.tool_units set reserved_until = now() + make_interval(hours => v_hours) where id = v_unit.id;
  update public.tool_requests set reservation_expires_at = now() + make_interval(hours => v_hours) where id = v_req.id;
  update public.pick_tickets set status = 'picked', unit_id = v_unit.id, picked_by = auth.uid(), picked_at = now(),
         notes = coalesce(nullif(trim(p_notes), ''), notes) where id = p_ticket;

  select * into v_parent from public.parent_tools where id = v_t.parent_tool_id;
  perform public.log_audit('pick_ticket_picked', 'pick_ticket', p_ticket, v_unit.id, v_t.project_id,
    v_t.ticket_number || ': ' || v_unit.unit_code || ' picked and staged', jsonb_build_object('notes', p_notes));
  perform public.notify(v_req.requester_id, 'request_ready', 'Ready for pickup: ' || v_parent.name,
    v_unit.unit_code || ' has been picked (' || v_t.ticket_number || ') and is waiting for you at ' ||
    coalesce(v_unit.location, v_parent.storage_location, 'the tool crib') || '. Scan it within ' || v_hours || ' hours to collect.',
    '/requests/' || v_req.id, 'tool_request', v_req.id, true);
  return jsonb_build_object('ticket_number', v_t.ticket_number, 'unit_code', v_unit.unit_code, 'request_number', v_req.request_number);
end $$;
revoke execute on function public.pick_ticket_pick(uuid, text, text) from public, anon;
grant execute on function public.pick_ticket_pick(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Approval now opens a pick ticket instead of starting the pickup clock
-- ---------------------------------------------------------------------
create or replace function public.decide_tool_request(p_request uuid, p_approve boolean, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_req public.tool_requests;
  v_parent public.parent_tools;
  v_unit public.tool_units;
  v_new_status public.request_status;
  v_ticket uuid;
begin
  select * into v_req from public.tool_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if not (public.is_admin() or public.is_project_lead(v_req.project_id)) then
    raise exception 'Only the project lead or an admin can decide this request';
  end if;
  if v_req.status <> 'pending' then raise exception 'Request is already %', v_req.status; end if;
  if v_req.requester_id = auth.uid() and not public.is_admin() then
    raise exception 'You cannot approve your own request';
  end if;
  if not p_approve and coalesce(trim(p_comment), '') = '' then
    raise exception 'Please add a comment explaining the rejection';
  end if;
  select * into v_parent from public.parent_tools where id = v_req.parent_tool_id;

  insert into public.request_approvals (request_id, approver_id, decision, comment)
  values (p_request, auth.uid(), case when p_approve then 'approved' else 'rejected' end, nullif(trim(p_comment), ''));

  if not p_approve then
    update public.tool_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
           decision_comment = trim(p_comment), reserved_unit_id = null where id = p_request;
    if v_req.reserved_unit_id is not null then
      perform public.release_unit(v_req.reserved_unit_id, 'Released: ' || v_req.request_number || ' rejected');
    end if;
    perform public.notify(v_req.requester_id, 'request_rejected', 'Request ' || v_req.request_number || ' rejected',
      v_parent.name || ': ' || trim(p_comment), '/requests/' || p_request, 'tool_request', p_request, true);
    perform public.log_audit('request_rejected', 'tool_request', p_request, v_req.reserved_unit_id, v_req.project_id,
      v_req.request_number || ' rejected', jsonb_build_object('comment', p_comment));
    return jsonb_build_object('status', 'rejected');
  end if;

  if v_req.reserved_unit_id is not null then
    select * into v_unit from public.tool_units where id = v_req.reserved_unit_id for update;
  end if;
  if v_unit.id is null or v_unit.status not in ('pending_approval', 'available') then
    v_unit := null;
    select * into v_unit from public.tool_units
     where parent_tool_id = v_req.parent_tool_id and status = 'available'
     order by unit_number limit 1 for update skip locked;
  end if;

  if v_unit.id is not null then
    v_new_status := 'approved';
    update public.tool_units set status = 'reserved', reserved_for_request_id = p_request, reserved_until = null where id = v_unit.id;
    update public.tool_requests set status = 'approved', reserved_unit_id = v_unit.id, decided_by = auth.uid(),
           decided_at = now(), decision_comment = nullif(trim(p_comment), ''), reservation_expires_at = null where id = p_request;
    v_ticket := public.open_pick_ticket(p_request);
    perform public.notify(v_req.requester_id, 'request_approved', 'Request ' || v_req.request_number || ' approved',
      v_parent.name || ' is approved. The warehouse is picking it — you will be notified when it is ready for pickup.',
      '/requests/' || p_request, 'tool_request', p_request, true);
    perform public.log_audit('request_approved', 'tool_request', p_request, v_unit.id, v_req.project_id,
      v_req.request_number || ' approved; ' || v_unit.unit_code || ' reserved for picking',
      jsonb_build_object('comment', p_comment, 'unit_code', v_unit.unit_code));
  else
    v_new_status := 'waitlisted';
    update public.tool_requests set status = 'waitlisted', reserved_unit_id = null, decided_by = auth.uid(),
           decided_at = now(), decision_comment = nullif(trim(p_comment), '') where id = p_request;
    perform public.notify(v_req.requester_id, 'request_approved', 'Request ' || v_req.request_number || ' approved',
      v_parent.name || ' is approved. No unit is free yet — you will be notified when one is picked for you.',
      '/requests/' || p_request, 'tool_request', p_request, true);
    perform public.log_audit('request_approved', 'tool_request', p_request, null, v_req.project_id,
      v_req.request_number || ' approved (waitlisted)', jsonb_build_object('comment', p_comment));
  end if;
  return jsonb_build_object('status', v_new_status, 'unit_code', v_unit.unit_code);
end $$;

-- Waitlisted requests also go through the warehouse when a unit frees up
create or replace function public.offer_unit_to_queue(p_unit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit public.tool_units;
  v_req public.tool_requests;
begin
  select * into v_unit from public.tool_units where id = p_unit for update;
  if not found or v_unit.status <> 'available' then return; end if;

  select * into v_req from public.tool_requests
   where parent_tool_id = v_unit.parent_tool_id and status = 'waitlisted'
   order by created_at limit 1 for update skip locked;
  if found then
    update public.tool_units set status = 'reserved', reserved_for_request_id = v_req.id, reserved_until = null where id = p_unit;
    update public.tool_requests set status = 'approved', reserved_unit_id = p_unit, reservation_expires_at = null where id = v_req.id;
    perform public.open_pick_ticket(v_req.id);
    perform public.notify(v_req.requester_id, 'request_approved', 'A unit is free for ' || v_req.request_number,
      v_unit.unit_code || ' is reserved for you and queued for picking.', '/requests/' || v_req.id, 'tool_request', v_req.id, false);
    perform public.log_audit('reserved_from_queue', 'tool_unit', p_unit, p_unit, v_req.project_id,
      'Reserved for waitlisted ' || v_req.request_number, jsonb_build_object('request_id', v_req.id));
    return;
  end if;

  select * into v_req from public.tool_requests
   where parent_tool_id = v_unit.parent_tool_id and status = 'pending' and reserved_unit_id is null
   order by created_at limit 1 for update skip locked;
  if found then
    update public.tool_units set status = 'pending_approval', reserved_for_request_id = v_req.id where id = p_unit;
    update public.tool_requests set reserved_unit_id = p_unit where id = v_req.id;
    perform public.log_audit('held_for_request', 'tool_unit', p_unit, p_unit, v_req.project_id,
      'Held for pending ' || v_req.request_number, jsonb_build_object('request_id', v_req.id));
  end if;
end $$;

-- Collection requires the warehouse pick (staff collecting on someone's behalf pick in the same step)
create or replace function public.checkout_scan(p_code text, p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_unit public.tool_units;
  v_req public.tool_requests;
  v_parent public.parent_tools;
  v_ticket public.pick_tickets;
  v_checkout uuid;
  v_holder_name text;
  v_staff boolean;
begin
  select * into v_unit from public.tool_units where upper(unit_code) = upper(trim(p_code)) for update;
  if not found then raise exception 'No tool unit matches barcode %', p_code; end if;
  select * into v_parent from public.parent_tools where id = v_unit.parent_tool_id;

  select * into v_req from public.tool_requests
   where reserved_unit_id = v_unit.id and status = 'approved' and (p_request is null or id = p_request)
   for update;

  if v_req.id is null then
    select * into v_req from public.tool_requests
     where parent_tool_id = v_unit.parent_tool_id and status = 'approved'
       and (p_request is null or id = p_request)
       and (requester_id = auth.uid() or (p_request is not null and public.can_manage_project(project_id)))
     order by created_at limit 1;
    if v_req.id is null then
      raise exception 'No approved request found for % (%). Request the tool first.', v_parent.name, v_unit.unit_code;
    end if;
    raise exception 'Wrong unit scanned. % is staged for you as %.', v_req.request_number,
      coalesce((select unit_code from public.tool_units where id = v_req.reserved_unit_id), 'another unit');
  end if;

  v_staff := public.can_manage_project(v_req.project_id);
  if v_req.requester_id <> auth.uid() and not v_staff then
    raise exception 'Unit % is reserved for another employee', v_unit.unit_code;
  end if;

  select * into v_ticket from public.pick_tickets where request_id = v_req.id and status in ('open', 'picked') for update;
  if v_ticket.id is not null and v_ticket.status = 'open' then
    if v_staff then
      update public.pick_tickets set status = 'picked', unit_id = v_unit.id, picked_by = auth.uid(), picked_at = now() where id = v_ticket.id;
    else
      raise exception '% is approved but the warehouse has not picked it yet (pick ticket %). You will be notified when it is ready.',
        v_req.request_number, v_ticket.ticket_number;
    end if;
  end if;

  if v_req.reservation_expires_at is not null and v_req.reservation_expires_at < now() then
    raise exception 'Reservation for % expired at %. Ask your lead to re-approve.', v_req.request_number,
      to_char(v_req.reservation_expires_at, 'YYYY-MM-DD HH24:MI');
  end if;

  insert into public.checkouts (unit_id, request_id, holder_id, project_id, approved_by, processed_by, expected_return_date)
  values (v_unit.id, v_req.id, v_req.requester_id, v_req.project_id, v_req.decided_by, auth.uid(), v_req.expected_return_date)
  returning id into v_checkout;

  update public.tool_units set status = 'checked_out', current_holder_id = v_req.requester_id,
         current_project_id = v_req.project_id, reserved_for_request_id = null, reserved_until = null
   where id = v_unit.id;
  update public.tool_requests set status = 'fulfilled', fulfilled_at = now() where id = v_req.id;

  select full_name into v_holder_name from public.profiles where id = v_req.requester_id;
  perform public.log_audit('checked_out', 'checkout', v_checkout, v_unit.id, v_req.project_id,
    v_unit.unit_code || ' checked out to ' || v_holder_name,
    jsonb_build_object('request', v_req.request_number, 'expected_return_date', v_req.expected_return_date));
  if v_req.requester_id <> auth.uid() then
    perform public.notify(v_req.requester_id, 'checked_out', 'Tool checked out to you',
      v_unit.unit_code || ' — due back ' || v_req.expected_return_date, '/units/' || v_unit.id, 'tool_unit', v_unit.id, false);
  end if;
  return jsonb_build_object('checkout_id', v_checkout, 'unit_code', v_unit.unit_code, 'tool', v_parent.name,
    'holder', v_holder_name, 'expected_return_date', v_req.expected_return_date);
end $$;

-- Dashboard: add open pick tickets
create or replace function public.open_pick_ticket_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.pick_tickets t
   where t.status = 'open' and (public.is_staff() or public.is_project_lead(t.project_id))
$$;
revoke execute on function public.open_pick_ticket_count() from public, anon;
grant execute on function public.open_pick_ticket_count() to authenticated;

-- Existing approved requests: their units were already staged, so record them as picked
insert into public.pick_tickets (request_id, parent_tool_id, project_id, requester_id, unit_id, status, pick_from, picked_at, created_at)
select r.id, r.parent_tool_id, r.project_id, r.requester_id, r.reserved_unit_id, 'picked',
       coalesce(u.location, pt.storage_location), coalesce(r.decided_at, now()), coalesce(r.decided_at, now())
from public.tool_requests r
join public.parent_tools pt on pt.id = r.parent_tool_id
left join public.tool_units u on u.id = r.reserved_unit_id
where r.status = 'approved'
  and not exists (select 1 from public.pick_tickets t where t.request_id = r.id);
