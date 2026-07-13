-- Penyu Tracker — Supabase schema
-- Run this in the Supabase SQL editor on a fresh project.

create type island_code as enum ('PTB', 'PTK', 'PSB');
create type staff_role as enum ('staff', 'admin');
create type nest_status as enum ('diram', 'menetas', 'gagal');

-- ---------------------------------------------------------------
-- Staff profiles (extends Supabase auth.users)
-- ---------------------------------------------------------------
create table staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  island island_code not null,
  role staff_role not null default 'staff',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Nest records — one row per turtle/nest found, updated later with
-- hatch results ~45-60 days after laying.
-- ---------------------------------------------------------------
create table nest_records (
  id uuid primary key default gen_random_uuid(),
  island island_code not null,
  tarikh_dijumpai date not null,
  species text not null default 'Penyu Agar (Green Turtle)',
  bertag boolean not null,
  ram text not null check (ram in ('LPP', 'SFC')),
  jumlah_telur_diram integer not null check (jumlah_telur_diram >= 0),
  tarikh_menetas date,
  telur_menetas integer check (telur_menetas >= 0),
  telur_buruk integer check (telur_buruk >= 0),
  jumlah_dikeluarkan integer check (jumlah_dikeluarkan >= 0),
  catatan text,
  status nest_status not null default 'diram',
  created_by uuid not null references staff_profiles(id),
  updated_by uuid references staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_nest_records_island_date on nest_records (island, tarikh_dijumpai);
create index idx_nest_records_created_by on nest_records (created_by);

-- Audit log — captures every change for accountability since staff
-- can edit their own entries anytime.
create table nest_records_audit (
  id bigint generated always as identity primary key,
  nest_record_id uuid not null,
  changed_by uuid not null references staff_profiles(id),
  changed_at timestamptz not null default now(),
  before jsonb,
  after jsonb
);

create or replace function log_nest_record_change()
returns trigger language plpgsql as $$
begin
  insert into nest_records_audit (nest_record_id, changed_by, before, after)
  values (
    coalesce(new.id, old.id),
    coalesce(new.updated_by, new.created_by, old.created_by),
    to_jsonb(old),
    to_jsonb(new)
  );
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_nest_records_audit
  before update on nest_records
  for each row execute function log_nest_record_change();

-- ---------------------------------------------------------------
-- Yearly targets — admin self-service, no code changes needed
-- ---------------------------------------------------------------
create table targets (
  year integer primary key,
  target_value integer not null check (target_value >= 0)
);

-- ---------------------------------------------------------------
-- Notification rules — admin self-service
-- ---------------------------------------------------------------
create table notification_rules (
  id integer primary key default 1,
  daily_reminder_time time not null default '20:00',
  idle_alert_days integer not null default 3,
  constraint single_row check (id = 1)
);
insert into notification_rules (id) values (1);

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------
alter table staff_profiles enable row level security;
alter table nest_records enable row level security;
alter table nest_records_audit enable row level security;
alter table targets enable row level security;
alter table notification_rules enable row level security;

-- Staff can read their own profile; admins can read all
create policy "read own profile" on staff_profiles
  for select using (
    id = auth.uid()
    or exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Nest records: staff can only see/edit records from their OWN island,
-- and can only edit records THEY created (not other staff's, to avoid
-- sabotage). Admins see and edit everything.
create policy "select nest records - own island" on nest_records
  for select using (
    exists (
      select 1 from staff_profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or p.island = nest_records.island)
    )
  );

create policy "insert nest records - own island" on nest_records
  for insert with check (
    exists (
      select 1 from staff_profiles p
      where p.id = auth.uid()
        and p.island = nest_records.island
    )
  );

create policy "update nest records - own entries only" on nest_records
  for update using (
    created_by = auth.uid()
    or exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "admin reads audit log" on nest_records_audit
  for select using (
    exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "all staff read targets" on targets for select using (true);
create policy "admin writes targets" on targets for all using (
  exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "all staff read notification rules" on notification_rules for select using (true);
create policy "admin writes notification rules" on notification_rules for all using (
  exists (select 1 from staff_profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ---------------------------------------------------------------
-- Dashboard aggregation RPC (used by Dashboard.tsx)
-- ---------------------------------------------------------------
create or replace function get_dashboard_totals(p_year integer)
returns jsonb language plpgsql security definer as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'jumlah_telur', coalesce(sum(jumlah_telur_diram), 0),
    'jumlah_menetas', coalesce(sum(telur_menetas), 0),
    'jumlah_buruk', coalesce(sum(telur_buruk), 0),
    'target', (select target_value from targets where year = p_year),
    'monthly', (
      select jsonb_agg(jsonb_build_object('month', to_char(m.month, 'Mon'), 'telur', m.total) order by m.month)
      from (
        select date_trunc('month', tarikh_dijumpai) as month, sum(jumlah_telur_diram) as total
        from nest_records
        where extract(year from tarikh_dijumpai) = p_year
        group by 1
      ) m
    )
  ) into result
  from nest_records
  where extract(year from tarikh_dijumpai) = p_year;

  return result;
end;
$$;

-- ---------------------------------------------------------------
-- Storage bucket for background video + receipts (public read)
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('app-assets', 'app-assets', true)
on conflict (id) do nothing;
