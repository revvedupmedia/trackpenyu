-- Data contoh supaya SETIAP jadual ada sekurang-kurangnya satu baris sebelum
-- ujian pulih backup (tests/sql/pulih.sh). Termasuk nilai sukar: teks dengan
-- $pulih$, petikan, emoji, jsonb bersarang, perpuluhan, masa.
-- Run selepas rls.sql/staff.sql (akaun aaaaaaaa.../bbbbbbbb... sudah wujud).
insert into public.app_settings (key, value, updated_by) values
  ('ujian', '{"teks": "it''s $pulih$ ok 🐢", "senarai": [1, 2.5, null]}', 'aaaaaaaa-0000-4000-8000-000000000001')
  on conflict (key) do nothing;
insert into public.minyak_settings (key, value) values
  ('bg_video_url', 'https://lama.supabase.co/storage/v1/object/public/app-assets/minyak/bg_1.mp4') on conflict (key) do nothing;
insert into public.notification_rules (id, daily_reminder_time, idle_alert_days) values (1, '19:30', 4) on conflict (id) do nothing;
insert into public.monthly_targets (year, month, target_value, island) values (2026, 5, 1200, 'PTB') on conflict do nothing;
insert into public.monthly_summaries (island, year, month, bilangan_penyu, jumlah_telur, catatan, telur_dikutip)
  values ('PTK', 2019, 7, 12, 1300, E'baris 1\nbaris 2 "petik"', 900) on conflict do nothing;
insert into public.monthly_hatch (island, year, month, ram, menetas_bertag, created_by)
  values ('PSB', 2026, 6, 'ALL', 77, 'aaaaaaaa-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.import_log (batch, island, year, file_name, inserted, created_by)
  values ('11111111-2222-4333-8444-555555555555', 'PTB', 2026, 'Data PTB 2026.xlsx', 3, 'bbbbbbbb-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.import_undo (batch, table_name, row_id, action, before)
  values ('11111111-2222-4333-8444-555555555555', 'daily_entries', gen_random_uuid(), 'update', '{"ram": "LPP"}');
insert into public.login_log (staff_id, island) values ('bbbbbbbb-0000-4000-8000-000000000002', 'PTB');
insert into public.minyak_entries (entry_date, fuel_type, amount, odometer_start, odometer_end, receipt_path, receipt_url, user_id, notes)
  values ('2026-10-02', 'diesel', 123.45, 1000.5, 1100.25, 'receipts/2026/a b.jpg', null, 'aaaaaaaa-0000-4000-8000-000000000001', 'Nota 🐢 $$'),
         ('2019-01-03', 'ron95', 50, null, null, 'receipts/lama.pdf', 'https://projek-lama.supabase.co/storage/v1/object/public/minyak-receipts/receipts/lama.pdf', null, null);
insert into public.client_errors (user_id, app_version, page, message) values (null, 'ujian', 'portal.html', 'Ralat contoh');
insert into public.daily_entries_audit (daily_entry_id, changed_by, before, after)
  select id, 'aaaaaaaa-0000-4000-8000-000000000001', to_jsonb(d), to_jsonb(d) from public.daily_entries d limit 1;
