-- Minyak Tracker dalam projek Supabase yang sama dengan Penyu Tracker
-- (satu login untuk semua app dalam portal).
-- Run SELEPAS semua migration Penyu (perlu is_admin() dan peranan 'kerani').
--
-- Akses: hanya admin dan kerani. Staf biasa tidak boleh baca atau tulis
-- apa-apa data minyak, walaupun buka /minyak/ terus.

create or replace function can_use_minyak()
returns boolean language sql security definer stable as $$
  select exists (select 1 from staff_profiles where id = auth.uid() and role in ('admin','kerani'));
$$;

-- ---------------------------------------------------------------
-- Entri minyak (sama struktur dengan fuel_entries projek lama)
-- receipt_url hanya untuk resit lama yang belum dipindah; entri baharu
-- simpan receipt_path sahaja (bucket private).
-- ---------------------------------------------------------------
create table if not exists minyak_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  entry_date date not null,
  fuel_type text not null check (fuel_type in ('diesel','ron95')),
  odometer_start numeric,
  odometer_end numeric,
  distance_km numeric,
  amount numeric not null,
  needs_claim boolean default false,
  claim_status text default 'pending' check (claim_status in ('pending','claimed','not_applicable')),
  notes text,
  receipt_url text,
  receipt_path text,
  user_id uuid references auth.users(id) on delete set null,
  user_email text
);

create index if not exists idx_minyak_entries_date on minyak_entries (entry_date);

alter table minyak_entries enable row level security;

drop policy if exists "minyak read" on minyak_entries;
create policy "minyak read" on minyak_entries
  for select using (can_use_minyak());

drop policy if exists "minyak insert own" on minyak_entries;
create policy "minyak insert own" on minyak_entries
  for insert with check (can_use_minyak() and user_id = auth.uid());

drop policy if exists "minyak update own or admin" on minyak_entries;
create policy "minyak update own or admin" on minyak_entries
  for update using (can_use_minyak() and (user_id = auth.uid() or is_admin()));

drop policy if exists "minyak delete own or admin" on minyak_entries;
create policy "minyak delete own or admin" on minyak_entries
  for delete using (can_use_minyak() and (user_id = auth.uid() or is_admin()));

-- ---------------------------------------------------------------
-- Tetapan Minyak (cth bg_video_url). Admin sahaja boleh ubah.
-- ---------------------------------------------------------------
create table if not exists minyak_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

alter table minyak_settings enable row level security;

drop policy if exists "minyak settings read" on minyak_settings;
create policy "minyak settings read" on minyak_settings
  for select using (can_use_minyak());

drop policy if exists "minyak settings admin write" on minyak_settings;
create policy "minyak settings admin write" on minyak_settings
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------
-- Storan resit: PRIVATE. App buka resit guna signed URL (sah 1 jam),
-- jadi pautan resit tidak boleh dikongsi kepada orang luar.
-- Video latar Minyak guna bucket 'app-assets' sedia ada (folder minyak/,
-- admin sahaja boleh upload — polisi dari fix-storage-upload.sql).
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('minyak-receipts', 'minyak-receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "minyak receipts read" on storage.objects;
create policy "minyak receipts read" on storage.objects
  for select using (bucket_id = 'minyak-receipts' and can_use_minyak());

drop policy if exists "minyak receipts upload" on storage.objects;
create policy "minyak receipts upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'minyak-receipts' and can_use_minyak());

-- Upsert (pindah resit lama) perlukan update; admin sahaja.
drop policy if exists "minyak receipts admin update" on storage.objects;
create policy "minyak receipts admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'minyak-receipts' and is_admin())
  with check (bucket_id = 'minyak-receipts' and is_admin());

drop policy if exists "minyak receipts delete" on storage.objects;
create policy "minyak receipts delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'minyak-receipts' and can_use_minyak() and (owner = auth.uid() or is_admin()));
