-- Ujian migration-tukar-kata-laluan.sql: wajib tukar kata laluan pada log
-- masuk pertama. Dijalankan selepas staff.sql & lihat.sql (pengguna
-- admin/kerani/staf/lihat sudah wujud; admin ada MFA).
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function public.test_assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'GAGAL: %', msg; end if; raise notice 'OK: %', msg; end $$;

insert into auth.users (id, email, encrypted_password) values ('ffffffff-0000-4000-8000-00000000000b', 'sementara@contoh.my', 'hash-sementara');
update auth.users set encrypted_password = 'hash-staf' where id = 'cccccccc-0000-4000-8000-000000000003';

-- ---------- Admin daftar staf baharu => wajib tukar ----------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
set request.jwt.claims = '{"aal":"aal2"}';
select admin_save_staff('ffffffff-0000-4000-8000-00000000000b', 'Staf Sementara', 'PTK', 'staff');
select test_assert((select tukar_kata_laluan from staff_profiles where id = 'ffffffff-0000-4000-8000-00000000000b'), 'staf baharu didaftar => wajib tukar kata laluan');
select test_assert((select tukar_kata_laluan from admin_list_accounts() where email = 'sementara@contoh.my'), 'Urus Staf papar status belum tukar kata laluan');
select admin_save_staff('ffffffff-0000-4000-8000-00000000000b', 'Staf Sementara', 'PTB', 'staff');
select test_assert((select tukar_kata_laluan from staff_profiles where id = 'ffffffff-0000-4000-8000-00000000000b'), 'ubah pulau/peranan tidak membuang tanda');
reset role;

-- ---------- Staf tidak boleh padam tanda sendiri ----------
set role authenticated;
set request.jwt.claim.sub = 'ffffffff-0000-4000-8000-00000000000b';
set request.jwt.claims = '{"aal":"aal1"}';
select test_assert((select tukar_kata_laluan from staff_profiles where id = auth.uid()), 'staf nampak tanda sendiri (app boleh paksa skrin tukar)');
with u as (update staff_profiles set tukar_kata_laluan = false where id = auth.uid() returning 1)
select test_assert((select count(*) from u) = 0, 'staf tidak boleh padam tanda sendiri tanpa tukar kata laluan');
do $$ begin perform admin_wajib_tukar_kata_laluan('ffffffff-0000-4000-8000-00000000000b', false); raise exception 'GAGAL: staf boleh batal wajib tukar';
exception when insufficient_privilege then raise notice 'OK: staf tidak boleh guna fungsi admin wajib tukar'; end $$;
do $$ begin perform _kata_laluan_ditukar(); raise exception 'GAGAL: fungsi trigger boleh dipanggil terus';
exception when insufficient_privilege or feature_not_supported then raise notice 'OK: fungsi trigger tidak boleh dipanggil terus'; end $$;
reset role;

-- ---------- Kata laluan bertukar (Supabase Auth kemas kini auth.users) => tanda dipadam ----------
update auth.users set last_sign_in_at = now() where id = 'ffffffff-0000-4000-8000-00000000000b';
select test_assert((select tukar_kata_laluan from staff_profiles where id = 'ffffffff-0000-4000-8000-00000000000b'), 'log masuk sahaja tidak membuang tanda');
update auth.users set encrypted_password = encrypted_password where id = 'ffffffff-0000-4000-8000-00000000000b';
select test_assert((select tukar_kata_laluan from staff_profiles where id = 'ffffffff-0000-4000-8000-00000000000b'), 'simpan semula kata laluan sama tidak membuang tanda');
update auth.users set encrypted_password = 'hash-baharu' where id = 'ffffffff-0000-4000-8000-00000000000b';
select test_assert((select not tukar_kata_laluan from staff_profiles where id = 'ffffffff-0000-4000-8000-00000000000b'), 'tukar kata laluan => tanda dipadam oleh database');

-- ---------- Admin tanda & batal untuk staf sedia ada ----------
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
set request.jwt.claims = '{"aal":"aal1"}';
do $$ begin perform admin_wajib_tukar_kata_laluan('cccccccc-0000-4000-8000-000000000003', true); raise exception 'GAGAL: kerani boleh tanda wajib tukar';
exception when insufficient_privilege then raise notice 'OK: kerani tidak boleh tanda wajib tukar'; end $$;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin perform admin_wajib_tukar_kata_laluan('cccccccc-0000-4000-8000-000000000003', true); raise exception 'GAGAL: admin tanpa MFA boleh tanda wajib tukar';
exception when insufficient_privilege then raise notice 'OK: admin tanpa MFA tidak boleh tanda wajib tukar'; end $$;
set request.jwt.claims = '{"aal":"aal2"}';
select admin_wajib_tukar_kata_laluan('cccccccc-0000-4000-8000-000000000003', true);
select test_assert((select tukar_kata_laluan from admin_list_accounts() where id = 'cccccccc-0000-4000-8000-000000000003'), 'admin tanda staf sedia ada wajib tukar');
select admin_wajib_tukar_kata_laluan('cccccccc-0000-4000-8000-000000000003', false);
select test_assert((select not tukar_kata_laluan from staff_profiles where id = 'cccccccc-0000-4000-8000-000000000003'), 'admin batal wajib tukar');
do $$ begin perform admin_wajib_tukar_kata_laluan(gen_random_uuid(), true); raise exception 'GAGAL: tanda akaun tidak berdaftar';
exception when raise_exception then if sqlerrm like 'GAGAL%' then raise; end if; raise notice 'OK: akaun belum didaftar ditolak'; end $$;
select test_assert((select string_agg(action, ',' order by id) from staff_audit where target_id = 'cccccccc-0000-4000-8000-000000000003') = 'wajib_tukar,batal_wajib_tukar',
  'tanda & batal direkod dalam log Urus Staf');
reset role;

-- ---------- Tanpa log masuk ----------
set role anon;
do $$ begin perform admin_wajib_tukar_kata_laluan('cccccccc-0000-4000-8000-000000000003', true); raise exception 'GAGAL: tanpa log masuk boleh tanda wajib tukar';
exception when insufficient_privilege then raise notice 'OK: tanpa log masuk tidak boleh guna fungsi wajib tukar'; end $$;
reset role;

-- ---------- Migration: akaun berdaftar yang belum pernah log masuk ditanda ----------
update auth.users set last_sign_in_at = null where id = 'ffffffff-0000-4000-8000-00000000000b';
update auth.users set last_sign_in_at = now() where id = 'cccccccc-0000-4000-8000-000000000003';
\i migration-tukar-kata-laluan.sql
select test_assert((select tukar_kata_laluan from staff_profiles where id = 'ffffffff-0000-4000-8000-00000000000b')
               and (select not tukar_kata_laluan from staff_profiles where id = 'cccccccc-0000-4000-8000-000000000003'),
  'migration: belum pernah log masuk => wajib tukar; sudah log masuk => tidak diubah');
select test_assert((select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'kata_laluan_ditukar') = 1,
  'trigger kata_laluan_ditukar tidak berganda bila migration diulang');

reset request.jwt.claim.sub;
reset request.jwt.claims;
drop function public.test_assert(boolean, text);
