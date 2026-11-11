-- Ujian migration-lihat-sahaja.sql: peranan "lihat" (Lihat Sahaja) boleh
-- baca data Penyu semua pulau, tetapi tidak boleh tulis apa-apa dan tiada
-- akses Minyak. Juga semak kerani/staf tidak berubah.
-- Dijalankan selepas rls.sql (pengguna admin/kerani/staf sudah wujud).
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function public.test_assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'GAGAL: %', msg; end if; raise notice 'OK: %', msg; end $$;

-- Data (sebagai pentadbir database). Satu entri "milik" akaun lihat untuk
-- membuktikan pemilikan pun tidak beri kuasa ubah/padam.
insert into auth.users values ('11111111-0000-4000-8000-00000000000a','pegawai@contoh.my');
insert into staff_profiles (id, full_name, island, role) values ('11111111-0000-4000-8000-00000000000a','Pegawai','PTB','lihat');
insert into daily_entries (id, island, tarikh, ram, created_by) values
  ('22222222-0000-4000-8000-000000000001','PTK','2031-02-01','LPP','cccccccc-0000-4000-8000-000000000003'),
  ('22222222-0000-4000-8000-000000000002','PSB','2031-02-02','LPP','11111111-0000-4000-8000-00000000000a'),
  ('22222222-0000-4000-8000-000000000003','PTB','2031-02-03','LPP','bbbbbbbb-0000-4000-8000-000000000002');
insert into nest_records (id, island, tarikh_dijumpai, bertag, ram, jumlah_telur_diram, created_by)
  values ('22222222-0000-4000-8000-000000000004','PTK','2031-02-04',true,'LPP',80,'11111111-0000-4000-8000-00000000000a');

-- ---------- Lihat Sahaja ----------
set role authenticated;
set request.jwt.claim.sub = '11111111-0000-4000-8000-00000000000a';
set request.jwt.claims = '{"aal":"aal1"}';
select test_assert(my_role()::text = 'lihat' and can_view_all() and not is_admin() and not can_use_minyak(), 'lihat: boleh lihat semua, bukan admin, tiada Minyak');
select test_assert((select count(distinct island) from daily_entries where tarikh >= '2031-01-01') = 3, 'lihat nampak entri harian semua pulau');
select test_assert((select count(*) from nest_records where id = '22222222-0000-4000-8000-000000000004') = 1, 'lihat nampak rekod individu pulau lain');
select test_assert((get_dashboard_totals(2031, 'PTK') ->> 'jumlah_telur') is not null, 'lihat nampak dashboard PTK');
select test_assert(get_multi_year_monthly(array[2031], 'PSB') is not null, 'lihat nampak graf bulanan (Mod Pembentangan)');
select test_assert((select count(*) from penyu_month_stats(2031, 'PTB')) = 12, 'lihat boleh baca statistik bulanan');
select test_assert((select count(*) from targets) >= 1, 'lihat boleh baca sasaran');

do $$ begin
  insert into daily_entries (island, tarikh, ram, created_by) values ('PTB','2031-03-01','LPP','11111111-0000-4000-8000-00000000000a');
  raise exception 'GAGAL: lihat boleh tambah entri harian';
exception when insufficient_privilege then raise notice 'OK: lihat tidak boleh tambah entri harian'; end $$;
do $$ begin
  insert into nest_records (island, tarikh_dijumpai, bertag, ram, jumlah_telur_diram, created_by)
    values ('PTB','2031-03-01',true,'LPP',10,'11111111-0000-4000-8000-00000000000a');
  raise exception 'GAGAL: lihat boleh tambah rekod individu';
exception when insufficient_privilege then raise notice 'OK: lihat tidak boleh tambah rekod individu'; end $$;
do $$ begin
  insert into monthly_hatch (island, year, month, ram) values ('PTB', 2031, 3, 'LPP');
  raise exception 'GAGAL: lihat boleh tambah menetas bulanan';
exception when insufficient_privilege then raise notice 'OK: lihat tidak boleh tambah menetas bulanan'; end $$;

with u as (update daily_entries set catatan = 'x' returning 1)
select test_assert((select count(*) from u) = 0, 'lihat tidak boleh ubah entri harian (walaupun milik sendiri)');
with u as (update nest_records set telur_menetas = 1 returning 1)
select test_assert((select count(*) from u) = 0, 'lihat tidak boleh ubah rekod individu (walaupun milik sendiri)');
with d as (delete from daily_entries returning 1)
select test_assert((select count(*) from d) = 0, 'lihat tidak boleh padam entri harian');
with d as (delete from nest_records returning 1)
select test_assert((select count(*) from d) = 0, 'lihat tidak boleh padam rekod individu');
do $$ begin
  perform delete_entries_with_backup('daily_entries', array['22222222-0000-4000-8000-000000000002'::uuid], 'x');
  raise exception 'GAGAL: lihat boleh padam melalui fungsi padam berkumpulan';
exception when insufficient_privilege then raise notice 'OK: lihat tidak boleh padam melalui fungsi padam berkumpulan'; end $$;
with u as (update targets set target_value = 1 returning 1)
select test_assert((select count(*) from u) = 0, 'lihat tidak boleh ubah sasaran');
with u as (update app_settings set value = value returning 1)
select test_assert((select count(*) from u) = 0, 'lihat tidak boleh ubah tetapan app (teks Pembentangan)');
do $$ begin
  insert into monthly_summaries (island, year, month) values ('PTB', 2031, 3);
  raise exception 'GAGAL: lihat boleh tambah rekod bulanan lama';
exception when insufficient_privilege then raise notice 'OK: lihat tidak boleh tambah rekod bulanan lama'; end $$;

select test_assert((select count(*) from minyak_entries) = 0, 'lihat tidak nampak data Minyak');
select test_assert((select count(*) from minyak_settings) = 0, 'lihat tidak nampak tetapan Minyak');
do $$ begin
  insert into minyak_entries (entry_date, fuel_type, amount, user_id) values ('2031-02-01','diesel',1,'11111111-0000-4000-8000-00000000000a');
  raise exception 'GAGAL: lihat boleh tambah entri Minyak';
exception when insufficient_privilege then raise notice 'OK: lihat tidak boleh tambah entri Minyak'; end $$;
select test_assert((select count(*) from login_log where staff_id <> auth.uid()) = 0, 'lihat tidak nampak sejarah log masuk orang lain');
select test_assert((select count(*) from daily_entries_audit) = 0, 'lihat tidak boleh baca log perubahan');
do $$ begin perform * from admin_list_accounts(); raise exception 'GAGAL: lihat boleh guna Urus Staf';
exception when insufficient_privilege then raise notice 'OK: lihat tidak boleh guna Urus Staf'; end $$;
reset role;

-- ---------- Kerani: masih tidak boleh ubah/padam ----------
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
with u as (update daily_entries set catatan = 'x' where id = '22222222-0000-4000-8000-000000000003' returning 1)
select test_assert((select count(*) from u) = 0, 'kerani masih tidak boleh ubah entri harian');
do $$ begin
  perform delete_entries_with_backup('daily_entries', array['22222222-0000-4000-8000-000000000003'::uuid], 'x');
  raise exception 'GAGAL: kerani boleh padam melalui fungsi padam berkumpulan';
exception when insufficient_privilege then raise notice 'OK: kerani tidak boleh padam melalui fungsi padam berkumpulan'; end $$;
reset role;

-- ---------- Staf: masih boleh ubah & padam entri sendiri ----------
set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-4000-8000-000000000003';
with u as (update daily_entries set catatan = 'semak' where id = '22222222-0000-4000-8000-000000000001' returning 1)
select test_assert((select count(*) from u) = 1, 'staf masih boleh ubah entri sendiri');
select test_assert(delete_entries_with_backup('daily_entries', array['22222222-0000-4000-8000-000000000001'::uuid], 'ujian') = 1,
  'staf masih boleh padam entri sendiri melalui fungsi padam');
reset role;

-- ---------- Admin: boleh daftar peranan lihat ----------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
set request.jwt.claims = '{"aal":"aal2"}';
select admin_save_staff('11111111-0000-4000-8000-00000000000a', 'Pegawai Kanan', 'PTB', 'lihat');
select test_assert((select role::text = 'lihat' and full_name = 'Pegawai Kanan' from staff_profiles where id = '11111111-0000-4000-8000-00000000000a'),
  'admin boleh daftar/ubah akaun Lihat Sahaja melalui Urus Staf');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
