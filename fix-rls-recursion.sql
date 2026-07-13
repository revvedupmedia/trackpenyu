-- Fix: infinite recursion in staff_profiles RLS policy.
-- The old policy checked "is this user an admin" by querying
-- staff_profiles from INSIDE the staff_profiles policy itself, which
-- Postgres can't resolve and returns as a 500 error.
--
-- Fix: use a SECURITY DEFINER function, which bypasses RLS when it
-- runs, so the admin check doesn't trigger the policy again.

create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from staff_profiles where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "read own profile" on staff_profiles;
create policy "read own profile" on staff_profiles
  for select using (id = auth.uid() or is_admin());
