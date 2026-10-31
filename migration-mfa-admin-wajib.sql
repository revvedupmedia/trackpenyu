-- MFA wajib untuk admin — LANGKAH 2 (pilihan, tetapi disyorkan).
--
-- Langkah 1 (sudah dalam app): admin mesti masukkan kod 6 digit dari app
-- Authenticator selepas kata laluan sebelum masuk portal/app.
--
-- Langkah 2 (fail ini): database sendiri hanya beri kuasa admin kepada sesi
-- yang sudah lepasi MFA (aal2). Tanpa ini, seseorang yang tahu kata laluan
-- admin masih boleh guna kuasa admin terus melalui API tanpa melalui app.
--
-- ⚠️ Run HANYA SELEPAS SEMUA admin sudah sediakan app Authenticator (log masuk
-- sekali dan sahkan kod). Admin yang belum sediakan MFA akan hilang kuasa
-- admin (data hanya boleh dibaca seperti kerani) sehingga mereka sediakannya.
--
-- Batalkan: run semula fungsi is_admin() asal (lihat schema-snapshot).

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from staff_profiles where id = auth.uid() and role = 'admin')
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$function$;

-- Polisi lama yang memeriksa peranan admin secara terus (bukan melalui
-- is_admin()) — tukar supaya turut memerlukan MFA.
drop policy if exists "admin writes targets" on public.targets;
create policy "admin writes targets" on public.targets
  for all using (is_admin()) with check (is_admin());

drop policy if exists "admin writes notification rules" on public.notification_rules;
create policy "admin writes notification rules" on public.notification_rules
  for all using (is_admin()) with check (is_admin());

drop policy if exists "admin reads audit log" on public.nest_records_audit;
create policy "admin reads audit log" on public.nest_records_audit
  for select using (is_admin());
