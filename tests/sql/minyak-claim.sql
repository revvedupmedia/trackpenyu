-- Ujian migration-minyak-liter-claim.sql: liter, stesen, tarikh claim.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function public.test_assert(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'GAGAL: %', msg; end if; raise notice 'OK: %', msg; end $$;

-- Entri Setel lama (sebelum migration): liter & stesen hanya dalam nota.
alter table minyak_entries disable trigger trg_minyak_claimed_at;
insert into minyak_entries (id, entry_date, fuel_type, amount, user_id, user_email, receipt_ref, notes, needs_claim, claim_status)
values ('77777777-0000-4000-8000-000000000001', '2026-09-01', 'diesel', 48.67, 'bbbbbbbb-0000-4000-8000-000000000002', 'kerani@contoh.my',
        'inv-ujian-1', '22.625 L · PETRONAS Jalan Ujian · Subsidi BUDI RM1.23', true, 'pending');
alter table minyak_entries enable trigger trg_minyak_claimed_at;
\i migration-minyak-liter-claim.sql
select test_assert((select liters = 22.625 and station = 'PETRONAS Jalan Ujian' and notes like '22.625 L%'
                    from minyak_entries where receipt_ref = 'inv-ujian-1'), 'liter & stesen Setel lama diisi semula dari nota (nota kekal)');

-- Kerani tandakan dah claim: tarikh & siapa diisi oleh database.
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';
set request.jwt.claims = '{"aal":"aal1"}';
update minyak_entries set claim_status = 'claimed' where receipt_ref = 'inv-ujian-1';
select test_assert((select claimed_at is not null and claimed_by = 'bbbbbbbb-0000-4000-8000-000000000002'
                    from minyak_entries where receipt_ref = 'inv-ujian-1'), 'tanda dah claim: tarikh & siapa direkod oleh database');
update minyak_entries set claimed_at = '2020-01-01', notes = 'ubah nota' where receipt_ref = 'inv-ujian-1';
select test_assert((select claimed_at > '2026-01-01' from minyak_entries where receipt_ref = 'inv-ujian-1'), 'tarikh claim tidak boleh diubah suai');
update minyak_entries set claim_status = 'pending' where receipt_ref = 'inv-ujian-1';
select test_assert((select claimed_at is null and claimed_by is null from minyak_entries where receipt_ref = 'inv-ujian-1'), 'tanda belum claim: tarikh claim dikosongkan');
insert into minyak_entries (entry_date, fuel_type, amount, liters, user_id, needs_claim, claim_status, claimed_at)
values ('2026-09-02', 'ron95', 59.7, 30, 'bbbbbbbb-0000-4000-8000-000000000002', true, 'pending', '2020-01-01');
select test_assert((select claimed_at is null from minyak_entries where entry_date = '2026-09-02' and amount = 59.7), 'tarikh claim palsu semasa tambah entri diabaikan');
do $$ begin
  insert into minyak_entries (entry_date, fuel_type, amount, liters, user_id) values ('2026-09-03', 'diesel', 10, -5, 'bbbbbbbb-0000-4000-8000-000000000002');
  raise exception 'GAGAL: liter negatif diterima';
exception when check_violation then raise notice 'OK: liter negatif ditolak'; end $$;
do $$ begin perform set_minyak_claimed_at(); raise exception 'GAGAL: fungsi trigger boleh dipanggil terus';
exception when insufficient_privilege then raise notice 'OK: fungsi trigger tarikh claim tidak boleh dipanggil terus'; end $$;
reset role;
select test_assert((select count(*) from minyak_entries_audit a join minyak_entries e on e.id = a.entry_id
                    where e.receipt_ref = 'inv-ujian-1' and a.action = 'update') >= 3, 'perubahan claim masuk Log Perubahan');

drop function public.test_assert(boolean, text);
