-- =====================================================================
-- Tool Connected App — helper functions, workflow RPCs, triggers
-- All state-changing workflows run inside SECURITY DEFINER functions so
-- they are atomic, validated, permission-checked and audit-logged.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identity helpers (used by RLS — SECURITY DEFINER avoids recursion)
-- ---------------------------------------------------------------------
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('admin', 'inventory_manager'), false)
$$;

create or replace function public.is_project_lead_role()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'project_lead', false)
$$;

create or replace function public.is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = p_project and user_id = auth.uid())
$$;

create or replace function public.is_project_lead(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members pm
    join public.profiles p on p.id = pm.user_id
    where pm.project_id = p_project and pm.user_id = auth.uid()
      and pm.member_role = 'lead' and p.role = 'project_lead' and p.is_active)
$$;

create or replace function public.can_manage_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() or public.is_project_lead(p_project)
$$;

create or replace function public.shares_project_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members a
    join public.project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = p_user)
$$;

create or replace function public.setting(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key
$$;

-- ---------------------------------------------------------------------
-- Audit + notifications primitives
-- ---------------------------------------------------------------------
create or replace function public.log_audit(
  p_action text, p_entity_type text, p_entity_id uuid,
  p_unit_id uuid default null, p_project_id uuid default null,
  p_summary text default null, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, unit_id, project_id, summary, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_unit_id, p_project_id, p_summary, coalesce(p_details, '{}'::jsonb));
end $$;

create or replace function public.notify(
  p_user uuid, p_type text, p_title text, p_body text, p_link text,
  p_entity_type text default null, p_entity_id uuid default null, p_email boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email boolean := p_email and coalesce((public.setting('email_notifications_enabled'))::boolean, true);
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, type, title, body, link, entity_type, entity_id, send_email, email_status)
  values (p_user, p_type, p_title, p_body, p_link, p_entity_type, p_entity_id, v_email,
          case when v_email then 'pending' else 'skipped' end);
end $$;

-- Notify every lead of a project (optionally excluding one user)
create or replace function public.notify_project_leads(
  p_project uuid, p_type text, p_title text, p_body text, p_link text,
  p_entity_type text, p_entity_id uuid, p_email boolean default true, p_exclude uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select pm.user_id from public.project_members pm
    join public.profiles p on p.id = pm.user_id
    where pm.project_id = p_project and pm.member_role = 'lead' and p.is_active
      and pm.user_id is distinct from p_exclude
  loop
    perform public.notify(r.user_id, p_type, p_title, p_body, p_link, p_entity_type, p_entity_id, p_email);
  end loop;
end $$;

create or replace function public.notify_role(
  p_role text, p_type text, p_title text, p_body text, p_link text,
  p_entity_type text, p_entity_id uuid, p_email boolean default true, p_exclude uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles where role = p_role and is_active and id is distinct from p_exclude loop
    perform public.notify(r.id, p_type, p_title, p_body, p_link, p_entity_type, p_entity_id, p_email);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- New auth user -> profile. Role comes from app_metadata (server-only),
-- never from user-editable user_metadata.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_app_meta_data ->> 'role', 'labor');
begin
  if v_role not in ('admin', 'project_lead', 'labor', 'inventory_manager') then v_role := 'labor'; end if;
  insert into public.profiles (id, email, full_name, role, employee_code, job_title, phone)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    v_role,
    nullif(new.raw_app_meta_data ->> 'employee_code', ''),
    nullif(new.raw_user_meta_data ->> 'job_title', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent privilege escalation through direct profile updates
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role / migrations
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
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Generic audit trigger for master-data tables
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_changes jsonb := '{}'::jsonb;
  k text;
  v_project uuid;
  v_label text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_row) loop
      if k not in ('updated_at', 'updated_by') and (v_row -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_row -> k));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return new; end if;
  end if;

  v_project := case
    when tg_table_name = 'projects' then (v_row ->> 'id')::uuid
    when tg_table_name = 'project_members' then (v_row ->> 'project_id')::uuid
    when tg_table_name = 'parent_tools' then (v_row ->> 'home_project_id')::uuid
    else null end;
  v_label := coalesce(v_row ->> 'name', v_row ->> 'full_name', v_row ->> 'key', v_row ->> 'parent_code', tg_table_name);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, project_id, summary, details)
  values (
    auth.uid(), lower(tg_op), tg_table_name,
    case when tg_table_name = 'app_settings' then null else (v_row ->> 'id')::uuid end,
    v_project,
    initcap(lower(tg_op)) || 'd ' || replace(tg_table_name, '_', ' ') || ': ' || v_label,
    case when tg_op = 'UPDATE' then jsonb_build_object('changes', v_changes) else jsonb_build_object('row', v_row) end);
  return coalesce(new, old);
end $$;

create trigger audit_projects after insert or update or delete on public.projects
  for each row execute function public.audit_row_change();
create trigger audit_project_members after insert or update or delete on public.project_members
  for each row execute function public.audit_row_change();
create trigger audit_parent_tools after insert or update or delete on public.parent_tools
  for each row execute function public.audit_row_change();
create trigger audit_tool_categories after insert or update or delete on public.tool_categories
  for each row execute function public.audit_row_change();
create trigger audit_profiles after update on public.profiles
  for each row execute function public.audit_row_change();
create trigger audit_app_settings after update on public.app_settings
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------
-- Code generation
-- ---------------------------------------------------------------------
-- Parent code = BRAND(3) + '-' + CATEGORY CODE + '-' + sequence (101+)
-- e.g. Milwaukee drill -> MIL-DRL-101, units MIL-DRL-101-01 .. -05
create or replace function public.generate_parent_code(p_brand text, p_category uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_brand text := upper(left(regexp_replace(coalesce(p_brand, ''), '[^A-Za-z0-9]', '', 'g') || 'XXX', 3));
  v_cat text;
  v_prefix text;
  v_next int;
begin
  select code into v_cat from public.tool_categories where id = p_category;
  if v_cat is null then raise exception 'Unknown tool category'; end if;
  v_prefix := v_brand || '-' || v_cat || '-';
  perform pg_advisory_xact_lock(hashtext('parent_code:' || v_prefix));
  select coalesce(max((substring(parent_code from length(v_prefix) + 1))::int), 100) + 1 into v_next
  from public.parent_tools
  where parent_code like v_prefix || '%' and substring(parent_code from length(v_prefix) + 1) ~ '^[0-9]+$';
  return v_prefix || v_next::text;
end $$;

create or replace function public.create_tool_units(p_parent uuid, p_count int)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_parent public.parent_tools;
  v_start int;
  i int;
  v_unit_id uuid;
  v_code text;
begin
  if p_count < 1 or p_count > 500 then raise exception 'Unit count must be between 1 and 500'; end if;
  select * into v_parent from public.parent_tools where id = p_parent for update;
  if not found then raise exception 'Tool not found'; end if;
  select coalesce(max(unit_number), 0) into v_start from public.tool_units where parent_tool_id = p_parent;
  for i in 1 .. p_count loop
    v_code := v_parent.parent_code || '-' || lpad((v_start + i)::text, 2, '0');
    insert into public.tool_units (parent_tool_id, unit_number, unit_code, status, condition, current_project_id, location,
                                   next_maintenance_due, created_by)
    values (p_parent, v_start + i, v_code, 'available', 'good', v_parent.home_project_id, v_parent.storage_location,
            case when v_parent.maintenance_interval_days is not null
                 then current_date + v_parent.maintenance_interval_days end, auth.uid())
    returning id into v_unit_id;
    insert into public.barcode_labels (parent_tool_id, unit_id, code, label_type, created_by)
    values (p_parent, v_unit_id, v_code, 'unit', auth.uid());
    perform public.log_audit('unit_created', 'tool_unit', v_unit_id, v_unit_id, v_parent.home_project_id,
      'Unit ' || v_code || ' created', jsonb_build_object('parent_code', v_parent.parent_code));
  end loop;
  update public.parent_tools
     set quantity = (select count(*) from public.tool_units where parent_tool_id = p_parent and status <> 'retired')
   where id = p_parent;
  return p_count;
end $$;

-- ---------------------------------------------------------------------
-- Inventory RPCs
-- ---------------------------------------------------------------------
create or replace function public.create_parent_tool(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_code text;
  v_qty int := coalesce((p ->> 'quantity')::int, 0);
  v_category uuid := (p ->> 'category_id')::uuid;
begin
  if not (public.is_staff() or public.is_project_lead_role()) then
    raise exception 'Only Admins, Inventory Managers and Project Leads can add tools';
  end if;
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'Tool name is required'; end if;
  if coalesce(trim(p ->> 'brand'), '') = '' then raise exception 'Brand is required'; end if;
  if v_category is null then raise exception 'Category is required'; end if;
  if v_qty < 1 or v_qty > 500 then raise exception 'Quantity must be between 1 and 500'; end if;

  v_code := public.generate_parent_code(p ->> 'brand', v_category);

  insert into public.parent_tools (
    parent_code, name, brand, category_id, model_number, description, purchase_date, purchase_value, supplier,
    min_stock_threshold, maintenance_interval_days, home_project_id, storage_location, notes, image_url,
    created_by, updated_by)
  values (
    v_code, trim(p ->> 'name'), trim(p ->> 'brand'), v_category, nullif(p ->> 'model_number', ''),
    nullif(p ->> 'description', ''), nullif(p ->> 'purchase_date', '')::date, nullif(p ->> 'purchase_value', '')::numeric,
    nullif(p ->> 'supplier', ''), coalesce(nullif(p ->> 'min_stock_threshold', '')::int, 1),
    nullif(p ->> 'maintenance_interval_days', '')::int, nullif(p ->> 'home_project_id', '')::uuid,
    nullif(p ->> 'storage_location', ''), nullif(p ->> 'notes', ''), nullif(p ->> 'image_url', ''),
    auth.uid(), auth.uid())
  returning id into v_id;

  insert into public.barcode_labels (parent_tool_id, code, label_type, created_by)
  values (v_id, v_code, 'parent', auth.uid());

  if nullif(p ->> 'image_url', '') is not null then
    insert into public.tool_images (parent_tool_id, url, storage_path, is_primary, created_by)
    values (v_id, p ->> 'image_url', nullif(p ->> 'image_path', ''), true, auth.uid());
  end if;

  perform public.create_tool_units(v_id, v_qty);
  return jsonb_build_object('id', v_id, 'parent_code', v_code, 'units', v_qty);
end $$;

create or replace function public.add_tool_units(p_parent uuid, p_count int)
returns int language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not (public.is_staff() or public.is_project_lead_role()) then raise exception 'Not authorized'; end if;
  select parent_code into v_code from public.parent_tools where id = p_parent;
  perform public.create_tool_units(p_parent, p_count);
  perform public.log_audit('units_added', 'parent_tool', p_parent, null, null,
    p_count || ' unit(s) added to ' || v_code, jsonb_build_object('count', p_count));
  return p_count;
end $$;

create or replace function public.update_tool_unit(
  p_unit uuid, p_serial text, p_location text, p_notes text, p_condition public.tool_condition default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.tool_units;
begin
  select * into v from public.tool_units where id = p_unit for update;
  if not found then raise exception 'Unit not found'; end if;
  if not (public.is_staff() or public.is_project_lead_role()) then raise exception 'Not authorized'; end if;
  update public.tool_units
     set serial_number = nullif(trim(p_serial), ''), location = nullif(trim(p_location), ''),
         notes = nullif(trim(p_notes), ''), condition = coalesce(p_condition, condition)
   where id = p_unit;
  perform public.log_audit('unit_updated', 'tool_unit', p_unit, p_unit, v.current_project_id,
    'Unit details updated', jsonb_build_object('serial', p_serial, 'location', p_location, 'condition', p_condition));
end $$;

-- Offer a freshly available unit to the queue for its parent tool.
-- 1) oldest approved-but-waitlisted request -> reserve it
-- 2) otherwise oldest pending request without a held unit -> hold it
create or replace function public.offer_unit_to_queue(p_unit uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit public.tool_units;
  v_req public.tool_requests;
  v_hours int := coalesce((public.setting('reservation_hold_hours'))::int, 24);
begin
  select * into v_unit from public.tool_units where id = p_unit for update;
  if not found or v_unit.status <> 'available' then return; end if;

  select * into v_req from public.tool_requests
   where parent_tool_id = v_unit.parent_tool_id and status = 'waitlisted'
   order by created_at limit 1 for update skip locked;
  if found then
    update public.tool_units set status = 'reserved', reserved_for_request_id = v_req.id,
           reserved_until = now() + make_interval(hours => v_hours) where id = p_unit;
    update public.tool_requests set status = 'approved', reserved_unit_id = p_unit,
           reservation_expires_at = now() + make_interval(hours => v_hours) where id = v_req.id;
    perform public.notify(v_req.requester_id, 'request_ready', 'Tool ready for collection',
      v_unit.unit_code || ' is reserved for ' || v_req.request_number || '. Scan it to collect.',
      '/requests/' || v_req.id, 'tool_request', v_req.id, true);
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

create or replace function public.release_unit(p_unit uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.tool_units;
begin
  select * into v from public.tool_units where id = p_unit for update;
  if not found then return; end if;
  if v.status in ('reserved', 'pending_approval') then
    update public.tool_units set status = 'available', reserved_for_request_id = null, reserved_until = null where id = p_unit;
    perform public.log_audit('released', 'tool_unit', p_unit, p_unit, v.current_project_id, p_reason, '{}'::jsonb);
    perform public.offer_unit_to_queue(p_unit);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Request workflow
-- ---------------------------------------------------------------------
create or replace function public.submit_tool_request(
  p_parent_tool uuid, p_project uuid, p_reason text, p_expected_return date,
  p_note text default null, p_unit_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me public.profiles;
  v_parent public.parent_tools;
  v_project public.projects;
  v_unit public.tool_units;
  v_req public.tool_requests;
  v_queue int;
begin
  select * into v_me from public.profiles where id = auth.uid() and is_active;
  if not found then raise exception 'Your account is inactive or missing a profile'; end if;

  if p_unit_code is not null and trim(p_unit_code) <> '' then
    select * into v_unit from public.tool_units where upper(unit_code) = upper(trim(p_unit_code)) for update;
    if not found then raise exception 'No tool unit matches barcode %', p_unit_code; end if;
    if v_unit.status <> 'available' then
      raise exception 'Unit % is not available (status: %)', v_unit.unit_code, replace(v_unit.status::text, '_', ' ');
    end if;
    p_parent_tool := v_unit.parent_tool_id;
  end if;

  select * into v_parent from public.parent_tools where id = p_parent_tool and not is_archived;
  if not found then raise exception 'Tool not found'; end if;

  select * into v_project from public.projects where id = p_project;
  if not found then raise exception 'Project not found'; end if;
  if v_project.status not in ('active', 'planning') then raise exception 'Project % is not active', v_project.name; end if;
  if not (public.is_staff() or public.is_project_member(p_project)) then
    raise exception 'You are not assigned to project %', v_project.name;
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Please describe the reason (at least 3 characters)'; end if;
  if p_expected_return is null or p_expected_return < current_date then
    raise exception 'Expected return date must be today or later';
  end if;
  if p_expected_return > current_date + 180 then raise exception 'Expected return date cannot be more than 180 days out'; end if;
  if exists (select 1 from public.tool_requests where requester_id = auth.uid() and parent_tool_id = p_parent_tool
             and status in ('pending', 'approved', 'waitlisted')) then
    raise exception 'You already have an open request for %', v_parent.name;
  end if;

  if v_unit.id is null then
    select * into v_unit from public.tool_units
     where parent_tool_id = p_parent_tool and status = 'available'
     order by unit_number limit 1 for update skip locked;
  end if;

  insert into public.tool_requests (parent_tool_id, requester_id, project_id, reason, note, expected_return_date,
                                    reserved_unit_id, created_by)
  values (p_parent_tool, auth.uid(), p_project, trim(p_reason), nullif(trim(p_note), ''), p_expected_return,
          v_unit.id, auth.uid())
  returning * into v_req;

  if v_unit.id is not null then
    update public.tool_units set status = 'pending_approval', reserved_for_request_id = v_req.id where id = v_unit.id;
    perform public.log_audit('held_for_request', 'tool_unit', v_unit.id, v_unit.id, p_project,
      'Held pending approval of ' || v_req.request_number, jsonb_build_object('request_id', v_req.id));
  end if;

  update public.parent_tools set times_requested = times_requested + 1 where id = p_parent_tool;

  select count(*) into v_queue from public.tool_requests
   where parent_tool_id = p_parent_tool and status in ('pending', 'waitlisted') and reserved_unit_id is null
     and created_at <= v_req.created_at;

  perform public.log_audit('request_submitted', 'tool_request', v_req.id, v_unit.id, p_project,
    v_me.full_name || ' requested ' || v_parent.name || ' (' || v_req.request_number || ')',
    jsonb_build_object('reason', p_reason, 'expected_return_date', p_expected_return, 'queued', v_unit.id is null));

  perform public.notify_project_leads(p_project, 'request_submitted', 'New tool request ' || v_req.request_number,
    v_me.full_name || ' requested ' || v_parent.name || ' for ' || v_project.name || '. Reason: ' || trim(p_reason),
    '/requests/' || v_req.id, 'tool_request', v_req.id, true, auth.uid());

  return jsonb_build_object('id', v_req.id, 'request_number', v_req.request_number,
    'unit_code', v_unit.unit_code, 'queued', v_unit.id is null,
    'queue_position', case when v_unit.id is null then v_queue else null end);
end $$;

create or replace function public.decide_tool_request(p_request uuid, p_approve boolean, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_req public.tool_requests;
  v_parent public.parent_tools;
  v_unit public.tool_units;
  v_hours int := coalesce((public.setting('reservation_hold_hours'))::int, 24);
  v_new_status public.request_status;
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
    update public.tool_units set status = 'reserved', reserved_for_request_id = p_request,
           reserved_until = now() + make_interval(hours => v_hours) where id = v_unit.id;
    update public.tool_requests set status = 'approved', reserved_unit_id = v_unit.id, decided_by = auth.uid(),
           decided_at = now(), decision_comment = nullif(trim(p_comment), ''),
           reservation_expires_at = now() + make_interval(hours => v_hours) where id = p_request;
    perform public.notify(v_req.requester_id, 'request_ready', 'Approved — ready for collection',
      v_parent.name || ' (' || v_unit.unit_code || ') is reserved for you for ' || v_hours || ' hours. Scan the barcode to collect.',
      '/requests/' || p_request, 'tool_request', p_request, true);
    perform public.log_audit('request_approved', 'tool_request', p_request, v_unit.id, v_req.project_id,
      v_req.request_number || ' approved; ' || v_unit.unit_code || ' reserved',
      jsonb_build_object('comment', p_comment, 'unit_code', v_unit.unit_code, 'hold_hours', v_hours));
  else
    v_new_status := 'waitlisted';
    update public.tool_requests set status = 'waitlisted', reserved_unit_id = null, decided_by = auth.uid(),
           decided_at = now(), decision_comment = nullif(trim(p_comment), '') where id = p_request;
    perform public.notify(v_req.requester_id, 'request_approved', 'Request ' || v_req.request_number || ' approved',
      v_parent.name || ' is approved. No unit is free yet — you will be notified when one is reserved for you.',
      '/requests/' || p_request, 'tool_request', p_request, true);
    perform public.log_audit('request_approved', 'tool_request', p_request, null, v_req.project_id,
      v_req.request_number || ' approved (waitlisted)', jsonb_build_object('comment', p_comment));
  end if;
  return jsonb_build_object('status', v_new_status, 'unit_code', v_unit.unit_code);
end $$;

create or replace function public.cancel_tool_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_req public.tool_requests;
begin
  select * into v_req from public.tool_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if v_req.requester_id <> auth.uid() and not public.can_manage_project(v_req.project_id) then
    raise exception 'Not authorized to cancel this request';
  end if;
  if v_req.status not in ('pending', 'approved', 'waitlisted') then raise exception 'Request is already %', v_req.status; end if;
  update public.tool_requests set status = 'cancelled', reserved_unit_id = null where id = p_request;
  if v_req.reserved_unit_id is not null then
    perform public.release_unit(v_req.reserved_unit_id, 'Released: ' || v_req.request_number || ' cancelled');
  end if;
  perform public.log_audit('request_cancelled', 'tool_request', p_request, v_req.reserved_unit_id, v_req.project_id,
    v_req.request_number || ' cancelled', '{}'::jsonb);
end $$;

-- Collection: employee (or staff/lead on their behalf) scans the exact unit barcode
create or replace function public.checkout_scan(p_code text, p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_unit public.tool_units;
  v_req public.tool_requests;
  v_parent public.parent_tools;
  v_checkout uuid;
  v_old uuid;
  v_holder_name text;
  v_staff boolean;
begin
  select * into v_unit from public.tool_units where upper(unit_code) = upper(trim(p_code)) for update;
  if not found then raise exception 'No tool unit matches barcode %', p_code; end if;
  select * into v_parent from public.parent_tools where id = v_unit.parent_tool_id;

  -- request reserved on this very unit
  select * into v_req from public.tool_requests
   where reserved_unit_id = v_unit.id and status = 'approved' and (p_request is null or id = p_request)
   for update;

  if v_req.id is not null then
    v_staff := public.can_manage_project(v_req.project_id);
    if v_req.requester_id <> auth.uid() and not v_staff then
      raise exception 'Unit % is reserved for another employee', v_unit.unit_code;
    end if;
  else
    -- caller has an approved request for this tool, but scanned a different unit: swap if the scanned one is free
    select * into v_req from public.tool_requests
     where parent_tool_id = v_unit.parent_tool_id and status = 'approved'
       and (p_request is null or id = p_request)
       and (requester_id = auth.uid() or (p_request is not null and public.can_manage_project(project_id)))
     order by created_at limit 1 for update;
    if v_req.id is null then
      raise exception 'No approved request found for % (%). Request the tool first.', v_parent.name, v_unit.unit_code;
    end if;
    if v_unit.status <> 'available' then
      raise exception 'Wrong unit scanned. Your request % is reserved on %, and % is %.', v_req.request_number,
        (select unit_code from public.tool_units where id = v_req.reserved_unit_id), v_unit.unit_code,
        replace(v_unit.status::text, '_', ' ');
    end if;
    v_old := v_req.reserved_unit_id;
    update public.tool_requests set reserved_unit_id = v_unit.id where id = v_req.id;
    update public.tool_units set status = 'reserved', reserved_for_request_id = v_req.id where id = v_unit.id;
    if v_old is not null then
      perform public.release_unit(v_old, 'Released: swapped to ' || v_unit.unit_code || ' at collection');
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

-- Direct checkout by Inventory Manager / Admin / Project Lead (walk-up issue)
create or replace function public.direct_checkout(
  p_code text, p_holder uuid, p_project uuid, p_expected_return date, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_unit public.tool_units;
  v_holder public.profiles;
  v_checkout uuid;
begin
  if not public.can_manage_project(p_project) then
    raise exception 'Only Inventory Managers, Admins or the project lead can issue tools directly';
  end if;
  select * into v_unit from public.tool_units where upper(unit_code) = upper(trim(p_code)) for update;
  if not found then raise exception 'No tool unit matches barcode %', p_code; end if;
  if v_unit.status <> 'available' then
    raise exception 'Unit % cannot be checked out (status: %)', v_unit.unit_code, replace(v_unit.status::text, '_', ' ');
  end if;
  select * into v_holder from public.profiles where id = p_holder and is_active;
  if not found then raise exception 'Employee not found or inactive'; end if;
  if not exists (select 1 from public.project_members where project_id = p_project and user_id = p_holder)
     and v_holder.role not in ('admin', 'inventory_manager') then
    raise exception '% is not assigned to this project', v_holder.full_name;
  end if;
  if p_expected_return is null or p_expected_return < current_date then raise exception 'Expected return date must be today or later'; end if;

  insert into public.checkouts (unit_id, holder_id, project_id, approved_by, processed_by, expected_return_date, notes)
  values (v_unit.id, p_holder, p_project, auth.uid(), auth.uid(), p_expected_return, nullif(trim(p_note), ''))
  returning id into v_checkout;
  update public.tool_units set status = 'checked_out', current_holder_id = p_holder, current_project_id = p_project
   where id = v_unit.id;
  perform public.log_audit('checked_out', 'checkout', v_checkout, v_unit.id, p_project,
    v_unit.unit_code || ' issued directly to ' || v_holder.full_name,
    jsonb_build_object('expected_return_date', p_expected_return, 'note', p_note, 'direct', true));
  perform public.notify(p_holder, 'checked_out', 'Tool issued to you',
    v_unit.unit_code || ' — due back ' || p_expected_return, '/units/' || v_unit.id, 'tool_unit', v_unit.id, false);
  return jsonb_build_object('checkout_id', v_checkout, 'unit_code', v_unit.unit_code, 'holder', v_holder.full_name);
end $$;

-- ---------------------------------------------------------------------
-- Returns / check-in
-- ---------------------------------------------------------------------
create or replace function public.return_tool(
  p_code text, p_condition public.return_condition, p_notes text default null, p_photos text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_unit public.tool_units;
  v_co public.checkouts;
  v_return uuid;
  v_status public.tool_status;
  v_cond public.tool_condition;
  v_holder_name text;
begin
  select * into v_unit from public.tool_units where upper(unit_code) = upper(trim(p_code)) for update;
  if not found then raise exception 'No tool unit matches barcode %', p_code; end if;
  if v_unit.status = 'in_transfer' then raise exception 'Unit % has a pending transfer. Cancel or complete it first.', v_unit.unit_code; end if;
  if v_unit.status <> 'checked_out' then
    raise exception 'Unit % is not checked out (status: %)', v_unit.unit_code, replace(v_unit.status::text, '_', ' ');
  end if;
  select * into v_co from public.checkouts where unit_id = v_unit.id and status = 'active' for update;
  if v_unit.current_holder_id <> auth.uid() and not public.can_manage_project(coalesce(v_co.project_id, v_unit.current_project_id)) then
    raise exception 'Only the current holder, the project lead or inventory staff can return this tool';
  end if;
  if p_condition <> 'good' and coalesce(trim(p_notes), '') = '' then
    raise exception 'Please describe the issue when returning a tool that is not in good condition';
  end if;

  v_status := case p_condition when 'good' then 'available' when 'damaged' then 'damaged'
                               when 'needs_maintenance' then 'maintenance' else 'missing' end;
  v_cond := case p_condition when 'good' then 'good' when 'damaged' then 'damaged'
                             when 'needs_maintenance' then 'needs_maintenance' else 'missing' end;

  if v_co.id is not null then
    update public.checkouts set status = 'returned', returned_at = now() where id = v_co.id;
  end if;
  insert into public.returns (unit_id, checkout_id, project_id, returned_by, holder_id, condition, notes, photo_urls)
  values (v_unit.id, v_co.id, coalesce(v_co.project_id, v_unit.current_project_id), auth.uid(),
          v_unit.current_holder_id, p_condition, nullif(trim(p_notes), ''), coalesce(p_photos, '{}'))
  returning id into v_return;

  update public.tool_units set status = v_status, condition = v_cond, current_holder_id = null
   where id = v_unit.id;

  if p_condition = 'needs_maintenance' then
    insert into public.maintenance_records (unit_id, type, description, opened_by)
    values (v_unit.id, 'repair', 'Returned needing maintenance: ' || trim(p_notes), auth.uid());
  end if;

  select full_name into v_holder_name from public.profiles where id = v_unit.current_holder_id;
  perform public.log_audit('returned', 'return', v_return, v_unit.id, coalesce(v_co.project_id, v_unit.current_project_id),
    v_unit.unit_code || ' returned (' || replace(p_condition::text, '_', ' ') || ') by ' || coalesce(v_holder_name, 'holder'),
    jsonb_build_object('condition', p_condition, 'notes', p_notes, 'photos', p_photos));

  if p_condition <> 'good' then
    perform public.notify_project_leads(coalesce(v_co.project_id, v_unit.current_project_id), 'tool_' || p_condition,
      'Tool returned ' || replace(p_condition::text, '_', ' ') || ': ' || v_unit.unit_code,
      coalesce(trim(p_notes), ''), '/units/' || v_unit.id, 'tool_unit', v_unit.id, true);
    perform public.notify_role('inventory_manager', 'tool_' || p_condition,
      'Tool returned ' || replace(p_condition::text, '_', ' ') || ': ' || v_unit.unit_code,
      coalesce(trim(p_notes), ''), '/units/' || v_unit.id, 'tool_unit', v_unit.id, true);
  else
    perform public.offer_unit_to_queue(v_unit.id);
  end if;
  return jsonb_build_object('return_id', v_return, 'unit_code', v_unit.unit_code, 'new_status', v_status);
end $$;

-- ---------------------------------------------------------------------
-- Transfers
-- ---------------------------------------------------------------------
create or replace function public.initiate_transfer(
  p_code text, p_to_user uuid, p_project uuid, p_reason text,
  p_condition public.tool_condition default 'good', p_notes text default null, p_photos text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_unit public.tool_units;
  v_co public.checkouts;
  v_to public.profiles;
  v_from public.profiles;
  v_t public.transfers;
  v_project uuid;
begin
  select * into v_unit from public.tool_units where upper(unit_code) = upper(trim(p_code)) for update;
  if not found then raise exception 'No tool unit matches barcode %', p_code; end if;
  if v_unit.status <> 'checked_out' then
    raise exception 'Only checked-out tools can be transferred (% is %)', v_unit.unit_code, replace(v_unit.status::text, '_', ' ');
  end if;
  select * into v_co from public.checkouts where unit_id = v_unit.id and status = 'active';
  v_project := coalesce(p_project, v_co.project_id, v_unit.current_project_id);
  if v_unit.current_holder_id <> auth.uid() and not public.can_manage_project(v_project) then
    raise exception 'Only the current holder can transfer this tool';
  end if;
  select * into v_to from public.profiles where id = p_to_user and is_active;
  if not found then raise exception 'Receiving employee not found or inactive'; end if;
  if p_to_user = v_unit.current_holder_id then raise exception 'The receiving employee already holds this tool'; end if;
  if not exists (select 1 from public.project_members where project_id = v_project and user_id = p_to_user)
     and v_to.role not in ('admin', 'inventory_manager') then
    raise exception '% is not assigned to the selected project', v_to.full_name;
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Transfer reason is required'; end if;
  select * into v_from from public.profiles where id = v_unit.current_holder_id;

  insert into public.transfers (unit_id, from_user_id, to_user_id, project_id, reason, condition_at_transfer, notes,
                                photo_urls, from_checkout_id, created_by)
  values (v_unit.id, v_unit.current_holder_id, p_to_user, v_project, trim(p_reason), p_condition,
          nullif(trim(p_notes), ''), coalesce(p_photos, '{}'), v_co.id, auth.uid())
  returning * into v_t;
  update public.tool_units set status = 'in_transfer' where id = v_unit.id;

  perform public.log_audit('transfer_initiated', 'transfer', v_t.id, v_unit.id, v_project,
    v_t.transfer_number || ': ' || v_from.full_name || ' → ' || v_to.full_name,
    jsonb_build_object('reason', p_reason, 'condition', p_condition));
  perform public.notify(p_to_user, 'transfer_initiated', 'Incoming tool transfer ' || v_t.transfer_number,
    v_from.full_name || ' is transferring ' || v_unit.unit_code || ' to you. Scan or confirm receipt.',
    '/transfers/' || v_t.id, 'transfer', v_t.id, true);
  perform public.notify_project_leads(v_project, 'transfer_initiated', 'Transfer ' || v_t.transfer_number || ' initiated',
    v_unit.unit_code || ': ' || v_from.full_name || ' → ' || v_to.full_name || '. ' || trim(p_reason),
    '/transfers/' || v_t.id, 'transfer', v_t.id, true, auth.uid());
  perform public.notify_role('inventory_manager', 'transfer_initiated', 'Transfer ' || v_t.transfer_number || ' initiated',
    v_unit.unit_code || ': ' || v_from.full_name || ' → ' || v_to.full_name,
    '/transfers/' || v_t.id, 'transfer', v_t.id, false, auth.uid());
  return jsonb_build_object('id', v_t.id, 'transfer_number', v_t.transfer_number);
end $$;

create or replace function public.acknowledge_transfer(
  p_transfer uuid, p_accept boolean, p_scanned_code text default null, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t public.transfers;
  v_unit public.tool_units;
  v_old public.checkouts;
  v_new uuid;
  v_to text;
begin
  select * into v_t from public.transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_t.to_user_id <> auth.uid() then raise exception 'Only the receiving employee can acknowledge this transfer'; end if;
  if v_t.status <> 'pending_acknowledgment' then raise exception 'Transfer is already %', replace(v_t.status::text, '_', ' '); end if;
  select * into v_unit from public.tool_units where id = v_t.unit_id for update;
  if p_accept and p_scanned_code is not null and trim(p_scanned_code) <> ''
     and upper(trim(p_scanned_code)) <> upper(v_unit.unit_code) then
    raise exception 'Scanned barcode % does not match transfer unit %', p_scanned_code, v_unit.unit_code;
  end if;

  insert into public.transfer_acknowledgments (transfer_id, user_id, method, scanned_code, accepted, comment)
  values (p_transfer, auth.uid(), case when coalesce(trim(p_scanned_code), '') <> '' then 'scan' else 'confirm' end,
          nullif(trim(p_scanned_code), ''), p_accept, nullif(trim(p_comment), ''));
  select full_name into v_to from public.profiles where id = v_t.to_user_id;

  if not p_accept then
    update public.transfers set status = 'declined', review_comment = coalesce(review_comment, nullif(trim(p_comment), ''))
     where id = p_transfer;
    update public.tool_units set status = 'checked_out' where id = v_unit.id;
    perform public.log_audit('transfer_declined', 'transfer', p_transfer, v_unit.id, v_t.project_id,
      v_t.transfer_number || ' declined by ' || v_to, jsonb_build_object('comment', p_comment));
    perform public.notify(v_t.from_user_id, 'transfer_rejected', 'Transfer ' || v_t.transfer_number || ' declined',
      v_to || ' declined ' || v_unit.unit_code || '. ' || coalesce(p_comment, ''), '/transfers/' || p_transfer, 'transfer', p_transfer, true);
    return jsonb_build_object('status', 'declined');
  end if;

  select * into v_old from public.checkouts where unit_id = v_unit.id and status = 'active' for update;
  if v_old.id is not null then
    update public.checkouts set status = 'transferred', returned_at = now() where id = v_old.id;
  end if;
  insert into public.checkouts (unit_id, request_id, transfer_id, holder_id, project_id, approved_by, processed_by,
                                expected_return_date, notes)
  values (v_unit.id, v_old.request_id, p_transfer, v_t.to_user_id, v_t.project_id, v_old.approved_by, auth.uid(),
          coalesce(v_old.expected_return_date, current_date + coalesce((public.setting('default_loan_days'))::int, 7)),
          'Received via ' || v_t.transfer_number)
  returning id into v_new;
  update public.tool_units set status = 'checked_out', current_holder_id = v_t.to_user_id,
         current_project_id = v_t.project_id, condition = v_t.condition_at_transfer where id = v_unit.id;
  update public.transfers set status = 'completed', completed_at = now(), to_checkout_id = v_new where id = p_transfer;

  perform public.log_audit('transfer_completed', 'transfer', p_transfer, v_unit.id, v_t.project_id,
    v_t.transfer_number || ' received by ' || v_to,
    jsonb_build_object('method', case when coalesce(trim(p_scanned_code), '') <> '' then 'scan' else 'confirm' end));
  perform public.notify(v_t.from_user_id, 'transfer_completed', 'Transfer ' || v_t.transfer_number || ' completed',
    v_to || ' received ' || v_unit.unit_code || '.', '/transfers/' || p_transfer, 'transfer', p_transfer, true);
  perform public.notify_project_leads(v_t.project_id, 'transfer_completed', 'Transfer ' || v_t.transfer_number || ' completed',
    v_unit.unit_code || ' is now with ' || v_to || '. Review if needed.', '/transfers/' || p_transfer, 'transfer', p_transfer, true);
  perform public.notify_role('inventory_manager', 'transfer_completed', 'Transfer ' || v_t.transfer_number || ' completed',
    v_unit.unit_code || ' is now with ' || v_to, '/transfers/' || p_transfer, 'transfer', p_transfer, false);
  return jsonb_build_object('status', 'completed', 'unit_code', v_unit.unit_code);
end $$;

create or replace function public.review_transfer(p_transfer uuid, p_decision public.lead_review_status, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t public.transfers;
  v_unit public.tool_units;
  v_cur public.checkouts;
  v_new uuid;
begin
  select * into v_t from public.transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer not found'; end if;
  if not (public.is_admin() or public.is_project_lead(v_t.project_id)
          or (p_decision = 'flagged' and public.is_staff())) then
    raise exception 'Only the project lead or an admin can review this transfer';
  end if;
  if p_decision = 'pending' then raise exception 'Choose approve, reject or flag'; end if;
  if p_decision in ('rejected', 'flagged') and coalesce(trim(p_comment), '') = '' then
    raise exception 'Please add a comment';
  end if;
  if v_t.status in ('declined', 'rejected', 'cancelled') then
    raise exception 'Transfer is already %', v_t.status;
  end if;
  select * into v_unit from public.tool_units where id = v_t.unit_id for update;

  update public.transfers set lead_review = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
         review_comment = nullif(trim(p_comment), '') where id = p_transfer;

  if p_decision = 'rejected' then
    update public.transfers set status = 'rejected' where id = p_transfer;
    if v_t.status = 'pending_acknowledgment' then
      update public.tool_units set status = 'checked_out' where id = v_unit.id;
    elsif v_t.status = 'completed' and v_unit.current_holder_id = v_t.to_user_id and v_unit.status = 'checked_out' then
      -- revert custody to the original holder
      select * into v_cur from public.checkouts where unit_id = v_unit.id and status = 'active' for update;
      update public.checkouts set status = 'transferred', returned_at = now() where id = v_cur.id;
      insert into public.checkouts (unit_id, request_id, transfer_id, holder_id, project_id, approved_by, processed_by,
                                    expected_return_date, notes)
      values (v_unit.id, v_cur.request_id, p_transfer, v_t.from_user_id, v_t.project_id, auth.uid(), auth.uid(),
              v_cur.expected_return_date, 'Custody reverted: ' || v_t.transfer_number || ' rejected')
      returning id into v_new;
      update public.tool_units set current_holder_id = v_t.from_user_id where id = v_unit.id;
    end if;
    perform public.notify(v_t.from_user_id, 'transfer_rejected', 'Transfer ' || v_t.transfer_number || ' rejected',
      trim(p_comment), '/transfers/' || p_transfer, 'transfer', p_transfer, true);
    perform public.notify(v_t.to_user_id, 'transfer_rejected', 'Transfer ' || v_t.transfer_number || ' rejected',
      trim(p_comment), '/transfers/' || p_transfer, 'transfer', p_transfer, true);
  elsif p_decision = 'flagged' then
    perform public.notify_role('admin', 'transfer_flagged', 'Transfer ' || v_t.transfer_number || ' flagged',
      v_unit.unit_code || ': ' || trim(p_comment), '/transfers/' || p_transfer, 'transfer', p_transfer, true, auth.uid());
    perform public.notify_role('inventory_manager', 'transfer_flagged', 'Transfer ' || v_t.transfer_number || ' flagged',
      v_unit.unit_code || ': ' || trim(p_comment), '/transfers/' || p_transfer, 'transfer', p_transfer, true, auth.uid());
  end if;

  perform public.log_audit('transfer_' || p_decision::text, 'transfer', p_transfer, v_unit.id, v_t.project_id,
    v_t.transfer_number || ' ' || p_decision::text || ' by lead', jsonb_build_object('comment', p_comment));
  return jsonb_build_object('lead_review', p_decision);
end $$;

create or replace function public.cancel_transfer(p_transfer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transfers;
begin
  select * into v_t from public.transfers where id = p_transfer for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_t.from_user_id <> auth.uid() and v_t.created_by <> auth.uid() and not public.can_manage_project(v_t.project_id) then
    raise exception 'Not authorized';
  end if;
  if v_t.status <> 'pending_acknowledgment' then raise exception 'Only pending transfers can be cancelled'; end if;
  update public.transfers set status = 'cancelled' where id = p_transfer;
  update public.tool_units set status = 'checked_out' where id = v_t.unit_id and status = 'in_transfer';
  perform public.log_audit('transfer_cancelled', 'transfer', p_transfer, v_t.unit_id, v_t.project_id,
    v_t.transfer_number || ' cancelled', '{}'::jsonb);
  perform public.notify(v_t.to_user_id, 'transfer_rejected', 'Transfer ' || v_t.transfer_number || ' cancelled',
    'The sender cancelled the transfer.', '/transfers/' || p_transfer, 'transfer', p_transfer, false);
end $$;

-- ---------------------------------------------------------------------
-- Maintenance & status management
-- ---------------------------------------------------------------------
create or replace function public.open_maintenance(
  p_unit uuid, p_type public.maintenance_type, p_description text, p_vendor text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_unit public.tool_units; v_id uuid;
begin
  if not (public.is_staff() or public.is_project_lead_role()) then raise exception 'Not authorized'; end if;
  select * into v_unit from public.tool_units where id = p_unit for update;
  if not found then raise exception 'Unit not found'; end if;
  if v_unit.status in ('checked_out', 'in_transfer', 'reserved', 'pending_approval') then
    raise exception 'Unit % must be returned/released before maintenance (status: %)', v_unit.unit_code, replace(v_unit.status::text, '_', ' ');
  end if;
  if v_unit.status = 'retired' then raise exception 'Unit is retired'; end if;
  insert into public.maintenance_records (unit_id, type, description, vendor, opened_by)
  values (p_unit, p_type, trim(p_description), nullif(trim(p_vendor), ''), auth.uid()) returning id into v_id;
  update public.tool_units set status = 'maintenance',
         condition = case when condition = 'good' then 'needs_maintenance' else condition end where id = p_unit;
  perform public.log_audit('maintenance_opened', 'maintenance', v_id, p_unit, v_unit.current_project_id,
    initcap(p_type::text) || ' opened for ' || v_unit.unit_code, jsonb_build_object('description', p_description));
  return v_id;
end $$;

create or replace function public.complete_maintenance(
  p_record uuid, p_resolution text, p_cost numeric default null, p_return_to_service boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_m public.maintenance_records; v_unit public.tool_units; v_interval int;
begin
  if not (public.is_staff() or public.is_project_lead_role()) then raise exception 'Not authorized'; end if;
  select * into v_m from public.maintenance_records where id = p_record for update;
  if not found then raise exception 'Maintenance record not found'; end if;
  if v_m.status in ('completed', 'cancelled') then raise exception 'Maintenance record already closed'; end if;
  if coalesce(trim(p_resolution), '') = '' then raise exception 'Resolution notes are required'; end if;
  select * into v_unit from public.tool_units where id = v_m.unit_id for update;
  select pt.maintenance_interval_days into v_interval from public.parent_tools pt where pt.id = v_unit.parent_tool_id;

  update public.maintenance_records set status = 'completed', resolution = trim(p_resolution), cost = p_cost,
         completed_by = auth.uid(), completed_at = now() where id = p_record;
  if p_return_to_service then
    update public.tool_units set status = 'available', condition = 'good', last_maintenance_at = now(),
           maintenance_notified_at = null,
           next_maintenance_due = case when v_interval is not null then current_date + v_interval end
     where id = v_m.unit_id;
  else
    update public.tool_units set status = 'retired' where id = v_m.unit_id;
    update public.parent_tools set quantity = greatest(quantity - 1, 0) where id = v_unit.parent_tool_id;
  end if;
  perform public.log_audit('maintenance_completed', 'maintenance', p_record, v_m.unit_id, v_unit.current_project_id,
    'Maintenance completed on ' || v_unit.unit_code || case when p_return_to_service then ' — back in service' else ' — retired' end,
    jsonb_build_object('resolution', p_resolution, 'cost', p_cost));
  if p_return_to_service then perform public.offer_unit_to_queue(v_m.unit_id); end if;
end $$;

create or replace function public.set_unit_status(p_unit uuid, p_status public.tool_status, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_unit public.tool_units;
begin
  if not (public.is_staff() or public.is_project_lead_role()) then raise exception 'Not authorized'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  select * into v_unit from public.tool_units where id = p_unit for update;
  if not found then raise exception 'Unit not found'; end if;
  if p_status not in ('available', 'damaged', 'missing', 'retired') then
    raise exception 'Use the request, checkout, transfer or maintenance workflows for status %', p_status;
  end if;
  if v_unit.status in ('checked_out', 'in_transfer', 'reserved', 'pending_approval') and p_status <> 'missing' then
    raise exception 'Unit % is % — return or release it first', v_unit.unit_code, replace(v_unit.status::text, '_', ' ');
  end if;
  if p_status = 'available' and exists (select 1 from public.maintenance_records where unit_id = p_unit and status in ('open', 'in_progress')) then
    raise exception 'Close the open maintenance record before clearing this unit';
  end if;
  if p_status = 'retired' and not public.is_staff() then raise exception 'Only Inventory Managers or Admins can retire units'; end if;

  if v_unit.status in ('checked_out', 'in_transfer') and p_status = 'missing' then
    update public.checkouts set status = 'returned', returned_at = now(), notes = coalesce(notes || ' | ', '') || 'Marked missing'
     where unit_id = p_unit and status = 'active';
    update public.transfers set status = 'cancelled' where unit_id = p_unit and status = 'pending_acknowledgment';
  end if;
  if v_unit.status in ('reserved', 'pending_approval') then
    update public.tool_requests set reserved_unit_id = null,
           status = case when status = 'approved' then 'waitlisted'::public.request_status else status end
     where id = v_unit.reserved_for_request_id;
  end if;

  update public.tool_units set status = p_status,
         condition = case p_status when 'available' then 'good' when 'damaged' then 'damaged' when 'missing' then 'missing' else condition end,
         current_holder_id = case when p_status in ('available', 'retired', 'missing') then null else current_holder_id end,
         reserved_for_request_id = null, reserved_until = null
   where id = p_unit;
  update public.parent_tools
     set quantity = (select count(*) from public.tool_units where parent_tool_id = v_unit.parent_tool_id and status <> 'retired')
   where id = v_unit.parent_tool_id;

  perform public.log_audit('status_changed', 'tool_unit', p_unit, p_unit, v_unit.current_project_id,
    v_unit.unit_code || ': ' || replace(v_unit.status::text, '_', ' ') || ' → ' || replace(p_status::text, '_', ' '),
    jsonb_build_object('from', v_unit.status, 'to', p_status, 'reason', p_reason));
  if p_status in ('missing', 'damaged') then
    perform public.notify_role('inventory_manager', 'tool_' || p_status::text, v_unit.unit_code || ' marked ' || p_status::text,
      trim(p_reason), '/units/' || p_unit, 'tool_unit', p_unit, true, auth.uid());
    if v_unit.current_project_id is not null then
      perform public.notify_project_leads(v_unit.current_project_id, 'tool_' || p_status::text,
        v_unit.unit_code || ' marked ' || p_status::text, trim(p_reason), '/units/' || p_unit, 'tool_unit', p_unit, true, auth.uid());
    end if;
  elsif p_status = 'available' then
    perform public.offer_unit_to_queue(p_unit);
  end if;
end $$;

create or replace function public.record_label_print(p_unit_ids uuid[], p_parent_ids uuid[] default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not (public.is_staff() or public.is_project_lead_role()) then raise exception 'Not authorized'; end if;
  update public.barcode_labels set print_count = print_count + 1, last_printed_at = now(), last_printed_by = auth.uid()
   where unit_id = any(coalesce(p_unit_ids, '{}'))
      or (label_type = 'parent' and parent_tool_id = any(coalesce(p_parent_ids, '{}')));
  get diagnostics v_n = row_count;
  perform public.log_audit('labels_printed', 'barcode_label', null, null, null, v_n || ' label(s) printed',
    jsonb_build_object('unit_ids', p_unit_ids, 'parent_ids', p_parent_ids));
  return v_n;
end $$;

-- Mark notifications read (single or all)
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.notifications set is_read = true, read_at = now()
   where user_id = auth.uid() and not is_read and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Admin: change role / active flag
create or replace function public.admin_update_user(
  p_user uuid, p_role text, p_active boolean, p_full_name text default null,
  p_employee_code text default null, p_job_title text default null, p_phone text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can manage users'; end if;
  if p_user = auth.uid() and (p_role <> 'admin' or not p_active) then
    raise exception 'You cannot demote or deactivate your own account';
  end if;
  update public.profiles set role = p_role, is_active = p_active,
         full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
         employee_code = nullif(trim(p_employee_code), ''),
         job_title = nullif(trim(p_job_title), ''), phone = nullif(trim(p_phone), '')
   where id = p_user;
  if not found then raise exception 'User not found'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Housekeeping: reservation expiry, overdue, maintenance due
-- Scheduled with pg_cron (see migration 4) and also safe to call ad hoc.
-- ---------------------------------------------------------------------
create or replace function public.run_housekeeping()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_expired int := 0;
  v_overdue int := 0;
  v_maint int := 0;
begin
  -- 1. expire reservations that were never collected
  for r in
    select tr.*, tu.unit_code from public.tool_requests tr
    left join public.tool_units tu on tu.id = tr.reserved_unit_id
    where tr.status = 'approved' and tr.reservation_expires_at < now()
    for update of tr skip locked
  loop
    update public.tool_requests set status = 'expired', reserved_unit_id = null where id = r.id;
    if r.reserved_unit_id is not null then
      perform public.release_unit(r.reserved_unit_id, 'Reservation expired for ' || r.request_number);
    end if;
    perform public.notify(r.requester_id, 'reservation_expired', 'Reservation expired: ' || r.request_number,
      coalesce(r.unit_code, 'The tool') || ' was not collected in time and returned to stock.',
      '/requests/' || r.id, 'tool_request', r.id, true);
    perform public.log_audit('reservation_expired', 'tool_request', r.id, r.reserved_unit_id, r.project_id,
      r.request_number || ' reservation expired', '{}'::jsonb);
    v_expired := v_expired + 1;
  end loop;

  -- 2. overdue checkouts (notify once)
  for r in
    select c.*, tu.unit_code, p.full_name from public.checkouts c
    join public.tool_units tu on tu.id = c.unit_id
    join public.profiles p on p.id = c.holder_id
    where c.status = 'active' and c.expected_return_date < current_date and c.overdue_notified_at is null
    for update of c skip locked
  loop
    update public.checkouts set overdue_notified_at = now() where id = r.id;
    perform public.notify(r.holder_id, 'tool_overdue', 'Overdue: ' || r.unit_code,
      'This tool was due back on ' || r.expected_return_date || '. Please return or request an extension.',
      '/units/' || r.unit_id, 'tool_unit', r.unit_id, true);
    perform public.notify_project_leads(r.project_id, 'tool_overdue', 'Overdue: ' || r.unit_code,
      r.full_name || ' was due to return it on ' || r.expected_return_date, '/units/' || r.unit_id, 'tool_unit', r.unit_id, true);
    v_overdue := v_overdue + 1;
  end loop;

  -- 3. maintenance due (notify inventory managers once)
  for r in
    select tu.* from public.tool_units tu
    where tu.next_maintenance_due <= current_date and tu.maintenance_notified_at is null and tu.status <> 'retired'
    for update skip locked
  loop
    update public.tool_units set maintenance_notified_at = now() where id = r.id;
    perform public.notify_role('inventory_manager', 'maintenance_due', 'Maintenance due: ' || r.unit_code,
      'Scheduled maintenance was due ' || r.next_maintenance_due, '/units/' || r.id, 'tool_unit', r.id, true);
    v_maint := v_maint + 1;
  end loop;

  return jsonb_build_object('expired', v_expired, 'overdue', v_overdue, 'maintenance_due', v_maint);
end $$;

-- ---------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------
-- Request queue position for pending/waitlisted requests (1-based)
create or replace function public.request_queue_position(p_request uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when r.status in ('pending', 'waitlisted') and r.reserved_unit_id is null then (
    select count(*)::int from public.tool_requests q
     where q.parent_tool_id = r.parent_tool_id and q.status in ('pending', 'waitlisted')
       and q.reserved_unit_id is null and q.created_at <= r.created_at) end
  from public.tool_requests r where r.id = p_request
$$;

-- Dashboard counters respecting role scope
create or replace function public.dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := public.app_role();
  v_projects uuid[];
  v_res jsonb;
begin
  if v_role is null then raise exception 'Not authenticated'; end if;
  if v_role in ('admin', 'inventory_manager') then
    select array_agg(id) into v_projects from public.projects;
  else
    select array_agg(project_id) into v_projects from public.project_members where user_id = auth.uid();
  end if;
  v_projects := coalesce(v_projects, '{}');

  select jsonb_build_object(
    'total_tools', (select count(*) from public.tool_units where status <> 'retired'),
    'available', (select count(*) from public.tool_units where status = 'available'),
    'checked_out', (select count(*) from public.tool_units where status in ('checked_out', 'in_transfer')),
    'reserved', (select count(*) from public.tool_units where status in ('reserved', 'pending_approval')),
    'attention', (select count(*) from public.tool_units where status in ('maintenance', 'damaged', 'missing')),
    'pending_requests', (select count(*) from public.tool_requests where status = 'pending'
                           and (v_role in ('admin', 'inventory_manager') or project_id = any(v_projects) and v_role = 'project_lead'
                                or requester_id = auth.uid())),
    'overdue', (select count(*) from public.checkouts where status = 'active' and expected_return_date < current_date
                  and (v_role in ('admin', 'inventory_manager') or (v_role = 'project_lead' and project_id = any(v_projects))
                       or holder_id = auth.uid())),
    'my_active', (select count(*) from public.checkouts where status = 'active' and holder_id = auth.uid()),
    'pending_transfers', (select count(*) from public.transfers where status = 'pending_acknowledgment'
                            and (v_role in ('admin', 'inventory_manager') or (v_role = 'project_lead' and project_id = any(v_projects))
                                 or to_user_id = auth.uid() or from_user_id = auth.uid())),
    'transfers_to_review', (select count(*) from public.transfers where lead_review = 'pending' and status in ('pending_acknowledgment', 'completed')
                              and (v_role = 'admin' or (v_role = 'project_lead' and project_id = any(v_projects)))),
    'by_project', (select coalesce(jsonb_agg(x order by x ->> 'name'), '[]'::jsonb) from (
        select jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code,
          'checked_out', (select count(*) from public.tool_units u where u.current_project_id = p.id and u.status in ('checked_out', 'in_transfer')),
          'home_tools', (select count(*) from public.tool_units u join public.parent_tools pt on pt.id = u.parent_tool_id
                          where pt.home_project_id = p.id and u.status <> 'retired'),
          'open_requests', (select count(*) from public.tool_requests r where r.project_id = p.id and r.status in ('pending', 'approved', 'waitlisted'))) as x
        from public.projects p where p.id = any(v_projects)) s)
  ) into v_res;
  return v_res;
end $$;

-- Badge sign-in helper: resolve an employee badge code to a login email.
-- Callable only with the service role (used by the server-side /api/auth/badge route).
create or replace function public.email_for_employee_code(p_code text)
returns text language sql stable security definer set search_path = public as $$
  select email from public.profiles where upper(employee_code) = upper(trim(p_code)) and is_active
$$;

-- Custody + queue for a parent tool, with role-aware masking.
-- Admins, Inventory Managers and Project Leads see full custody; labor see
-- names only for people they share a project with.
create or replace function public.tool_custody(p_parent uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_full boolean := public.is_staff() or public.is_project_lead_role();
  v_units jsonb;
  v_queue jsonb;
begin
  if public.app_role() is null then raise exception 'Not authenticated'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id, 'unit_code', u.unit_code, 'unit_number', u.unit_number, 'serial_number', u.serial_number,
      'status', u.status, 'condition', u.condition, 'location', u.location,
      'project_name', pr.name, 'project_id', pr.id,
      'holder_id', case when v_full or u.current_holder_id = auth.uid() or public.shares_project_with(u.current_holder_id)
                        then u.current_holder_id end,
      'holder_name', case when u.current_holder_id is null then null
                          when v_full or u.current_holder_id = auth.uid() or public.shares_project_with(u.current_holder_id)
                          then hp.full_name else 'Another crew member' end,
      'is_mine', u.current_holder_id = auth.uid(),
      'checked_out_at', co.checked_out_at, 'expected_return_date', co.expected_return_date,
      'approved_by', case when v_full then ap.full_name end,
      'reserved_until', u.reserved_until,
      'next_maintenance_due', u.next_maintenance_due
    ) order by u.unit_number), '[]'::jsonb) into v_units
  from public.tool_units u
  left join public.projects pr on pr.id = u.current_project_id
  left join public.profiles hp on hp.id = u.current_holder_id
  left join public.checkouts co on co.unit_id = u.id and co.status = 'active'
  left join public.profiles ap on ap.id = co.approved_by
  where u.parent_tool_id = p_parent;

  select coalesce(jsonb_agg(jsonb_build_object(
      'position', q.pos, 'request_id', case when v_full or q.requester_id = auth.uid() then q.id end,
      'request_number', case when v_full or q.requester_id = auth.uid() then q.request_number end,
      'status', q.status, 'created_at', q.created_at, 'is_mine', q.requester_id = auth.uid(),
      'requester_name', case when v_full or q.requester_id = auth.uid() then q.full_name else 'Queued request' end,
      'project_name', q.project_name) order by q.pos), '[]'::jsonb) into v_queue
  from (
    select r.*, p.full_name, pr.name as project_name, row_number() over (order by r.created_at) as pos
    from public.tool_requests r
    join public.profiles p on p.id = r.requester_id
    join public.projects pr on pr.id = r.project_id
    where r.parent_tool_id = p_parent and r.status in ('pending', 'waitlisted') and r.reserved_unit_id is null
  ) q;

  return jsonb_build_object('units', v_units, 'queue', v_queue, 'full_access', v_full);
end $$;
