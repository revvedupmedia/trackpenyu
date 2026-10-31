-- Ujian migration-mfa-admin-wajib.sql: kuasa admin hanya untuk sesi aal2.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
set request.jwt.claims = '{"aal":"aal1"}';
select test_assert(not is_admin(), 'admin tanpa MFA (aal1): bukan admin');
do $$ begin
  insert into targets values (2027, 1, 'PTB');
  raise exception 'GAGAL: admin tanpa MFA boleh ubah sasaran';
exception when insufficient_privilege then raise notice 'OK: admin tanpa MFA tidak boleh ubah sasaran'; end $$;
select test_assert((select count(*) from minyak_entries_audit) = 0, 'admin tanpa MFA tidak boleh baca log perubahan');
set request.jwt.claims = '{"aal":"aal2"}';
select test_assert(is_admin(), 'admin dengan MFA (aal2): admin');
insert into targets values (2027, 1, 'PTB');
select test_assert(true, 'admin dengan MFA boleh ubah sasaran');
select test_assert((select count(*) from minyak_entries_audit) > 0, 'admin dengan MFA boleh baca log perubahan');
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
set request.jwt.claims = '{"aal":"aal1"}';
select test_assert((select count(*) from minyak_entries) > 0, 'kerani tidak terjejas oleh MFA admin');
reset role;
drop function public.test_assert(boolean, text);
