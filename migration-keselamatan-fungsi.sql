-- Keselamatan fungsi database (amaran Supabase → Advisors → Security).
-- Selamat diulang. Run selepas migration-urus-staf-fix-ban.sql.
--
-- 1. Statistik Penyu (penyu_month_stats, yang digunakan oleh
--    get_dashboard_totals & get_multi_year_monthly) dahulu boleh dibaca oleh
--    sesiapa sahaja, termasuk tanpa log masuk, untuk mana-mana pulau. Kini:
--    mesti log masuk; staff hanya pulau sendiri; admin & kerani semua pulau
--    (sama seperti RLS pada daily_entries / nest_records).
-- 2. Fungsi yang tiada guna sebelum log masuk ditutup daripada anon (dan
--    "public", kerana PostgreSQL beri semua orang EXECUTE secara lalai).
--    Fungsi pembantu RLS (is_admin, my_role, my_island, can_view_all,
--    can_use_minyak) SENGAJA kekal boleh dipanggil oleh anon: polisi RLS
--    memanggilnya untuk setiap permintaan, dan untuk anon ia hanya
--    memulangkan false / kosong.
-- 3. search_path tetap (public) pada fungsi yang belum ada, supaya fungsi
--    SECURITY DEFINER sentiasa merujuk jadual yang betul.
--
-- Batalkan: run semula definisi fungsi dari schema-snapshot-2026-10-31.sql
-- dan "grant execute on function ... to anon".

-- ---------- 1. Statistik Penyu: semak akses ----------
create or replace function public.penyu_month_stats(p_year integer, p_island public.island_code)
 returns table(mon integer, telur bigint, penyu bigint, menetas bigint, buruk bigint)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Perlu log masuk' using errcode = '42501';
  end if;
  if not coalesce(can_view_all() or p_island = my_island(), false) then
    raise exception 'Tiada akses ke data pulau %', p_island using errcode = '42501';
  end if;

  return query
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
end;
$function$;

-- ---------- 2. Tutup daripada pengguna belum log masuk ----------
revoke execute on function public.penyu_month_stats(integer, public.island_code) from public, anon;
revoke execute on function public.get_dashboard_totals(integer, public.island_code) from public, anon;
revoke execute on function public.get_multi_year_monthly(integer[], public.island_code) from public, anon;
revoke execute on function public.delete_entries_with_backup(text, uuid[], text) from public, anon;
revoke execute on function public.undo_import(uuid) from public, anon;
grant execute on function public.penyu_month_stats(integer, public.island_code) to authenticated, service_role;
grant execute on function public.get_dashboard_totals(integer, public.island_code) to authenticated, service_role;
grant execute on function public.get_multi_year_monthly(integer[], public.island_code) to authenticated, service_role;
grant execute on function public.delete_entries_with_backup(text, uuid[], text) to authenticated, service_role;
grant execute on function public.undo_import(uuid) to authenticated, service_role;

-- Fungsi trigger audit: hanya dijalankan oleh trigger (PostgreSQL tidak
-- menyemak EXECUTE semasa trigger berjalan), jadi tiada siapa perlu memanggilnya.
revoke execute on function public.log_daily_entry_change() from public, anon, authenticated;
revoke execute on function public.log_nest_record_change() from public, anon, authenticated;
revoke execute on function public.log_minyak_change() from public, anon, authenticated;

-- ---------- 3. search_path tetap ----------
alter function public.get_dashboard_totals(integer, public.island_code) set search_path to 'public';
alter function public.get_multi_year_monthly(integer[], public.island_code) set search_path to 'public';
alter function public.undo_import(uuid) set search_path to 'public';
alter function public.my_role() set search_path to 'public';
alter function public.my_island() set search_path to 'public';
alter function public.can_view_all() set search_path to 'public';
alter function public.can_use_minyak() set search_path to 'public';
