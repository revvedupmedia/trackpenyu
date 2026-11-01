-- Minyak: liter, stesen dan tarikh claim (untuk laporan audit).
-- Selamat diulang. Run selepas schema-snapshot-2026-11-01.sql.
--
-- 1. liters / station: lajur sendiri (dahulu hanya dalam nota untuk resit
--    Setel). Entri manual kini boleh isi liter.
-- 2. claimed_at / claimed_by: diisi oleh DATABASE (trigger) bila status
--    bertukar ke "claimed", dan dikosongkan bila ditukar balik. Nilai yang
--    dihantar oleh app diabaikan, jadi tarikh claim tidak boleh diubah suai.
-- 3. Isi semula liter & stesen bagi entri Setel lama daripada nota
--    (cth "22.625 L · PETRONAS Jalan X · Subsidi BUDI RM1.23"). Nota kekal.
--    Entri lama yang sudah "claimed" tiada tarikh claim (tidak diketahui).

alter table public.minyak_entries add column if not exists liters numeric;
alter table public.minyak_entries add column if not exists station text;
alter table public.minyak_entries add column if not exists claimed_at timestamptz;
alter table public.minyak_entries add column if not exists claimed_by uuid;

do $$ begin
  alter table public.minyak_entries add constraint minyak_entries_liters_check check (liters is null or (liters > 0 and liters < 10000));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.minyak_entries add constraint minyak_entries_station_check check (station is null or length(station) <= 200);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.minyak_entries add constraint minyak_entries_claimed_by_fkey foreign key (claimed_by) references auth.users(id) on delete set null;
exception when duplicate_object then null; end $$;

create or replace function public.set_minyak_claimed_at()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.claim_status = 'claimed' then
    if tg_op = 'INSERT' or old.claim_status is distinct from 'claimed' then
      new.claimed_at := now();
      new.claimed_by := auth.uid();
    else
      new.claimed_at := old.claimed_at;   -- tidak boleh diubah selepas ditetapkan
      new.claimed_by := old.claimed_by;
    end if;
  else
    new.claimed_at := null;
    new.claimed_by := null;
  end if;
  return new;
end;
$function$;
revoke execute on function public.set_minyak_claimed_at() from public, anon, authenticated;

drop trigger if exists trg_minyak_claimed_at on public.minyak_entries;
create trigger trg_minyak_claimed_at before insert or update of claim_status, claimed_at, claimed_by
  on public.minyak_entries for each row execute function public.set_minyak_claimed_at();

-- Isi semula dari nota resit Setel (hanya yang belum ada liter).
update public.minyak_entries
set liters  = substring(notes from '^([0-9]+(?:\.[0-9]+)?) L( ·|$)')::numeric,
    station = nullif(btrim(substring(notes from ' · (PETRONAS[^·]*)')), '')
where receipt_ref is not null and liters is null
  and notes ~ '^[0-9]+(\.[0-9]+)? L( ·|$)';
