-- Ujian migration-urus-staf.sql (selepas MFA langkah 2 aktif).
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function public.test_assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'GAGAL: %', msg; end if; raise notice 'OK: %', msg; end $$;

insert into auth.users (id, email) values ('ffffffff-0000-4000-8000-000000000009', 'baru@contoh.my');
insert into auth.mfa_factors (user_id, status) values ('aaaaaaaa-0000-4000-8000-000000000001', 'verified');

set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
set request.jwt.claims = '{"aal":"aal1"}';
do $$ begin perform * from admin_list_accounts(); raise exception 'GAGAL: kerani boleh lihat senarai akaun';
exception when insufficient_privilege then raise notice 'OK: kerani tidak boleh guna Urus Staf'; end $$;
select test_assert((select count(*) from staff_audit) = 0, 'kerani tidak boleh baca log Urus Staf');

set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
do $$ begin perform * from admin_list_accounts(); raise exception 'GAGAL: admin tanpa MFA boleh guna Urus Staf';
exception when insufficient_privilege then raise notice 'OK: admin tanpa MFA tidak boleh guna Urus Staf'; end $$;

set request.jwt.claims = '{"aal":"aal2"}';
select test_assert((select not registered from admin_list_accounts() where email = 'baru@contoh.my'), 'akaun baharu muncul sebagai belum didaftar');
select test_assert((select mfa from admin_list_accounts() where email = 'admin@contoh.my'), 'status MFA admin dipaparkan');
select admin_save_staff('ffffffff-0000-4000-8000-000000000009', ' Staf Baharu ', 'PSB', 'kerani');
select test_assert((select full_name = 'Staf Baharu' and island = 'PSB' and role = 'kerani' from staff_profiles where id = 'ffffffff-0000-4000-8000-000000000009'), 'daftar staf baharu tanpa SQL/UID');
select admin_save_staff('ffffffff-0000-4000-8000-000000000009', 'Staf Baharu', 'PSB', 'admin');
select test_assert((select role = 'admin' from staff_profiles where id = 'ffffffff-0000-4000-8000-000000000009'), 'naikkan kerani kepada admin');
do $$ begin perform admin_save_staff('aaaaaaaa-0000-4000-8000-000000000001', 'Admin', 'PTB', 'staff'); raise exception 'GAGAL: admin boleh turunkan diri sendiri';
exception when raise_exception then if sqlerrm like 'GAGAL%' then raise; end if; raise notice 'OK: admin tidak boleh turunkan diri sendiri'; end $$;
do $$ begin perform admin_set_active('aaaaaaaa-0000-4000-8000-000000000001', false); raise exception 'GAGAL: admin boleh nyahaktif diri sendiri';
exception when raise_exception then if sqlerrm like 'GAGAL%' then raise; end if; raise notice 'OK: admin tidak boleh nyahaktif diri sendiri'; end $$;
select admin_set_active('ffffffff-0000-4000-8000-000000000009', false);
reset role;
select test_assert((select banned_until > now() + interval '99 years' and banned_until <> 'infinity' from auth.users where id = 'ffffffff-0000-4000-8000-000000000009'),
  'nyahaktif menyekat log masuk (banned_until 100 tahun; bukan infinity yang Supabase Auth tidak boleh baca)');
set role authenticated;
select admin_set_active('ffffffff-0000-4000-8000-000000000009', true);
reset role;
select test_assert((select banned_until is null from auth.users where id = 'ffffffff-0000-4000-8000-000000000009'), 'aktifkan semula membuka sekatan');
set role authenticated;
select admin_reset_mfa('aaaaaaaa-0000-4000-8000-000000000001');
reset role;
select test_assert((select count(*) from auth.mfa_factors where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0, 'reset MFA membuang faktor Authenticator');
set role authenticated;
select test_assert((select count(*) from staff_audit) = 5
  and (select string_agg(action, ',' order by id) from staff_audit) = 'daftar,ubah,nyahaktif,aktif,reset_mfa', 'setiap perubahan direkod dalam log Urus Staf');
-- Pembaikan untuk baris lama 'infinity' (migration-urus-staf-fix-ban.sql).
reset role;
update auth.users set banned_until = 'infinity' where id = 'ffffffff-0000-4000-8000-000000000009';
\i migration-urus-staf-fix-ban.sql
select test_assert((select banned_until is null from auth.users where id = 'ffffffff-0000-4000-8000-000000000009'),
  'pembaikan: akaun aktif dengan infinity dibuka semula');
set role anon;
do $$ begin perform * from admin_list_accounts(); raise exception 'GAGAL: tanpa log masuk boleh lihat akaun';
exception when insufficient_privilege then raise notice 'OK: tanpa log masuk tidak boleh guna Urus Staf'; end $$;
reset role;
drop function public.test_assert(boolean, text);
