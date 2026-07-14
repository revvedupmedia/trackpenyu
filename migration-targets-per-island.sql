-- 1. Targets become per-island (currently shared across all 3 islands,
--    which is wrong since each island has a different target).
-- 2. Dashboard RPCs now also return monthly turtle-count data (not just
--    egg totals), and filter targets by island too.

alter table targets add column if not exists island island_code;
update targets set island = 'PTB' where island is null;
alter table targets alter column island set not null;
alter table targets drop constraint if exists targets_pkey;
alter table targets add primary key (year, island);

alter table monthly_targets add column if not exists island island_code;
update monthly_targets set island = 'PTB' where island is null;
alter table monthly_targets alter column island set not null;
alter table monthly_targets drop constraint if exists monthly_targets_pkey;
alter table monthly_targets add primary key (year, month, island);

create or replace function get_dashboard_totals(p_year integer, p_island island_code)
returns jsonb language plpgsql security definer as $$
declare
  v_telur bigint;
  v_menetas bigint;
  v_buruk bigint;
  v_penyu bigint;
  v_target integer;
  v_monthly jsonb;
  v_monthly_penyu jsonb;
begin
  select
    coalesce((select sum(jumlah_telur_diram) from nest_records where extract(year from tarikh_dijumpai) = p_year and island = p_island), 0)
    + coalesce((select sum(jumlah_telur_diram_bertag + jumlah_telur_diram_takbertag) from daily_entries where extract(year from tarikh) = p_year and island = p_island), 0)
  into v_telur;

  select
    coalesce((select sum(telur_menetas) from nest_records where extract(year from tarikh_dijumpai) = p_year and island = p_island), 0)
    + coalesce((select sum(coalesce(telur_menetas_bertag,0) + coalesce(telur_menetas_takbertag,0)) from daily_entries where extract(year from tarikh) = p_year and island = p_island), 0)
  into v_menetas;

  select
    coalesce((select sum(telur_buruk) from nest_records where extract(year from tarikh_dijumpai) = p_year and island = p_island and telur_buruk is not null), 0)
    + coalesce((select sum(
        greatest(jumlah_telur_diram_bertag - coalesce(telur_menetas_bertag,0), 0)
        + greatest(jumlah_telur_diram_takbertag - coalesce(telur_menetas_takbertag,0), 0)
      ) from daily_entries where extract(year from tarikh) = p_year and island = p_island and (telur_menetas_bertag is not null or telur_menetas_takbertag is not null)), 0)
  into v_buruk;

  -- Bilangan penyu: individual rows count as 1 each; daily aggregate rows
  -- already store an explicit count.
  select
    coalesce((select count(*) from nest_records where extract(year from tarikh_dijumpai) = p_year and island = p_island), 0)
    + coalesce((select sum(bilangan_penyu_bertag + bilangan_penyu_takbertag) from daily_entries where extract(year from tarikh) = p_year and island = p_island), 0)
  into v_penyu;

  select target_value into v_target from targets where year = p_year and island = p_island;

  select jsonb_agg(jsonb_build_object('month', mth, 'telur', total) order by ord) into v_monthly
  from (
    select to_char(d, 'Mon') as mth, extract(month from d) as ord,
      coalesce((select sum(jumlah_telur_diram) from nest_records where date_trunc('month', tarikh_dijumpai) = d and island = p_island), 0)
      + coalesce((select sum(jumlah_telur_diram_bertag + jumlah_telur_diram_takbertag) from daily_entries where date_trunc('month', tarikh) = d and island = p_island), 0) as total
    from generate_series(date_trunc('year', make_date(p_year,1,1)), date_trunc('year', make_date(p_year,1,1)) + interval '11 months', interval '1 month') d
  ) sub;

  select jsonb_agg(jsonb_build_object('month', mth, 'penyu', total) order by ord) into v_monthly_penyu
  from (
    select to_char(d, 'Mon') as mth, extract(month from d) as ord,
      coalesce((select count(*) from nest_records where date_trunc('month', tarikh_dijumpai) = d and island = p_island), 0)
      + coalesce((select sum(bilangan_penyu_bertag + bilangan_penyu_takbertag) from daily_entries where date_trunc('month', tarikh) = d and island = p_island), 0) as total
    from generate_series(date_trunc('year', make_date(p_year,1,1)), date_trunc('year', make_date(p_year,1,1)) + interval '11 months', interval '1 month') d
  ) sub2;

  return jsonb_build_object(
    'jumlah_telur', v_telur, 'jumlah_menetas', v_menetas, 'jumlah_buruk', v_buruk, 'jumlah_penyu', v_penyu,
    'target', v_target, 'monthly', coalesce(v_monthly, '[]'::jsonb), 'monthly_penyu', coalesce(v_monthly_penyu, '[]'::jsonb)
  );
end;
$$;
