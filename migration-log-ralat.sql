-- Log ralat: ralat JavaScript di peranti staf disimpan supaya admin tahu ada
-- masalah (Portal → Pentadbiran → Log Ralat). Run dalam Supabase SQL Editor.
-- Selamat diulang.

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  app_version text,
  page text,
  message text not null check (length(message) <= 2000),
  stack text check (length(stack) <= 8000),
  user_agent text check (length(user_agent) <= 300)
);

create index if not exists idx_client_errors_time on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
-- Kebenaran asas (Supabase beri automatik; eksplisit untuk PostgreSQL lain).
-- Akses sebenar dikawal oleh RLS di bawah.
grant select, insert, delete on public.client_errors to authenticated;

-- Pengguna log masuk boleh hantar ralat atas nama sendiri sahaja.
drop policy if exists "users report own errors" on public.client_errors;
create policy "users report own errors" on public.client_errors
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "admin reads errors" on public.client_errors;
create policy "admin reads errors" on public.client_errors
  for select to authenticated using (is_admin());

drop policy if exists "admin deletes errors" on public.client_errors;
create policy "admin deletes errors" on public.client_errors
  for delete to authenticated using (is_admin());
