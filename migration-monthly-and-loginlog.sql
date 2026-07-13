-- Adds: monthly target breakdown + staff login history tracking.
-- Run this in Supabase SQL Editor (after schema.sql and fix-rls-recursion.sql
-- have already been run).

create table monthly_targets (
  year integer not null,
  month integer not null check (month between 1 and 12),
  target_value integer not null check (target_value >= 0),
  primary key (year, month)
);

alter table monthly_targets enable row level security;
create policy "all staff read monthly targets" on monthly_targets for select using (true);
create policy "admin writes monthly targets" on monthly_targets for all using (is_admin());

create table login_log (
  id bigint generated always as identity primary key,
  staff_id uuid not null references staff_profiles(id),
  island island_code,
  logged_in_at timestamptz not null default now()
);

alter table login_log enable row level security;
create policy "staff insert own login" on login_log for insert with check (staff_id = auth.uid());
create policy "admin reads login log" on login_log for select using (is_admin());
create policy "staff reads own login log" on login_log for select using (staff_id = auth.uid());
