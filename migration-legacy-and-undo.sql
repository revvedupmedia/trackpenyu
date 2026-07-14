-- 1) Import undo: setiap import Excel ditanda dengan batch id supaya
--    boleh dibuang sekali gus kalau tersilap (cth import dua kali).
alter table daily_entries add column if not exists import_batch uuid;
create index if not exists idx_daily_entries_import_batch
  on daily_entries(import_batch) where import_batch is not null;

-- 2) Data lama bulanan: tahun seperti 2025 dan sebelumnya hanya ada
--    jumlah bulanan (tiada perincian harian) — table berasingan supaya
--    tidak bercampur dengan data harian sebenar.
create table if not exists monthly_summaries (
  island island_code not null,
  year integer not null,
  month integer not null check (month between 1 and 12),
  bilangan_penyu integer not null default 0,
  jumlah_telur integer not null default 0,
  telur_menetas integer,
  telur_buruk integer,
  catatan text,
  updated_at timestamptz not null default now(),
  primary key (island, year, month)
);

alter table monthly_summaries enable row level security;
drop policy if exists "read monthly summaries" on monthly_summaries;
create policy "read monthly summaries" on monthly_summaries
  for select using (
    can_view_all() or
    exists (select 1 from staff_profiles p where p.id = auth.uid() and p.island = monthly_summaries.island)
  );
drop policy if exists "admin writes monthly summaries" on monthly_summaries;
create policy "admin writes monthly summaries" on monthly_summaries
  for all using (is_admin()) with check (is_admin());

-- 3) RPC dikemaskini: gabungkan nest_records + daily_entries +
--    monthly_summaries (data lama) supaya dashboard & perbandingan
--    tahun nampak data lama sekali.
drop function if exists get_dashboard_totals(integer, island_code);
create or replace function get_dashboard_totals(p_year integer, p_island island_code)
returns jsonb language plpgsql security definer as $$
declare
  v_telur bigint; v_menetas bigint; v_buruk bigint; v_penyu bigint;
  v_target integer; v_monthly jsonb;
begin
  select
    coalesce((select sum(jumlah_telur_diram) from nest_records where extract(year from tarikh_dijumpai) = p_year and island = p_island), 0)
    + coalesce((select sum(jumlah_telur_diram_bertag + jumlah_telur_diram_takbertag) from daily_entries where extract(year from tarikh) = p_year and island = p_island), 0)
    + coalesce((select sum(jumlah_telur) from monthly_summaries where year = p_year and island = p_island), 0)
  into v_telur;

  select
    coalesce((select sum(telur_menetas) from nest_records where extract(year from tarikh_dijumpai) = p_year and island = p_island), 0)
    + coalesce((select sum(coalesce(telur_menetas_bertag,0) + coalesce(telur_menetas_takbertag,0)) from daily_entries where extract(year from tarikh) = p_year and island = p_island), 0)
    + coalesce((select sum(coalesce(telur_menetas,0)) from monthly_summaries where year = p_year and island = p_island), 0)
  into v_menetas;

  select
    coalesce((select sum(telur_buruk) from nest_records where extract(year from tarikh_dijumpai) = p_year and island = p_island and telur_buruk is not null), 0)
    + coalesce((select sum(
        greatest(jumlah_telur_diram_bertag - coalesce(telur_menetas_bertag,0), 0)
        + greatest(jumlah_telur_diram_takbertag - coalesce(telur_menetas_takbertag,0), 0)
      ) from daily_entries where extract(year from tarikh) = p_year and island = p_island and (telur_menetas_bertag is not null or telur_menetas_takbertag is not null)), 0)
    + coalesce((select sum(coalesce(telur_buruk,0)) from monthly_summaries where year = p_year and island = p_island), 0)
  into v_buruk;

  select
    coalesce((select count(*) from nest_records where extract(year from tarikh_dijumpai) = p_year and island = p_island), 0)
    + coalesce((select sum(bilangan_penyu_bertag + bilangan_penyu_takbertag) from daily_entries where extract(year from tarikh) = p_year and island = p_island), 0)
    + coalesce((select sum(bilangan_penyu) from monthly_summaries where year = p_year and island = p_island), 0)
  into v_penyu;

  select target_value into v_target from targets where year = p_year and island = p_island;

  select jsonb_agg(jsonb_build_object('month', mth, 'telur', total) order by ord) into v_monthly
  from (
    select to_char(d, 'Mon') as mth, extract(month from d) as ord,
      coalesce((select sum(jumlah_telur_diram) from nest_records where date_trunc('month', tarikh_dijumpai) = d and island = p_island), 0)
      + coalesce((select sum(jumlah_telur_diram_bertag + jumlah_telur_diram_takbertag) from daily_entries where date_trunc('month', tarikh) = d and island = p_island), 0)
      + coalesce((select sum(jumlah_telur) from monthly_summaries where year = p_year and month = extract(month from d) and island = p_island), 0) as total
    from generate_series(
      date_trunc('year', make_date(p_year,1,1)),
      date_trunc('year', make_date(p_year,1,1)) + interval '11 months',
      interval '1 month') d
  ) sub;

  return jsonb_build_object(
    'jumlah_telur', v_telur, 'jumlah_menetas', v_menetas, 'jumlah_buruk', v_buruk,
    'jumlah_penyu', v_penyu, 'target', v_target, 'monthly', coalesce(v_monthly, '[]'::jsonb)
  );
end;
$$;

drop function if exists get_multi_year_monthly(integer[], island_code);
create or replace function get_multi_year_monthly(p_years integer[], p_island island_code)
returns jsonb language plpgsql security definer as $$
declare
  result jsonb;
begin
  select jsonb_object_agg(yr::text, monthly) into result
  from (
    select yr, jsonb_agg(jsonb_build_object('month', mth, 'telur', total) order by ord) as monthly
    from (
      select y as yr, to_char(d,'Mon') as mth, extract(month from d) as ord,
        coalesce((select sum(jumlah_telur_diram) from nest_records where date_trunc('month', tarikh_dijumpai) = d and island = p_island), 0)
        + coalesce((select sum(jumlah_telur_diram_bertag + jumlah_telur_diram_takbertag) from daily_entries where date_trunc('month', tarikh) = d and island = p_island), 0)
        + coalesce((select sum(jumlah_telur) from monthly_summaries where year = y and month = extract(month from d) and island = p_island), 0) as total
      from unnest(p_years) y,
        lateral generate_series(date_trunc('year', make_date(y,1,1)), date_trunc('year', make_date(y,1,1)) + interval '11 months', interval '1 month') d
    ) inner_q
    group by yr
  ) outer_q;
  return coalesce(result, '{}'::jsonb);
end;
$$;
