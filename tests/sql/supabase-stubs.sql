-- Tiruan minimum persekitaran Supabase untuk ujian dalam PostgreSQL biasa:
-- peranan anon/authenticated/service_role, auth.users, auth.uid(), auth.role(),
-- auth.jwt() (dibaca dari tetapan request.jwt.*), dan skema storage.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth; create schema if not exists storage;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select coalesce(current_setting('request.jwt.claim.role', true),'anon') $$;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
-- Kebenaran asas yang Supabase beri secara automatik.
grant usage on schema auth, storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
-- Lajur & jadual auth yang digunakan oleh Urus Staf (wujud dalam Supabase sebenar).
alter table auth.users add column if not exists created_at timestamptz default now();
alter table auth.users add column if not exists last_sign_in_at timestamptz;
alter table auth.users add column if not exists banned_until timestamptz;
create table if not exists auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, status text, factor_type text default 'totp');
-- Lajur & jadual Auth yang diisi oleh alat/pulih-backup.mjs (subset Supabase sebenar).
alter table auth.users add column if not exists aud varchar(255);
alter table auth.users add column if not exists role varchar(255);
alter table auth.users add column if not exists encrypted_password varchar(255);
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists confirmation_token varchar(255);
alter table auth.users add column if not exists recovery_token varchar(255);
alter table auth.users add column if not exists raw_app_meta_data jsonb;
create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), provider_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade, identity_data jsonb not null, provider text not null,
  created_at timestamptz, updated_at timestamptz, unique (provider_id, provider));
