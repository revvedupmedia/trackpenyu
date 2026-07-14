-- Fix: infinite recursion in the "read staff names for island" policy
-- added by migration-daily-entries.sql. It checked "same island as me"
-- by querying staff_profiles from INSIDE a staff_profiles policy —
-- same mistake as before, just in a new policy this time.

create or replace function my_island()
returns island_code language sql security definer stable as $$
  select island from staff_profiles where id = auth.uid();
$$;

drop policy if exists "read staff names for island" on staff_profiles;
create policy "read staff names for island" on staff_profiles
  for select using (
    id = auth.uid() or is_admin() or island = my_island()
  );
