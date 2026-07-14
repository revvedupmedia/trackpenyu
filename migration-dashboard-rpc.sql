-- Updates get_dashboard_totals to combine BOTH daily_entries (Entri Harian)
-- and nest_records (Entri Individu) into one set of totals, since the
-- dashboard now needs to reflect data entered either way.
-- Adds get_multi_year_monthly for the year-over-year comparison chart.

create or replace function get_dashboard_totals(p_year integer)
returns jsonb language plpgsql security definer as $$
declare
  v_telur bigint;
  v_menetas bigint;
  v_buruk bigint;
  v_target integer;
  v_monthly jsonb;
begin
  select
    coalesce((select sum(jumlah_telur_diram) from nest_records where extract(year from tarikh_dijumpai) = p_year), 0)
    + coalesce((select sum(jumlah_telur_diram_bertag + jumlah_telur_diram_takbertag) from daily_entries where extract(year from tarikh) = p_year), 0)
  into v_telur;

  select
    coalesce((select sum(telur_menetas) from nest_records where extract(year from tarikh_dijumpai) = p_year), 0)
    + coalesce((select sum(coalesce(telur_menetas_bertag,0) + coalesce(telur_menetas_takbertag,0)) from daily_entries where extract(year from tarikh) = p_year), 0)
  into v_menetas;

  select
    coalesce((select sum(telur_buruk) from nest_records where extract(year from tarikh_dijumpai) = p_year and telur_buruk is not null), 0)
    + coalesce((select sum(
        greatest(jumlah_telur_diram_bertag - coalesce(telur_menetas_bertag,0), 0)
        + greatest(jumlah_telur_diram_takbertag - coalesce(telur_menetas_takbertag,0), 0)
      ) from daily_entries where extract(year from tarikh) = p_year and (telur_menetas_bertag is not null or telur_menetas_takbertag is not null)), 0)
  into v_buruk;

  select target_value into v_target from targets where year = p_year;

  select jsonb_agg(jsonb_build_object('month', mth, 'telur', total) order by ord) into v_monthly
  from (
    select to_char(d, 'Mon') as mth, extract(month from d) as ord,
      coalesce((select sum(jumlah_telur_diram) from nest_records where date_trunc('month', tarikh_dijumpai) = d), 0)
      + coalesce((select sum(jumlah_telur_diram_bertag + jumlah_telur_diram_takbertag) from daily_entries where date_trunc('month', tarikh) = d), 0) as total
    from generate_series(
      date_trunc('year', make_date(p_year,1,1)),
      date_trunc('year', make_date(p_year,1,1)) + interval '11 months',
      interval '1 month'
    ) d
  ) sub;

  return jsonb_build_object(
    'jumlah_telur', v_telur, 'jumlah_menetas', v_menetas, 'jumlah_buruk', v_buruk,
    'target', v_target, 'monthly', coalesce(v_monthly, '[]'::jsonb)
  );
end;
$$;

create or replace function get_multi_year_monthly(p_years integer[])
returns jsonb language plpgsql security definer as $$
declare
  result jsonb;
begin
  select jsonb_object_agg(yr::text, monthly) into result
  from (
    select yr, jsonb_agg(jsonb_build_object('month', mth, 'telur', total) order by ord) as monthly
    from (
      select y as yr, to_char(d,'Mon') as mth, extract(month from d) as ord,
        coalesce((select sum(jumlah_telur_diram) from nest_records where date_trunc('month', tarikh_dijumpai) = d), 0)
        + coalesce((select sum(jumlah_telur_diram_bertag + jumlah_telur_diram_takbertag) from daily_entries where date_trunc('month', tarikh) = d), 0) as total
      from unnest(p_years) y,
        lateral generate_series(date_trunc('year', make_date(y,1,1)), date_trunc('year', make_date(y,1,1)) + interval '11 months', interval '1 month') d
    ) inner_q
    group by yr
  ) outer_q;
  return coalesce(result, '{}'::jsonb);
end;
$$;
