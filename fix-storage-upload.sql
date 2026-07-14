-- Fix: video upload returning 400/permission error.
-- The 'app-assets' bucket being public only allows public READS.
-- Uploading (insert/update) needs its own explicit RLS policies on
-- storage.objects, which were never created — this adds them.

create policy "public reads app assets" on storage.objects
  for select using (bucket_id = 'app-assets');

create policy "admin uploads app assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'app-assets' and is_admin());

create policy "admin updates app assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'app-assets' and is_admin())
  with check (bucket_id = 'app-assets' and is_admin());
