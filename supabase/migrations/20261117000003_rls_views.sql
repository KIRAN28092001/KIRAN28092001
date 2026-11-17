-- =====================================================================
-- Tool Connected App — Row Level Security, grants and views
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------
alter table public.roles                    enable row level security;
alter table public.profiles                 enable row level security;
alter table public.app_settings             enable row level security;
alter table public.projects                 enable row level security;
alter table public.project_members          enable row level security;
alter table public.tool_categories          enable row level security;
alter table public.parent_tools             enable row level security;
alter table public.tool_units               enable row level security;
alter table public.tool_images              enable row level security;
alter table public.barcode_labels           enable row level security;
alter table public.tool_requests            enable row level security;
alter table public.request_approvals        enable row level security;
alter table public.checkouts                enable row level security;
alter table public.transfers                enable row level security;
alter table public.transfer_acknowledgments enable row level security;
alter table public.returns                  enable row level security;
alter table public.maintenance_records      enable row level security;
alter table public.notifications            enable row level security;
alter table public.audit_logs               enable row level security;

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------
create policy roles_read on public.roles for select to authenticated using (true);

create policy settings_read on public.app_settings for select to authenticated using (true);
create policy settings_admin_write on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Support e-mail is shown on the (public) login page
create policy settings_public_support on public.app_settings for select to anon
  using (key in ('support_email', 'organization_name'));

-- ---------------------------------------------------------------------
-- Profiles: self, staff, anyone you share a project with
-- ---------------------------------------------------------------------
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_staff() or public.is_project_lead_role() or public.shares_project_with(id));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- Projects & membership
-- ---------------------------------------------------------------------
create policy projects_read on public.projects for select to authenticated using (
  public.is_staff() or public.is_project_member(id));
create policy projects_admin_insert on public.projects for insert to authenticated with check (public.is_admin());
create policy projects_update on public.projects for update to authenticated
  using (public.is_admin() or public.is_project_lead(id)) with check (public.is_admin() or public.is_project_lead(id));
create policy projects_admin_delete on public.projects for delete to authenticated using (public.is_admin());

create policy members_read on public.project_members for select to authenticated using (
  public.is_staff() or user_id = auth.uid() or public.is_project_member(project_id));
create policy members_insert on public.project_members for insert to authenticated with check (
  public.is_admin() or (public.is_project_lead(project_id) and member_role = 'member'));
create policy members_update on public.project_members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy members_delete on public.project_members for delete to authenticated using (
  public.is_admin() or (public.is_project_lead(project_id) and member_role = 'member'));

-- ---------------------------------------------------------------------
-- Catalog (readable by every signed-in user so labor can browse)
-- ---------------------------------------------------------------------
create policy categories_read on public.tool_categories for select to authenticated using (true);
create policy categories_write on public.tool_categories for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy parent_tools_read on public.parent_tools for select to authenticated using (true);
create policy parent_tools_update on public.parent_tools for update to authenticated
  using (public.is_staff() or public.is_project_lead_role())
  with check (public.is_staff() or public.is_project_lead_role());
create policy parent_tools_delete on public.parent_tools for delete to authenticated using (public.is_admin());
-- inserts go through create_parent_tool()

create policy tool_units_read on public.tool_units for select to authenticated using (true);
-- unit changes go through workflow functions

create policy tool_images_read on public.tool_images for select to authenticated using (true);
create policy tool_images_write on public.tool_images for insert to authenticated
  with check (public.is_staff() or public.is_project_lead_role());
create policy tool_images_update on public.tool_images for update to authenticated
  using (public.is_staff() or public.is_project_lead_role());
create policy tool_images_delete on public.tool_images for delete to authenticated
  using (public.is_staff() or public.is_project_lead_role());

create policy labels_read on public.barcode_labels for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Requests: own, project lead of the project, staff
-- ---------------------------------------------------------------------
create policy requests_read on public.tool_requests for select to authenticated using (
  requester_id = auth.uid() or public.is_staff() or public.is_project_lead(project_id));

create policy approvals_read on public.request_approvals for select to authenticated using (
  exists (select 1 from public.tool_requests r where r.id = request_id
          and (r.requester_id = auth.uid() or public.is_staff() or public.is_project_lead(r.project_id))));

-- ---------------------------------------------------------------------
-- Custody
-- ---------------------------------------------------------------------
create policy checkouts_read on public.checkouts for select to authenticated using (
  holder_id = auth.uid() or public.is_staff() or public.is_project_lead(project_id));

create policy transfers_read on public.transfers for select to authenticated using (
  from_user_id = auth.uid() or to_user_id = auth.uid() or public.is_staff() or public.is_project_lead(project_id));

create policy transfer_ack_read on public.transfer_acknowledgments for select to authenticated using (
  exists (select 1 from public.transfers t where t.id = transfer_id
          and (t.from_user_id = auth.uid() or t.to_user_id = auth.uid() or public.is_staff() or public.is_project_lead(t.project_id))));

create policy returns_read on public.returns for select to authenticated using (
  returned_by = auth.uid() or holder_id = auth.uid() or public.is_staff() or public.is_project_lead(project_id));

create policy maintenance_read on public.maintenance_records for select to authenticated using (
  public.is_staff() or public.is_project_lead_role()
  or exists (select 1 from public.tool_units u where u.id = unit_id and u.current_holder_id = auth.uid()));
create policy maintenance_update on public.maintenance_records for update to authenticated
  using (public.is_staff() or public.is_project_lead_role())
  with check (public.is_staff() or public.is_project_lead_role());

-- ---------------------------------------------------------------------
-- Notifications: own only
-- ---------------------------------------------------------------------
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Audit: append-only; admins & inventory managers see all, leads see their
-- projects, everyone sees their own actions and the timeline of units
-- they currently hold.
-- ---------------------------------------------------------------------
create policy audit_read on public.audit_logs for select to authenticated using (
  public.is_staff()
  or actor_id = auth.uid()
  or (project_id is not null and public.is_project_lead(project_id))
  or (unit_id is not null and exists (select 1 from public.tool_units u where u.id = unit_id and u.current_holder_id = auth.uid())));

-- ---------------------------------------------------------------------
-- Function privileges: internal helpers are not callable from the API
-- ---------------------------------------------------------------------
revoke execute on function public.log_audit(text, text, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify(uuid, text, text, text, text, text, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.notify_project_leads(uuid, text, text, text, text, text, uuid, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.notify_role(text, text, text, text, text, text, uuid, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.create_tool_units(uuid, int) from public, anon, authenticated;
revoke execute on function public.generate_parent_code(text, uuid) from public, anon, authenticated;
revoke execute on function public.offer_unit_to_queue(uuid) from public, anon, authenticated;
revoke execute on function public.release_unit(uuid, text) from public, anon, authenticated;
revoke execute on function public.email_for_employee_code(text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.email_for_employee_code(text) to service_role;

-- Workflow RPCs: signed-in users only (each checks role internally)
do $$
declare f text;
begin
  foreach f in array array[
    'create_parent_tool(jsonb)', 'add_tool_units(uuid, int)',
    'update_tool_unit(uuid, text, text, text, public.tool_condition)',
    'submit_tool_request(uuid, uuid, text, date, text, text)', 'decide_tool_request(uuid, boolean, text)',
    'cancel_tool_request(uuid)', 'checkout_scan(text, uuid)', 'direct_checkout(text, uuid, uuid, date, text)',
    'return_tool(text, public.return_condition, text, text[])',
    'initiate_transfer(text, uuid, uuid, text, public.tool_condition, text, text[])',
    'acknowledge_transfer(uuid, boolean, text, text)', 'review_transfer(uuid, public.lead_review_status, text)',
    'cancel_transfer(uuid)', 'open_maintenance(uuid, public.maintenance_type, text, text)',
    'complete_maintenance(uuid, text, numeric, boolean)', 'set_unit_status(uuid, public.tool_status, text)',
    'record_label_print(uuid[], uuid[])', 'mark_notifications_read(uuid[])',
    'admin_update_user(uuid, text, boolean, text, text, text, text)', 'run_housekeeping()',
    'request_queue_position(uuid)', 'dashboard_stats()', 'tool_custody(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Views (security_invoker => caller's RLS applies)
-- ---------------------------------------------------------------------
create or replace view public.v_catalog with (security_invoker = true) as
select
  pt.id, pt.parent_code, pt.name, pt.brand, pt.model_number, pt.description, pt.image_url,
  pt.category_id, c.name as category_name, c.code as category_code, c.image_url as category_image_url,
  pt.home_project_id, hp.name as home_project_name, pt.storage_location, pt.min_stock_threshold,
  pt.maintenance_interval_days, pt.purchase_value, pt.purchase_date, pt.supplier, pt.notes,
  pt.times_requested, pt.is_archived, pt.created_at,
  count(u.id) filter (where u.status <> 'retired')::int as total_units,
  count(u.id) filter (where u.status = 'available')::int as available_units,
  count(u.id) filter (where u.status in ('checked_out', 'in_transfer'))::int as checked_out_units,
  count(u.id) filter (where u.status in ('reserved', 'pending_approval'))::int as reserved_units,
  count(u.id) filter (where u.status in ('maintenance', 'damaged', 'missing'))::int as attention_units,
  coalesce(string_agg(u.unit_code || ' ' || coalesce(u.serial_number, ''), ' '), '') as unit_search,
  case
    when count(u.id) filter (where u.status in ('damaged', 'missing')) > 0 then 'attention'
    when count(u.id) filter (where u.condition = 'fair') > 0 then 'fair'
    else 'good' end as overall_condition,
  array_remove(array_agg(distinct cp.name), null) as active_projects
from public.parent_tools pt
join public.tool_categories c on c.id = pt.category_id
left join public.projects hp on hp.id = pt.home_project_id
left join public.tool_units u on u.parent_tool_id = pt.id
left join public.projects cp on cp.id = u.current_project_id and u.status in ('checked_out', 'in_transfer')
group by pt.id, c.id, hp.id;

grant select on public.v_catalog to authenticated;
