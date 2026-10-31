-- Ujian peraturan akses (RLS) dan pencetus audit dalam PostgreSQL sebenar.
-- Dijalankan oleh tests/sql/run.sh selepas snapshot + migration dipasang.
-- Setiap semakan gagal => ralat "GAGAL: ..." dan skrip berhenti.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create or replace function public.test_assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'GAGAL: %', msg; end if; raise notice 'OK: %', msg; end $$;

-- Data asas (sebagai pentadbir database)
insert into auth.users values
  ('aaaaaaaa-0000-4000-8000-000000000001','admin@contoh.my'),
  ('bbbbbbbb-0000-4000-8000-000000000002','kerani@contoh.my'),
  ('cccccccc-0000-4000-8000-000000000003','staf@contoh.my');
insert into staff_profiles (id, full_name, island, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001','Admin','PTB','admin'),
  ('bbbbbbbb-0000-4000-8000-000000000002','Kerani','PTB','kerani'),
  ('cccccccc-0000-4000-8000-000000000003','Staf','PTK','staff');
insert into minyak_entries (id, entry_date, fuel_type, amount, user_id, user_email)
  values ('dddddddd-0000-4000-8000-000000000001','2026-08-01','diesel',100,'aaaaaaaa-0000-4000-8000-000000000001','admin@contoh.my');
insert into targets values (2026, 50000, 'PTB');
insert into daily_entries (island, tarikh, ram, created_by) values ('PTB','2026-08-01','LPP','aaaaaaaa-0000-4000-8000-000000000001');

-- ---------- Staf ----------
set role authenticated;
set request.jwt.claim.sub = 'cccccccc-0000-4000-8000-000000000003';
set request.jwt.claims = '{"aal":"aal1"}';
select test_assert((select count(*) from minyak_entries) = 0, 'staf tidak nampak data minyak');
do $$ begin
  insert into minyak_entries (entry_date, fuel_type, amount, user_id) values ('2026-08-02','diesel',1,'cccccccc-0000-4000-8000-000000000003');
  raise exception 'GAGAL: staf boleh tambah entri minyak';
exception when insufficient_privilege then raise notice 'OK: staf tidak boleh tambah entri minyak'; end $$;
select test_assert((select count(*) from daily_entries) = 0, 'staf PTK tidak nampak entri pulau PTB');
insert into nest_records (island, tarikh_dijumpai, bertag, ram, jumlah_telur_diram, created_by)
  values ('PTK','2026-08-03',true,'LPP',100,'cccccccc-0000-4000-8000-000000000003');
update nest_records set telur_menetas = 80, updated_by = 'cccccccc-0000-4000-8000-000000000003';
select test_assert(true, 'staf boleh edit Entri Individu sendiri (audit nest_records)');
do $$ begin
  insert into storage.objects (bucket_id, name, owner) values ('minyak-receipts','x','cccccccc-0000-4000-8000-000000000003');
  raise exception 'GAGAL: staf boleh muat naik resit minyak';
exception when insufficient_privilege then raise notice 'OK: staf tidak boleh muat naik resit minyak'; end $$;

-- ---------- Kerani ----------
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
select test_assert((select count(*) from minyak_entries) = 1, 'kerani nampak semua entri minyak');
insert into minyak_entries (id, entry_date, fuel_type, amount, user_id, user_email, receipt_ref)
  values ('eeeeeeee-0000-4000-8000-000000000001','2026-08-05','ron95',199,'bbbbbbbb-0000-4000-8000-000000000002','kerani@contoh.my','INV-1');
do $$ begin
  insert into minyak_entries (entry_date, fuel_type, amount, user_id) values ('2026-08-06','diesel',1,'aaaaaaaa-0000-4000-8000-000000000001');
  raise exception 'GAGAL: kerani boleh tambah entri atas nama admin';
exception when insufficient_privilege then raise notice 'OK: kerani tidak boleh tambah entri atas nama orang lain'; end $$;
with u as (update minyak_entries set notes = 'x' where user_email = 'admin@contoh.my' returning 1)
select test_assert((select count(*) from u) = 0, 'kerani tidak boleh ubah entri admin');
with u as (update minyak_entries set amount = 210 where user_email = 'kerani@contoh.my' returning 1)
select test_assert((select count(*) from u) = 1, 'kerani boleh ubah entri sendiri');
do $$ begin
  insert into minyak_entries (entry_date, fuel_type, amount, user_id, receipt_ref) values ('2026-08-05','ron95',199,'bbbbbbbb-0000-4000-8000-000000000002','INV-1');
  raise exception 'GAGAL: nombor invois Setel sama boleh dimasukkan dua kali';
exception when unique_violation then raise notice 'OK: nombor invois Setel pendua ditolak'; end $$;
update minyak_entries set deleted_at = now(), deleted_by = 'bbbbbbbb-0000-4000-8000-000000000002' where receipt_ref = 'INV-1';
insert into minyak_entries (entry_date, fuel_type, amount, user_id, receipt_ref) values ('2026-08-05','ron95',199,'bbbbbbbb-0000-4000-8000-000000000002','INV-1');
select test_assert(true, 'invois boleh diimport semula selepas entri lama dipadam');
select test_assert((select count(*) from minyak_entries_audit) = 0, 'kerani tidak boleh baca log perubahan minyak');
do $$ begin
  insert into minyak_entries_audit (entry_id, action) values (gen_random_uuid(), 'insert');
  raise exception 'GAGAL: kerani boleh tulis log perubahan';
exception when insufficient_privilege then raise notice 'OK: kerani tidak boleh tulis log perubahan secara terus'; end $$;
insert into storage.objects (bucket_id, name, owner) values ('minyak-receipts','k/r.jpg','bbbbbbbb-0000-4000-8000-000000000002');
select test_assert(true, 'kerani boleh muat naik resit minyak');
insert into client_errors (message, page) values ('TypeError: ujian', '/minyak/');
select test_assert(true, 'pengguna boleh hantar ralat sendiri');
do $$ begin
  insert into client_errors (message, user_id) values ('x', 'aaaaaaaa-0000-4000-8000-000000000001');
  raise exception 'GAGAL: boleh hantar ralat atas nama orang lain';
exception when insufficient_privilege then raise notice 'OK: tidak boleh hantar ralat atas nama orang lain'; end $$;
do $$ begin
  insert into client_errors (message) values (repeat('x', 3000));
  raise exception 'GAGAL: mesej ralat terlalu panjang diterima';
exception when check_violation then raise notice 'OK: mesej ralat dihadkan 2000 aksara'; end $$;
select test_assert((select count(*) from client_errors) = 0, 'kerani tidak boleh baca log ralat');

-- ---------- Admin (sebelum MFA langkah 2) ----------
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
with u as (update minyak_entries set notes = 'semak' returning 1)
select test_assert((select count(*) from u) >= 2, 'admin boleh ubah semua entri minyak');
select test_assert((select count(*) from minyak_entries_audit where action = 'insert') >= 2
               and (select count(*) from minyak_entries_audit where action = 'update') >= 2, 'log perubahan rekod tambah & ubah');
select test_assert((select count(*) from client_errors) = 1, 'admin boleh baca log ralat');

-- ---------- Tanpa log masuk ----------
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
set role anon;
select test_assert((select count(*) from targets) = 0, 'tanpa log masuk: sasaran tidak boleh dibaca');
select test_assert((select count(*) from monthly_targets) = 0, 'tanpa log masuk: sasaran bulanan tidak boleh dibaca');
select test_assert((select count(*) from staff_profiles) = 0, 'tanpa log masuk: senarai staf tidak boleh dibaca');
reset role;
