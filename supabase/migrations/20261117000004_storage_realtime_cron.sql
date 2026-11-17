-- =====================================================================
-- Tool Connected App — Storage buckets, Realtime, scheduled jobs
-- =====================================================================

-- ---------------------------------------------------------------------
-- Storage
--   tool-images : public-read catalog photos (staff / leads upload)
--   evidence    : private return / transfer photos (any signed-in user
--                 uploads into a folder named after their user id)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('tool-images', 'tool-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('evidence', 'evidence', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "tool images readable" on storage.objects for select
  using (bucket_id = 'tool-images');
create policy "tool images upload by staff and leads" on storage.objects for insert to authenticated
  with check (bucket_id = 'tool-images' and (public.is_staff() or public.is_project_lead_role()));
create policy "tool images delete by staff and leads" on storage.objects for delete to authenticated
  using (bucket_id = 'tool-images' and (public.is_staff() or public.is_project_lead_role()));

create policy "evidence upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "evidence readable by signed-in users" on storage.objects for select to authenticated
  using (bucket_id = 'evidence');

-- ---------------------------------------------------------------------
-- Realtime: stream notifications (RLS limits each user to their own rows)
-- plus live status changes for units, requests and transfers.
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.tool_requests;
alter publication supabase_realtime add table public.transfers;
alter publication supabase_realtime add table public.tool_units;

-- ---------------------------------------------------------------------
-- Scheduled housekeeping (reservation expiry, overdue + maintenance alerts)
-- pg_cron is available on all Supabase projects; skip gracefully elsewhere.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('tool-connected-housekeeping', '*/10 * * * *', 'select public.run_housekeeping()');
  else
    raise notice 'pg_cron not available — call public.run_housekeeping() from /api/cron/housekeeping instead';
  end if;
exception when others then
  raise notice 'Could not schedule pg_cron job: %', sqlerrm;
end $$;
