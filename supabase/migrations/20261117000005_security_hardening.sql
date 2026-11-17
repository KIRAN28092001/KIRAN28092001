-- =====================================================================
-- Security hardening (Supabase advisor recommendations)
-- =====================================================================
alter function public.set_updated_at() set search_path = public;

-- Trigger functions never need to be called through the API
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- RLS helper functions: signed-in users only (policies evaluate them as the caller)
do $$
declare f text;
begin
  foreach f in array array['app_role()', 'is_admin()', 'is_staff()', 'is_project_lead_role()',
    'is_project_member(uuid)', 'is_project_lead(uuid)', 'can_manage_project(uuid)',
    'shares_project_with(uuid)', 'setting(text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
