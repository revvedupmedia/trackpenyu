-- Fix: admin accounts were blocked from submitting entries for islands
-- other than their own assigned island, since the insert policies only
-- checked "does my island match the entry's island" with no admin
-- override. Adds is_admin() as an alternate pass condition.

drop policy if exists "insert daily entries - own island" on daily_entries;
create policy "insert daily entries - own island" on daily_entries
  for insert with check (
    is_admin() or
    exists (select 1 from staff_profiles p where p.id = auth.uid() and p.island = daily_entries.island)
  );

drop policy if exists "insert nest records - own island" on nest_records;
create policy "insert nest records - own island" on nest_records
  for insert with check (
    is_admin() or
    exists (select 1 from staff_profiles p where p.id = auth.uid() and p.island = nest_records.island)
  );
