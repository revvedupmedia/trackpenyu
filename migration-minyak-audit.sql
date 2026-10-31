-- Log perubahan (audit) Minyak Tracker: setiap tambah, ubah, padam dan pulih
-- entri direkod bersama siapa dan bila. Hanya admin boleh baca.
-- Run SELEPAS migration-minyak-semakan.sql. Selamat diulang.

create table if not exists public.minyak_entries_audit (
  id bigint generated always as identity primary key,
  entry_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now(),
  before jsonb,
  after jsonb
);

create index if not exists idx_minyak_entries_audit_entry on public.minyak_entries_audit (entry_id);
create index if not exists idx_minyak_entries_audit_time on public.minyak_entries_audit (changed_at desc);

alter table public.minyak_entries_audit enable row level security;
-- Kebenaran asas (Supabase beri automatik; eksplisit untuk PostgreSQL lain).
-- Akses sebenar dikawal oleh RLS di bawah.
grant select on public.minyak_entries_audit to authenticated;

drop policy if exists "admin reads minyak audit" on public.minyak_entries_audit;
create policy "admin reads minyak audit" on public.minyak_entries_audit
  for select to authenticated using (is_admin());

-- Ditulis oleh sistem (SECURITY DEFINER): pengguna tidak boleh tulis atau ubah
-- log secara terus, dan tiada polisi insert/update/delete untuk mereka.
create or replace function public.log_minyak_change()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into public.minyak_entries_audit (entry_id, action, changed_by, before, after)
  values (
    coalesce(new.id, old.id),
    lower(tg_op),
    auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_minyak_entries_audit on public.minyak_entries;
create trigger trg_minyak_entries_audit
  after insert or update or delete on public.minyak_entries
  for each row execute function public.log_minyak_change();
