-- LANGKAH 2 daripada 2 — run SELEPAS migration-kerani-step1.sql berjaya.
--
-- Kerani = view-only role: boleh tengok data SEMUA pulau (macam admin),
-- boleh eksport Excel (cuma perlukan akses baca), tetapi TIDAK boleh
-- tambah/ubah/padam data dan tiada kuasa tukar sasaran.

create or replace function my_role()
returns staff_role language sql security definer stable as $$
  select role from staff_profiles where id = auth.uid();
$$;

create or replace function can_view_all()
returns boolean language sql security definer stable as $$
  select exists (select 1 from staff_profiles where id = auth.uid() and role in ('admin','kerani'));
$$;

-- SELECT: kerani + admin nampak semua pulau; staff nampak pulau sendiri
drop policy if exists "select daily entries - own island" on daily_entries;
create policy "select daily entries - own island" on daily_entries
  for select using (
    can_view_all() or
    exists (select 1 from staff_profiles p where p.id = auth.uid() and p.island = daily_entries.island)
  );

drop policy if exists "select nest records - own island" on nest_records;
create policy "select nest records - own island" on nest_records
  for select using (
    can_view_all() or
    exists (select 1 from staff_profiles p where p.id = auth.uid() and p.island = nest_records.island)
  );

drop policy if exists "read staff names for island" on staff_profiles;
create policy "read staff names for island" on staff_profiles
  for select using (id = auth.uid() or can_view_all() or island = my_island());

-- INSERT: hanya staff (pulau sendiri) atau admin — kerani DIBLOCK
drop policy if exists "insert daily entries - own island" on daily_entries;
create policy "insert daily entries - own island" on daily_entries
  for insert with check (
    is_admin() or
    (my_role() = 'staff' and exists (select 1 from staff_profiles p where p.id = auth.uid() and p.island = daily_entries.island))
  );

drop policy if exists "insert nest records - own island" on nest_records;
create policy "insert nest records - own island" on nest_records
  for insert with check (
    is_admin() or
    (my_role() = 'staff' and exists (select 1 from staff_profiles p where p.id = auth.uid() and p.island = nest_records.island))
  );

-- UPDATE: pemilik (bukan kerani) atau admin
drop policy if exists "update daily entries - own entries only" on daily_entries;
create policy "update daily entries - own entries only" on daily_entries
  for update using (is_admin() or (created_by = auth.uid() and my_role() <> 'kerani'));

drop policy if exists "update nest records - own entries only" on nest_records;
create policy "update nest records - own entries only" on nest_records
  for update using (is_admin() or (created_by = auth.uid() and my_role() <> 'kerani'));

-- DELETE: pemilik (bukan kerani) atau admin
drop policy if exists "delete own daily entries" on daily_entries;
create policy "delete own daily entries" on daily_entries
  for delete using (is_admin() or (created_by = auth.uid() and my_role() <> 'kerani'));

drop policy if exists "delete own nest records" on nest_records;
create policy "delete own nest records" on nest_records
  for delete using (is_admin() or (created_by = auth.uid() and my_role() <> 'kerani'));
