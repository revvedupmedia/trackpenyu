-- Pembaikan dijumpai semasa menyemak schema-snapshot-2026-10-31.sql.
-- Run dalam Supabase → SQL Editor. Selamat diulang.

-- 1) Edit Entri Individu (nest_records) gagal untuk SEMUA pengguna:
--    "new row violates row-level security policy for table nest_records_audit".
--    Fungsi audit berjalan atas nama pengguna, tetapi nest_records_audit tiada
--    polisi insert. Jadikan SECURITY DEFINER (sama seperti log_daily_entry_change)
--    supaya audit ditulis oleh sistem, dan rekod siapa yang ubah.
create or replace function public.log_nest_record_change()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into public.nest_records_audit (nest_record_id, changed_by, before, after)
  values (
    coalesce(new.id, old.id),
    coalesce(new.updated_by, auth.uid(), new.created_by, old.created_by),
    to_jsonb(old),
    to_jsonb(new)
  );
  new.updated_at = now();
  return new;
end;
$function$;

-- 2) Sasaran & tetapan notifikasi boleh dibaca TANPA log masuk (peranan anon,
--    dengan kunci awam dalam kod). Hadkan kepada pengguna yang log masuk.
drop policy if exists "all staff read targets" on public.targets;
create policy "all staff read targets" on public.targets
  for select to authenticated using (true);

drop policy if exists "all staff read monthly targets" on public.monthly_targets;
create policy "all staff read monthly targets" on public.monthly_targets
  for select to authenticated using (true);

drop policy if exists "all staff read notification rules" on public.notification_rules;
create policy "all staff read notification rules" on public.notification_rules
  for select to authenticated using (true);
