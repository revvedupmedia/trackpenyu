-- Ujian migration-keselamatan-fungsi.sql: akses fungsi statistik Penyu,
-- fungsi yang ditutup daripada anon, dan search_path tetap.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function public.test_assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'GAGAL: %', msg; end if; raise notice 'OK: %', msg; end $$;

-- Data tahun 2030 (tiada data lain): PTB 150 telur / 3 penyu, PTK 90 telur / 1 penyu.
insert into daily_entries (island, tarikh, ram, created_by, jumlah_telur_diram_bertag, jumlah_telur_diram_takbertag, bilangan_penyu_bertag, bilangan_penyu_takbertag)
  values ('PTB','2030-03-05','LPP','aaaaaaaa-0000-4000-8000-000000000001', 120, 30, 2, 1);
insert into nest_records (id, island, tarikh_dijumpai, bertag, ram, jumlah_telur_diram, created_by)
  values ('99999999-0000-4000-8000-000000000001','PTK','2030-04-01',true,'LPP',90,'cccccccc-0000-4000-8000-000000000003');

-- ---------- Tanpa log masuk ----------
set role anon;
do $$ begin perform get_dashboard_totals(2030, 'PTB'); raise exception 'GAGAL: tanpa log masuk boleh baca jumlah dashboard';
exception when insufficient_privilege then raise notice 'OK: tanpa log masuk tidak boleh baca jumlah dashboard'; end $$;
do $$ begin perform get_multi_year_monthly(array[2030], 'PTB'); raise exception 'GAGAL: tanpa log masuk boleh baca graf bulanan';
exception when insufficient_privilege then raise notice 'OK: tanpa log masuk tidak boleh baca graf bulanan'; end $$;
do $$ begin perform * from penyu_month_stats(2030, 'PTB'); raise exception 'GAGAL: tanpa log masuk boleh baca statistik bulanan';
exception when insufficient_privilege then raise notice 'OK: tanpa log masuk tidak boleh baca statistik bulanan'; end $$;
do $$ begin perform delete_entries_with_backup('daily_entries', array[gen_random_uuid()], 'x'); raise exception 'GAGAL: tanpa log masuk boleh panggil padam entri';
exception when insufficient_privilege then raise notice 'OK: tanpa log masuk tidak boleh panggil padam entri'; end $$;
do $$ begin perform undo_import(gen_random_uuid()); raise exception 'GAGAL: tanpa log masuk boleh panggil buang import';
exception when insufficient_privilege then raise notice 'OK: tanpa log masuk tidak boleh panggil buang import'; end $$;
select test_assert((select count(*) from staff_profiles) = 0 and (select count(*) from daily_entries) = 0,
  'tanpa log masuk: polisi RLS masih berjalan (fungsi pembantu kekal boleh dipanggil), tiada data');
reset role;

-- ---------- Staf PTK ----------
set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-4000-8000-000000000003';
set request.jwt.claims = '{"aal":"aal1"}';
select test_assert((get_dashboard_totals(2030, 'PTK') ->> 'jumlah_telur')::int = 90
               and (get_dashboard_totals(2030, 'PTK') ->> 'jumlah_penyu')::int = 1, 'staf PTK nampak dashboard pulau sendiri (90 telur, 1 penyu)');
select test_assert(get_multi_year_monthly(array[2030], 'PTK') -> '2030' -> 3 ->> 'telur' = '90', 'staf PTK nampak graf bulanan pulau sendiri');
do $$ begin perform get_dashboard_totals(2030, 'PTB'); raise exception 'GAGAL: staf PTK boleh baca dashboard PTB';
exception when insufficient_privilege then raise notice 'OK: staf PTK tidak boleh baca dashboard PTB'; end $$;
do $$ begin perform get_multi_year_monthly(array[2030], 'PTB'); raise exception 'GAGAL: staf PTK boleh baca graf PTB';
exception when insufficient_privilege then raise notice 'OK: staf PTK tidak boleh baca graf bulanan PTB'; end $$;
do $$ begin perform * from penyu_month_stats(2030, 'PSB'); raise exception 'GAGAL: staf PTK boleh baca statistik PSB';
exception when insufficient_privilege then raise notice 'OK: staf PTK tidak boleh baca statistik PSB'; end $$;
-- Trigger audit masih berjalan walaupun fungsi trigger tidak boleh dipanggil terus.
update nest_records set telur_menetas = 70, updated_by = 'cccccccc-0000-4000-8000-000000000003' where id = '99999999-0000-4000-8000-000000000001';
reset role;
select test_assert((select count(*) from nest_records_audit where nest_record_id = '99999999-0000-4000-8000-000000000001') >= 1,
  'trigger audit masih merekod perubahan staf');

-- ---------- Kerani & admin: semua pulau ----------
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select test_assert((get_dashboard_totals(2030, 'PTB') ->> 'jumlah_telur')::int = 150
               and (get_dashboard_totals(2030, 'PTB') ->> 'jumlah_penyu')::int = 3, 'kerani nampak dashboard PTB (150 telur, 3 penyu)');
select test_assert((get_dashboard_totals(2030, 'PTK') ->> 'jumlah_telur')::int = 90, 'kerani nampak dashboard PTK');
select test_assert(get_multi_year_monthly(array[2030], 'PTB') -> '2030' -> 2 ->> 'telur' = '150', 'kerani nampak graf bulanan PTB (Mod Pembentangan)');
select test_assert((select sum(telur) from penyu_month_stats(2030, 'PSB')) = 0, 'kerani boleh baca pulau tanpa data (PSB = 0)');
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
set request.jwt.claims = '{"aal":"aal2"}';
select test_assert((get_dashboard_totals(2030, 'PTK') ->> 'jumlah_telur')::int = 90, 'admin nampak dashboard semua pulau');
reset role;

-- ---------- Semakan menyeluruh (elak masalah sama berulang) ----------
select test_assert(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
), 'semua fungsi SECURITY DEFINER ada search_path tetap');
select test_assert(coalesce((
  select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('is_admin', 'my_role', 'my_island', 'can_view_all', 'can_use_minyak')
    and p.proname not like 'test\_%'
), '') = '', 'hanya fungsi pembantu RLS boleh dipanggil tanpa log masuk');

drop function public.test_assert(boolean, text);
