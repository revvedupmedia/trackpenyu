-- Snapshot struktur database Portal LPP
-- Dijana: 2026-10-31 22:32 MYT  ·  PostgreSQL 17.6
-- Bina semula: run fail ini dalam database kosong (Supabase: SQL Editor).
-- Bukan Supabase: sediakan dahulu peranan anon/authenticated/service_role, skema auth
-- (auth.users, auth.uid()) dan skema storage (buckets, objects).

-- Fungsi mungkin merujuk fungsi lain yang dicipta kemudian (susunan abjad);
-- sama seperti pg_dump, jangan semak isi fungsi semasa mencipta.
set check_function_bodies = off;

-- ---------------------------------------------------------------------
-- Extension yang dipasang (nota)
-- ---------------------------------------------------------------------
-- pg_stat_statements 1.11

-- pgcrypto 1.3

-- supabase_vault 0.3.1

-- uuid-ossp 1.1

-- ---------------------------------------------------------------------
-- Jenis enum
-- ---------------------------------------------------------------------
do $$ begin create type public.island_code as enum ('PTB', 'PTK', 'PSB'); exception when duplicate_object then null; end $$;

do $$ begin create type public.nest_status as enum ('diram', 'menetas', 'gagal'); exception when duplicate_object then null; end $$;

do $$ begin create type public.staff_role as enum ('staff', 'admin', 'kerani'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Jadual
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key text not null,
  value jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid default auth.uid()
);

create table if not exists public.daily_entries (
  id uuid default gen_random_uuid() not null,
  island island_code not null,
  tarikh date not null,
  ram text not null,
  bilangan_penyu_bertag integer default 0 not null,
  bilangan_penyu_takbertag integer default 0 not null,
  jumlah_telur_diram_bertag integer default 0 not null,
  jumlah_telur_diram_takbertag integer default 0 not null,
  telur_menetas_bertag integer,
  telur_menetas_takbertag integer,
  jumlah_telur_dikeluarkan integer,
  catatan text,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  import_batch uuid,
  telur_buruk_bertag integer,
  telur_buruk_takbertag integer
);

create table if not exists public.daily_entries_audit (
  id bigint generated always as identity not null,
  daily_entry_id uuid not null,
  changed_by uuid not null,
  changed_at timestamp with time zone default now() not null,
  before jsonb,
  after jsonb
);

create table if not exists public.import_log (
  batch uuid not null,
  island island_code not null,
  year integer not null,
  file_name text,
  inserted integer default 0 not null,
  updated integer default 0 not null,
  deleted integer default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  undone_at timestamp with time zone
);

create table if not exists public.import_undo (
  id bigint generated always as identity not null,
  batch uuid not null,
  table_name text not null,
  row_id uuid,
  action text not null,
  before jsonb not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.login_log (
  id bigint generated always as identity not null,
  staff_id uuid not null,
  island island_code,
  logged_in_at timestamp with time zone default now() not null
);

create table if not exists public.minyak_entries (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now(),
  entry_date date not null,
  fuel_type text not null,
  odometer_start numeric,
  odometer_end numeric,
  distance_km numeric,
  amount numeric not null,
  needs_claim boolean default false,
  claim_status text default 'pending'::text,
  notes text,
  receipt_url text,
  receipt_path text,
  user_id uuid,
  user_email text,
  receipt_ref text,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  dup_ok boolean default false not null,
  receipt_hash text
);

create table if not exists public.minyak_settings (
  key text not null,
  value text,
  updated_at timestamp with time zone default now()
);

create table if not exists public.monthly_hatch (
  island island_code not null,
  year integer not null,
  month integer not null,
  ram text not null,
  menetas_bertag integer default 0 not null,
  menetas_takbertag integer default 0 not null,
  buruk_bertag integer default 0 not null,
  buruk_takbertag integer default 0 not null,
  catatan text,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  import_batch uuid
);

create table if not exists public.monthly_summaries (
  island island_code not null,
  year integer not null,
  month integer not null,
  bilangan_penyu integer default 0 not null,
  jumlah_telur integer default 0 not null,
  telur_menetas integer,
  telur_buruk integer,
  catatan text,
  updated_at timestamp with time zone default now() not null,
  telur_dikutip integer,
  import_batch uuid
);

create table if not exists public.monthly_targets (
  year integer not null,
  month integer not null,
  target_value integer not null,
  island island_code not null
);

create table if not exists public.nest_records (
  id uuid default gen_random_uuid() not null,
  island island_code not null,
  tarikh_dijumpai date not null,
  species text default 'Penyu Agar (Green Turtle)'::text not null,
  bertag boolean not null,
  ram text not null,
  jumlah_telur_diram integer not null,
  tarikh_menetas date,
  telur_menetas integer,
  telur_buruk integer,
  jumlah_dikeluarkan integer,
  catatan text,
  status nest_status default 'diram'::nest_status not null,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.nest_records_audit (
  id bigint generated always as identity not null,
  nest_record_id uuid not null,
  changed_by uuid not null,
  changed_at timestamp with time zone default now() not null,
  before jsonb,
  after jsonb
);

create table if not exists public.notification_rules (
  id integer default 1 not null,
  daily_reminder_time time without time zone default '20:00:00'::time without time zone not null,
  idle_alert_days integer default 3 not null
);

create table if not exists public.staff_profiles (
  id uuid not null,
  full_name text not null,
  island island_code not null,
  role staff_role default 'staff'::staff_role not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.targets (
  year integer not null,
  target_value integer not null,
  island island_code not null
);

-- ---------------------------------------------------------------------
-- Kekangan
-- ---------------------------------------------------------------------
alter table public.app_settings add constraint app_settings_pkey PRIMARY KEY (key);

alter table public.daily_entries add constraint daily_entries_bilangan_penyu_bertag_check CHECK ((bilangan_penyu_bertag >= 0));

alter table public.daily_entries add constraint daily_entries_bilangan_penyu_takbertag_check CHECK ((bilangan_penyu_takbertag >= 0));

alter table public.daily_entries add constraint daily_entries_jumlah_telur_dikeluarkan_check CHECK ((jumlah_telur_dikeluarkan >= 0));

alter table public.daily_entries add constraint daily_entries_jumlah_telur_diram_bertag_check CHECK ((jumlah_telur_diram_bertag >= 0));

alter table public.daily_entries add constraint daily_entries_jumlah_telur_diram_takbertag_check CHECK ((jumlah_telur_diram_takbertag >= 0));

alter table public.daily_entries add constraint daily_entries_pkey PRIMARY KEY (id);

alter table public.daily_entries add constraint daily_entries_ram_check CHECK ((ram = ANY (ARRAY['LPP'::text, 'SFC'::text])));

alter table public.daily_entries add constraint daily_entries_telur_buruk_bertag_check CHECK ((telur_buruk_bertag >= 0));

alter table public.daily_entries add constraint daily_entries_telur_buruk_takbertag_check CHECK ((telur_buruk_takbertag >= 0));

alter table public.daily_entries add constraint daily_entries_telur_menetas_bertag_check CHECK ((telur_menetas_bertag >= 0));

alter table public.daily_entries add constraint daily_entries_telur_menetas_takbertag_check CHECK ((telur_menetas_takbertag >= 0));

alter table public.daily_entries_audit add constraint daily_entries_audit_pkey PRIMARY KEY (id);

alter table public.import_log add constraint import_log_pkey PRIMARY KEY (batch);

alter table public.import_undo add constraint import_undo_action_check CHECK ((action = ANY (ARRAY['update'::text, 'delete'::text])));

alter table public.import_undo add constraint import_undo_pkey PRIMARY KEY (id);

alter table public.import_undo add constraint import_undo_table_check CHECK ((table_name = ANY (ARRAY['daily_entries'::text, 'nest_records'::text, 'monthly_summaries'::text])));

alter table public.login_log add constraint login_log_pkey PRIMARY KEY (id);

alter table public.minyak_entries add constraint minyak_entries_claim_status_check CHECK ((claim_status = ANY (ARRAY['pending'::text, 'claimed'::text, 'not_applicable'::text])));

alter table public.minyak_entries add constraint minyak_entries_fuel_type_check CHECK ((fuel_type = ANY (ARRAY['diesel'::text, 'ron95'::text])));

alter table public.minyak_entries add constraint minyak_entries_pkey PRIMARY KEY (id);

alter table public.minyak_settings add constraint minyak_settings_pkey PRIMARY KEY (key);

alter table public.monthly_hatch add constraint monthly_hatch_buruk_bertag_check CHECK ((buruk_bertag >= 0));

alter table public.monthly_hatch add constraint monthly_hatch_buruk_takbertag_check CHECK ((buruk_takbertag >= 0));

alter table public.monthly_hatch add constraint monthly_hatch_menetas_bertag_check CHECK ((menetas_bertag >= 0));

alter table public.monthly_hatch add constraint monthly_hatch_menetas_takbertag_check CHECK ((menetas_takbertag >= 0));

alter table public.monthly_hatch add constraint monthly_hatch_month_check CHECK (((month >= 1) AND (month <= 12)));

alter table public.monthly_hatch add constraint monthly_hatch_pkey PRIMARY KEY (island, year, month, ram);

alter table public.monthly_hatch add constraint monthly_hatch_ram_check CHECK ((ram = ANY (ARRAY['LPP'::text, 'SFC'::text, 'ALL'::text])));

alter table public.monthly_summaries add constraint monthly_summaries_month_check CHECK (((month >= 1) AND (month <= 12)));

alter table public.monthly_summaries add constraint monthly_summaries_pkey PRIMARY KEY (island, year, month);

alter table public.monthly_summaries add constraint monthly_summaries_telur_dikutip_check CHECK ((telur_dikutip >= 0));

alter table public.monthly_targets add constraint monthly_targets_month_check CHECK (((month >= 1) AND (month <= 12)));

alter table public.monthly_targets add constraint monthly_targets_pkey PRIMARY KEY (year, month, island);

alter table public.monthly_targets add constraint monthly_targets_target_value_check CHECK ((target_value >= 0));

alter table public.nest_records add constraint nest_records_jumlah_dikeluarkan_check CHECK ((jumlah_dikeluarkan >= 0));

alter table public.nest_records add constraint nest_records_jumlah_telur_diram_check CHECK ((jumlah_telur_diram >= 0));

alter table public.nest_records add constraint nest_records_pkey PRIMARY KEY (id);

alter table public.nest_records add constraint nest_records_ram_check CHECK ((ram = ANY (ARRAY['LPP'::text, 'SFC'::text])));

alter table public.nest_records add constraint nest_records_telur_buruk_check CHECK ((telur_buruk >= 0));

alter table public.nest_records add constraint nest_records_telur_menetas_check CHECK ((telur_menetas >= 0));

alter table public.nest_records_audit add constraint nest_records_audit_pkey PRIMARY KEY (id);

alter table public.notification_rules add constraint notification_rules_pkey PRIMARY KEY (id);

alter table public.notification_rules add constraint single_row CHECK ((id = 1));

alter table public.staff_profiles add constraint staff_profiles_pkey PRIMARY KEY (id);

alter table public.targets add constraint targets_pkey PRIMARY KEY (year, island);

alter table public.targets add constraint targets_target_value_check CHECK ((target_value >= 0));

-- ---------------------------------------------------------------------
-- Foreign key
-- ---------------------------------------------------------------------
alter table public.app_settings add constraint app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.daily_entries add constraint daily_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_profiles(id);

alter table public.daily_entries add constraint daily_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_profiles(id);

alter table public.daily_entries_audit add constraint daily_entries_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES staff_profiles(id);

alter table public.import_log add constraint import_log_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_profiles(id);

alter table public.login_log add constraint login_log_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff_profiles(id);

alter table public.minyak_entries add constraint minyak_entries_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.minyak_entries add constraint minyak_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.monthly_hatch add constraint monthly_hatch_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_profiles(id);

alter table public.monthly_hatch add constraint monthly_hatch_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_profiles(id);

alter table public.nest_records add constraint nest_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_profiles(id);

alter table public.nest_records add constraint nest_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_profiles(id);

alter table public.nest_records_audit add constraint nest_records_audit_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES staff_profiles(id);

alter table public.staff_profiles add constraint staff_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------
-- Indeks
-- ---------------------------------------------------------------------
CREATE INDEX idx_daily_entries_created_by ON public.daily_entries USING btree (created_by);

CREATE INDEX idx_daily_entries_import_batch ON public.daily_entries USING btree (import_batch) WHERE (import_batch IS NOT NULL);

CREATE INDEX idx_daily_entries_island_date ON public.daily_entries USING btree (island, tarikh);

CREATE INDEX idx_import_undo_batch ON public.import_undo USING btree (batch);

CREATE INDEX idx_minyak_entries_date ON public.minyak_entries USING btree (entry_date);

CREATE INDEX idx_minyak_entries_live ON public.minyak_entries USING btree (entry_date) WHERE (deleted_at IS NULL);

CREATE INDEX idx_minyak_entries_receipt_hash ON public.minyak_entries USING btree (receipt_hash) WHERE (receipt_hash IS NOT NULL);

CREATE INDEX idx_monthly_hatch_batch ON public.monthly_hatch USING btree (import_batch) WHERE (import_batch IS NOT NULL);

CREATE INDEX idx_monthly_summaries_batch ON public.monthly_summaries USING btree (import_batch) WHERE (import_batch IS NOT NULL);

CREATE INDEX idx_nest_records_created_by ON public.nest_records USING btree (created_by);

CREATE INDEX idx_nest_records_island_date ON public.nest_records USING btree (island, tarikh_dijumpai);

CREATE UNIQUE INDEX uniq_daily_entries_day_ram ON public.daily_entries USING btree (island, tarikh, ram);

CREATE UNIQUE INDEX uq_minyak_entries_receipt_ref ON public.minyak_entries USING btree (receipt_ref) WHERE ((receipt_ref IS NOT NULL) AND (deleted_at IS NULL));

-- ---------------------------------------------------------------------
-- Fungsi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_use_minyak()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (select 1 from staff_profiles where id = auth.uid() and role in ('admin','kerani'));
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (select 1 from staff_profiles where id = auth.uid() and role in ('admin','kerani'));
$function$
;

CREATE OR REPLACE FUNCTION public.delete_entries_with_backup(p_table text, p_ids uuid[], p_note text DEFAULT 'Padam di Log'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch  uuid := gen_random_uuid();
  v_n      integer := 0;
  v_island island_code;
  v_year   integer;
begin
  if auth.uid() is null then
    raise exception 'Perlu log masuk';
  end if;

  if p_table = 'daily_entries' then
    select island, extract(year from tarikh)::int into v_island, v_year
      from daily_entries
     where id = any(p_ids) and (created_by = auth.uid() or is_admin())
     order by tarikh limit 1;
    if v_island is null then return 0; end if;

    insert into import_undo (batch, table_name, row_id, action, before)
      select v_batch, 'daily_entries', d.id, 'delete', to_jsonb(d)
        from daily_entries d
       where d.id = any(p_ids) and (d.created_by = auth.uid() or is_admin());

    delete from daily_entries
     where id = any(p_ids) and (created_by = auth.uid() or is_admin());
    get diagnostics v_n = row_count;

  elsif p_table = 'nest_records' then
    select island, extract(year from tarikh_dijumpai)::int into v_island, v_year
      from nest_records
     where id = any(p_ids) and (created_by = auth.uid() or is_admin())
     order by tarikh_dijumpai limit 1;
    if v_island is null then return 0; end if;

    insert into import_undo (batch, table_name, row_id, action, before)
      select v_batch, 'nest_records', n.id, 'delete', to_jsonb(n)
        from nest_records n
       where n.id = any(p_ids) and (n.created_by = auth.uid() or is_admin());

    delete from nest_records
     where id = any(p_ids) and (created_by = auth.uid() or is_admin());
    get diagnostics v_n = row_count;

  else
    raise exception 'Jadual tidak sah';
  end if;

  insert into import_log (batch, island, year, file_name, deleted, created_by)
  values (v_batch, v_island, v_year, p_note, v_n, auth.uid());

  return v_n;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_totals(p_year integer, p_island island_code)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select jsonb_build_object(
    'jumlah_telur',   coalesce(sum(s.telur),0),
    'jumlah_penyu',   coalesce(sum(s.penyu),0),
    'jumlah_menetas', coalesce(sum(s.menetas),0),
    'jumlah_buruk',   coalesce(sum(s.buruk),0),
    'target', (select target_value from targets where year = p_year and island = p_island),
    'monthly',       jsonb_agg(jsonb_build_object('month', to_char(make_date(p_year, s.mon, 1), 'Mon'), 'telur', s.telur) order by s.mon),
    'monthly_penyu', jsonb_agg(jsonb_build_object('month', to_char(make_date(p_year, s.mon, 1), 'Mon'), 'penyu', s.penyu) order by s.mon),
    'monthly_hatch', jsonb_agg(jsonb_build_object('month', s.mon, 'telur', s.telur, 'menetas', s.menetas, 'buruk', s.buruk) order by s.mon)
  )
  from penyu_month_stats(p_year, p_island) s;
$function$
;

CREATE OR REPLACE FUNCTION public.get_multi_year_monthly(p_years integer[], p_island island_code)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select coalesce(jsonb_object_agg(y::text, (
    select jsonb_agg(jsonb_build_object(
      'month', to_char(make_date(y, s.mon, 1), 'Mon'),
      'telur', s.telur, 'penyu', s.penyu, 'menetas', s.menetas, 'buruk', s.buruk
    ) order by s.mon)
    from penyu_month_stats(y, p_island) s
  )), '{}'::jsonb)
  from unnest(p_years) y;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1 from staff_profiles where id = auth.uid() and role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.log_daily_entry_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.daily_entries_audit (daily_entry_id, changed_by, before, after)
  values (
    coalesce(new.id, old.id),
    coalesce(new.updated_by, auth.uid(), new.created_by, old.created_by),
    to_jsonb(old),
    to_jsonb(new)
  );
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_nest_record_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.my_island()
 RETURNS island_code
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select island from staff_profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS staff_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select role from staff_profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.penyu_month_stats(p_year integer, p_island island_code)
 RETURNS TABLE(mon integer, telur bigint, penyu bigint, menetas bigint, buruk bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  with grid as (
    select m as mon, r as ram
    from generate_series(1,12) m cross join unnest(array['LPP','SFC']) r
  ),
  de as (
    select extract(month from tarikh)::int as mon, ram,
      sum(jumlah_telur_diram_bertag + jumlah_telur_diram_takbertag) as telur,
      sum(bilangan_penyu_bertag + bilangan_penyu_takbertag) as penyu,
      sum(coalesce(telur_menetas_bertag,0) + coalesce(telur_menetas_takbertag,0)) as menetas,
      sum(
        case when telur_buruk_bertag is not null then telur_buruk_bertag
             when telur_menetas_bertag is not null then greatest(jumlah_telur_diram_bertag - telur_menetas_bertag, 0)
             else 0 end
      + case when telur_buruk_takbertag is not null then telur_buruk_takbertag
             when telur_menetas_takbertag is not null then greatest(jumlah_telur_diram_takbertag - telur_menetas_takbertag, 0)
             else 0 end
      ) as buruk
    from daily_entries
    where island = p_island and tarikh >= make_date(p_year,1,1) and tarikh < make_date(p_year+1,1,1)
    group by 1, 2
  ),
  nr as (
    select extract(month from tarikh_dijumpai)::int as mon, ram,
      sum(jumlah_telur_diram) as telur,
      count(*) as penyu,
      sum(coalesce(telur_menetas,0)) as menetas,
      sum(coalesce(telur_buruk, case when telur_menetas is not null then greatest(jumlah_telur_diram - telur_menetas, 0) else 0 end)) as buruk
    from nest_records
    where island = p_island and tarikh_dijumpai >= make_date(p_year,1,1) and tarikh_dijumpai < make_date(p_year+1,1,1)
    group by 1, 2
  ),
  mh as (
    select month as mon, ram,
      menetas_bertag + menetas_takbertag as menetas,
      buruk_bertag + buruk_takbertag as buruk
    from monthly_hatch where island = p_island and year = p_year and ram in ('LPP','SFC')
  ),
  mh_all as (
    -- Rekod Gabung LPP + SFC: menetas sebulan sahaja; buruk = diram bulan − menetas
    select month as mon, menetas_bertag + menetas_takbertag as menetas
    from monthly_hatch where island = p_island and year = p_year and ram = 'ALL'
  ),
  per_ram as (
    select g.mon,
      coalesce(de.telur,0) + coalesce(nr.telur,0) as telur,
      coalesce(de.penyu,0) + coalesce(nr.penyu,0) as penyu,
      case when mh.mon is not null then mh.menetas else coalesce(de.menetas,0) + coalesce(nr.menetas,0) end as menetas,
      case when mh.mon is not null then mh.buruk else coalesce(de.buruk,0) + coalesce(nr.buruk,0) end as buruk
    from grid g
    left join de on de.mon = g.mon and de.ram = g.ram
    left join nr on nr.mon = g.mon and nr.ram = g.ram
    left join mh on mh.mon = g.mon and mh.ram = g.ram
  ),
  ms as (
    select month as mon, jumlah_telur, bilangan_penyu, coalesce(telur_menetas,0) as menetas, coalesce(telur_buruk,0) as buruk
    from monthly_summaries where island = p_island and year = p_year
  )
  select p.mon,
    (sum(p.telur)   + coalesce(max(ms.jumlah_telur),0))::bigint,
    (sum(p.penyu)   + coalesce(max(ms.bilangan_penyu),0))::bigint,
    (case when max(ma.menetas) is not null then max(ma.menetas) else sum(p.menetas) end + coalesce(max(ms.menetas),0))::bigint,
    (case when max(ma.menetas) is not null then greatest(sum(p.telur) - max(ma.menetas), 0) else sum(p.buruk) end + coalesce(max(ms.buruk),0))::bigint
  from per_ram p
  left join ms on ms.mon = p.mon
  left join mh_all ma on ma.mon = p.mon
  group by p.mon
  order by p.mon;
$function$
;

CREATE OR REPLACE FUNCTION public.undo_import(p_batch uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  r record;
  n_removed integer := 0;
  n_tmp integer := 0;
  n_restored integer := 0;
begin
  if not is_admin() then
    raise exception 'Hanya admin boleh buang import';
  end if;

  delete from daily_entries where import_batch = p_batch;
  get diagnostics n_removed = row_count;
  delete from monthly_summaries where import_batch = p_batch;
  get diagnostics n_tmp = row_count;
  n_removed := n_removed + n_tmp;
  delete from monthly_hatch where import_batch = p_batch;
  get diagnostics n_tmp = row_count;
  n_removed := n_removed + n_tmp;

  for r in select * from import_undo where batch = p_batch order by id desc loop
    if r.table_name = 'daily_entries' then
      delete from daily_entries where id = r.row_id;
      insert into daily_entries select * from jsonb_populate_record(null::daily_entries, r.before);
    elsif r.table_name = 'nest_records' then
      delete from nest_records where id = r.row_id;
      insert into nest_records select * from jsonb_populate_record(null::nest_records, r.before);
    else
      delete from monthly_summaries
        where island = (r.before->>'island')::island_code
          and year = (r.before->>'year')::int and month = (r.before->>'month')::int;
      insert into monthly_summaries select * from jsonb_populate_record(null::monthly_summaries, r.before);
    end if;
    n_restored := n_restored + 1;
  end loop;

  delete from import_undo where batch = p_batch;
  update import_log set undone_at = now() where batch = p_batch;
  return jsonb_build_object('removed', n_removed, 'restored', n_restored);
end;
$function$
;

-- ---------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_daily_entries_audit BEFORE UPDATE ON daily_entries FOR EACH ROW EXECUTE FUNCTION log_daily_entry_change();

CREATE TRIGGER trg_nest_records_audit BEFORE UPDATE ON nest_records FOR EACH ROW EXECUTE FUNCTION log_nest_record_change();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.app_settings enable row level security;

alter table public.daily_entries enable row level security;

alter table public.daily_entries_audit enable row level security;

alter table public.import_log enable row level security;

alter table public.import_undo enable row level security;

alter table public.login_log enable row level security;

alter table public.minyak_entries enable row level security;

alter table public.minyak_settings enable row level security;

alter table public.monthly_hatch enable row level security;

alter table public.monthly_summaries enable row level security;

alter table public.monthly_targets enable row level security;

alter table public.nest_records enable row level security;

alter table public.nest_records_audit enable row level security;

alter table public.notification_rules enable row level security;

alter table public.staff_profiles enable row level security;

alter table public.targets enable row level security;

-- ---------------------------------------------------------------------
-- Polisi RLS
-- ---------------------------------------------------------------------
create policy app_settings_admin_delete on public.app_settings as permissive for delete to authenticated using (is_admin());

create policy app_settings_admin_insert on public.app_settings as permissive for insert to authenticated with check (is_admin());

create policy app_settings_admin_update on public.app_settings as permissive for update to authenticated using (is_admin()) with check (is_admin());

create policy app_settings_read on public.app_settings as permissive for select to authenticated using (true);

create policy "delete own daily entries" on public.daily_entries as permissive for delete to public using ((is_admin() OR ((created_by = auth.uid()) AND (my_role() <> 'kerani'::staff_role))));

create policy "insert daily entries - own island" on public.daily_entries as permissive for insert to public with check ((is_admin() OR ((my_role() = 'staff'::staff_role) AND (EXISTS ( SELECT 1
   FROM staff_profiles p
  WHERE ((p.id = auth.uid()) AND (p.island = daily_entries.island)))))));

create policy "select daily entries - own island" on public.daily_entries as permissive for select to public using ((can_view_all() OR (EXISTS ( SELECT 1
   FROM staff_profiles p
  WHERE ((p.id = auth.uid()) AND (p.island = daily_entries.island))))));

create policy "update daily entries - own entries only" on public.daily_entries as permissive for update to public using ((is_admin() OR ((created_by = auth.uid()) AND (my_role() <> 'kerani'::staff_role))));

create policy "admin reads daily entries audit" on public.daily_entries_audit as permissive for select to public using (is_admin());

create policy "admin import log" on public.import_log as permissive for all to public using (is_admin()) with check (is_admin());

create policy "admin import undo" on public.import_undo as permissive for all to public using (is_admin()) with check (is_admin());

create policy "admin reads login log" on public.login_log as permissive for select to public using (is_admin());

create policy "staff insert own login" on public.login_log as permissive for insert to public with check ((staff_id = auth.uid()));

create policy "staff reads own login log" on public.login_log as permissive for select to public using ((staff_id = auth.uid()));

create policy "minyak delete own or admin" on public.minyak_entries as permissive for delete to public using ((can_use_minyak() AND ((user_id = auth.uid()) OR is_admin())));

create policy "minyak insert own" on public.minyak_entries as permissive for insert to public with check ((can_use_minyak() AND (user_id = auth.uid())));

create policy "minyak read" on public.minyak_entries as permissive for select to public using (can_use_minyak());

create policy "minyak update own or admin" on public.minyak_entries as permissive for update to public using ((can_use_minyak() AND ((user_id = auth.uid()) OR is_admin())));

create policy "minyak settings admin write" on public.minyak_settings as permissive for all to public using (is_admin()) with check (is_admin());

create policy "minyak settings read" on public.minyak_settings as permissive for select to public using (can_use_minyak());

create policy "delete monthly hatch" on public.monthly_hatch as permissive for delete to public using (is_admin());

create policy "insert monthly hatch" on public.monthly_hatch as permissive for insert to public with check ((is_admin() OR ((my_role() = 'staff'::staff_role) AND (island = my_island()))));

create policy "read monthly hatch" on public.monthly_hatch as permissive for select to public using ((can_view_all() OR (island = my_island())));

create policy "update monthly hatch" on public.monthly_hatch as permissive for update to public using ((is_admin() OR ((my_role() = 'staff'::staff_role) AND (island = my_island()))));

create policy "admin writes monthly summaries" on public.monthly_summaries as permissive for all to public using (is_admin()) with check (is_admin());

create policy "read monthly summaries" on public.monthly_summaries as permissive for select to public using ((can_view_all() OR (EXISTS ( SELECT 1
   FROM staff_profiles p
  WHERE ((p.id = auth.uid()) AND (p.island = monthly_summaries.island))))));

create policy "admin writes monthly targets" on public.monthly_targets as permissive for all to public using (is_admin());

create policy "all staff read monthly targets" on public.monthly_targets as permissive for select to public using (true);

create policy "delete own nest records" on public.nest_records as permissive for delete to public using ((is_admin() OR ((created_by = auth.uid()) AND (my_role() <> 'kerani'::staff_role))));

create policy "insert nest records - own island" on public.nest_records as permissive for insert to public with check ((is_admin() OR ((my_role() = 'staff'::staff_role) AND (EXISTS ( SELECT 1
   FROM staff_profiles p
  WHERE ((p.id = auth.uid()) AND (p.island = nest_records.island)))))));

create policy "select nest records - own island" on public.nest_records as permissive for select to public using ((can_view_all() OR (EXISTS ( SELECT 1
   FROM staff_profiles p
  WHERE ((p.id = auth.uid()) AND (p.island = nest_records.island))))));

create policy "update nest records - own entries only" on public.nest_records as permissive for update to public using ((is_admin() OR ((created_by = auth.uid()) AND (my_role() <> 'kerani'::staff_role))));

create policy "admin reads audit log" on public.nest_records_audit as permissive for select to public using ((EXISTS ( SELECT 1
   FROM staff_profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::staff_role)))));

create policy "admin writes notification rules" on public.notification_rules as permissive for all to public using ((EXISTS ( SELECT 1
   FROM staff_profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::staff_role)))));

create policy "all staff read notification rules" on public.notification_rules as permissive for select to public using (true);

create policy "read own profile" on public.staff_profiles as permissive for select to public using (((id = auth.uid()) OR is_admin()));

create policy "read staff names for island" on public.staff_profiles as permissive for select to public using (((id = auth.uid()) OR can_view_all() OR (island = my_island())));

create policy "admin writes targets" on public.targets as permissive for all to public using ((EXISTS ( SELECT 1
   FROM staff_profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::staff_role)))));

create policy "all staff read targets" on public.targets as permissive for select to public using (true);

create policy "admin updates app assets" on storage.objects as permissive for update to authenticated using (((bucket_id = 'app-assets'::text) AND is_admin())) with check (((bucket_id = 'app-assets'::text) AND is_admin()));

create policy "admin uploads app assets" on storage.objects as permissive for insert to authenticated with check (((bucket_id = 'app-assets'::text) AND is_admin()));

create policy "minyak receipts admin update" on storage.objects as permissive for update to authenticated using (((bucket_id = 'minyak-receipts'::text) AND is_admin())) with check (((bucket_id = 'minyak-receipts'::text) AND is_admin()));

create policy "minyak receipts delete" on storage.objects as permissive for delete to authenticated using (((bucket_id = 'minyak-receipts'::text) AND can_use_minyak() AND ((owner = auth.uid()) OR is_admin())));

create policy "minyak receipts read" on storage.objects as permissive for select to public using (((bucket_id = 'minyak-receipts'::text) AND can_use_minyak()));

create policy "minyak receipts upload" on storage.objects as permissive for insert to authenticated with check (((bucket_id = 'minyak-receipts'::text) AND can_use_minyak()));

create policy "public reads app assets" on storage.objects as permissive for select to public using ((bucket_id = 'app-assets'::text));

-- ---------------------------------------------------------------------
-- Bucket storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('app-assets', 'app-assets', true) on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('minyak-receipts', 'minyak-receipts', false) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Kebenaran (grant)
-- ---------------------------------------------------------------------
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.app_settings to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.app_settings to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.app_settings to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.daily_entries to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.daily_entries to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.daily_entries to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.daily_entries_audit to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.daily_entries_audit to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.daily_entries_audit to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.import_log to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.import_log to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.import_log to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.import_undo to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.import_undo to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.import_undo to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.login_log to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.login_log to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.login_log to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.minyak_entries to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.minyak_entries to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.minyak_entries to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.minyak_settings to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.minyak_settings to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.minyak_settings to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.monthly_hatch to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.monthly_hatch to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.monthly_hatch to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.monthly_summaries to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.monthly_summaries to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.monthly_summaries to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.monthly_targets to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.monthly_targets to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.monthly_targets to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nest_records to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nest_records to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nest_records to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nest_records_audit to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nest_records_audit to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.nest_records_audit to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.notification_rules to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.notification_rules to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.notification_rules to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.staff_profiles to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.staff_profiles to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.staff_profiles to service_role;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.targets to anon;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.targets to authenticated;

grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.targets to service_role;

grant usage on schema public to anon, authenticated;
