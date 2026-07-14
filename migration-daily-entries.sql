-- Adds support for "Entri Harian" (daily aggregate, no individual turtle
-- breakdown) as a separate table alongside the existing nest_records
-- (per-turtle "Entri Individu"). Structure mirrors the Excel template
-- exactly: one row = one day + one RAM (LPP or SFC), matching the
-- template's paired column groups.

-- Guard: create island_code only if it doesn't already exist (in case
-- this runs on a project where the original schema.sql wasn't fully
-- applied, or ran against a different database/branch).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'island_code') then
    create type island_code as enum ('PTB', 'PTK', 'PSB');
  end if;
end $$;

-- Guard: is_admin() may not exist yet either if fix-rls-recursion.sql
-- wasn't run on this database — create it here too, safely.
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from staff_profiles where id = auth.uid() and role = 'admin'
  );
$$;

create table if not exists daily_entries (
  id uuid primary key default gen_random_uuid(),
  island island_code not null,
  tarikh date not null,
  ram text not null check (ram in ('LPP','SFC')),
  bilangan_penyu_bertag integer not null default 0 check (bilangan_penyu_bertag >= 0),
  bilangan_penyu_takbertag integer not null default 0 check (bilangan_penyu_takbertag >= 0),
  jumlah_telur_diram_bertag integer not null default 0 check (jumlah_telur_diram_bertag >= 0),
  jumlah_telur_diram_takbertag integer not null default 0 check (jumlah_telur_diram_takbertag >= 0),
  telur_menetas_bertag integer check (telur_menetas_bertag >= 0),
  telur_menetas_takbertag integer check (telur_menetas_takbertag >= 0),
  jumlah_telur_dikeluarkan integer check (jumlah_telur_dikeluarkan >= 0),
  catatan text,
  created_by uuid not null references staff_profiles(id),
  updated_by uuid references staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_daily_entries_island_date on daily_entries (island, tarikh);
create index idx_daily_entries_created_by on daily_entries (created_by);

create table daily_entries_audit (
  id bigint generated always as identity primary key,
  daily_entry_id uuid not null,
  changed_by uuid not null references staff_profiles(id),
  changed_at timestamptz not null default now(),
  before jsonb,
  after jsonb
);

create or replace function log_daily_entry_change()
returns trigger language plpgsql as $$
begin
  insert into daily_entries_audit (daily_entry_id, changed_by, before, after)
  values (coalesce(new.id, old.id), coalesce(new.updated_by, new.created_by, old.created_by), to_jsonb(old), to_jsonb(new));
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_daily_entries_audit
  before update on daily_entries
  for each row execute function log_daily_entry_change();

alter table daily_entries enable row level security;
alter table daily_entries_audit enable row level security;

create policy "select daily entries - own island" on daily_entries
  for select using (
    exists (select 1 from staff_profiles p where p.id = auth.uid() and (p.role = 'admin' or p.island = daily_entries.island))
  );
create policy "insert daily entries - own island" on daily_entries
  for insert with check (
    exists (select 1 from staff_profiles p where p.id = auth.uid() and p.island = daily_entries.island)
  );
create policy "update daily entries - own entries only" on daily_entries
  for update using (
    created_by = auth.uid() or is_admin()
  );
create policy "admin reads daily entries audit" on daily_entries_audit
  for select using (is_admin());

-- Allow reading nest_records/daily_entries staff name via join for
-- "Entri Semua" screen (needs to show who created each entry)
create policy "read staff names for island" on staff_profiles
  for select using (
    id = auth.uid() or is_admin() or
    exists (select 1 from staff_profiles me where me.id = auth.uid() and me.island = staff_profiles.island)
  );
