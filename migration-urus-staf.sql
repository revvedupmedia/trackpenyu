-- 👥 Urus Staf dalam Portal (Portal → Pentadbiran). Admin boleh daftar akaun
-- login yang sudah dicipta, tukar nama/pulau/peranan, nyahaktif & aktifkan
-- semula staf, dan reset MFA (hilang telefon) — tanpa buka Supabase.
-- Akaun login baharu masih dicipta di Supabase → Authentication → Add user.
--
-- Semua fungsi SECURITY DEFINER dan semak is_admin() dahulu (admin + MFA
-- selepas migration-mfa-admin-wajib.sql). Perlindungan: admin tidak boleh
-- turunkan atau nyahaktif diri sendiri, dan sekurang-kurangnya seorang admin
-- aktif mesti kekal. Setiap perubahan direkod dalam staff_audit.
-- Run dalam Supabase SQL Editor. Selamat diulang.

alter table public.staff_profiles add column if not exists active boolean not null default true;

create table if not exists public.staff_audit (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  changed_by uuid default auth.uid(),
  target_id uuid not null,
  action text not null check (action in ('daftar','ubah','nyahaktif','aktif','reset_mfa')),
  before jsonb,
  after jsonb
);
create index if not exists idx_staff_audit_time on public.staff_audit (changed_at desc);
alter table public.staff_audit enable row level security;
grant select on public.staff_audit to authenticated;
drop policy if exists "admin reads staff audit" on public.staff_audit;
create policy "admin reads staff audit" on public.staff_audit for select to authenticated using (is_admin());

-- Senarai semua akaun login, termasuk yang belum didaftar sebagai staf.
create or replace function public.admin_list_accounts()
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
               full_name text, island island_code, role staff_role, active boolean, mfa boolean, registered boolean)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not is_admin() then raise exception 'Hanya admin' using errcode = '42501'; end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
           p.full_name, p.island, p.role, coalesce(p.active, true),
           exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
           p.id is not null
    from auth.users u left join public.staff_profiles p on p.id = u.id
    order by (p.id is null) desc, p.role, lower(coalesce(p.full_name, u.email));
end;
$function$;

-- Bilangan admin aktif selain akaun tertentu.
create or replace function public._other_active_admins(p_except uuid)
returns integer language sql stable security definer set search_path to 'public' as $function$
  select count(*)::int from staff_profiles where role = 'admin' and active and id <> p_except;
$function$;

-- Daftar atau ubah staf (nama, pulau, peranan).
create or replace function public.admin_save_staff(p_id uuid, p_full_name text, p_island island_code, p_role staff_role)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_before staff_profiles;
begin
  if not is_admin() then raise exception 'Hanya admin' using errcode = '42501'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Nama penuh diperlukan'; end if;
  if not exists (select 1 from auth.users where id = p_id) then raise exception 'Akaun login tidak wujud'; end if;
  select * into v_before from staff_profiles where id = p_id;
  if v_before.id is not null and v_before.role = 'admin' and p_role <> 'admin' then
    if p_id = auth.uid() then raise exception 'Anda tidak boleh turunkan peranan admin anda sendiri'; end if;
    if _other_active_admins(p_id) = 0 then raise exception 'Mesti ada sekurang-kurangnya seorang admin aktif'; end if;
  end if;
  insert into staff_profiles (id, full_name, island, role) values (p_id, trim(p_full_name), p_island, p_role)
  on conflict (id) do update set full_name = excluded.full_name, island = excluded.island, role = excluded.role;
  insert into staff_audit (target_id, action, before, after)
  values (p_id, case when v_before.id is null then 'daftar' else 'ubah' end,
          case when v_before.id is null then null else to_jsonb(v_before) end,
          (select to_jsonb(s) from staff_profiles s where s.id = p_id));
end;
$function$;

-- Nyahaktif / aktifkan semula. Nyahaktif = tidak boleh log masuk (akaun
-- disekat dalam Supabase Auth) dan app menolak sesi yang masih ada.
create or replace function public.admin_set_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_before staff_profiles;
begin
  if not is_admin() then raise exception 'Hanya admin' using errcode = '42501'; end if;
  select * into v_before from staff_profiles where id = p_id;
  if v_before.id is null then raise exception 'Daftar staf ini dahulu'; end if;
  if not p_active then
    if p_id = auth.uid() then raise exception 'Anda tidak boleh nyahaktif akaun anda sendiri'; end if;
    if v_before.role = 'admin' and _other_active_admins(p_id) = 0 then raise exception 'Mesti ada sekurang-kurangnya seorang admin aktif'; end if;
  end if;
  update staff_profiles set active = p_active where id = p_id;
  update auth.users set banned_until = case when p_active then null else 'infinity'::timestamptz end where id = p_id;
  insert into staff_audit (target_id, action, before, after)
  values (p_id, case when p_active then 'aktif' else 'nyahaktif' end, to_jsonb(v_before),
          (select to_jsonb(s) from staff_profiles s where s.id = p_id));
end;
$function$;

-- Reset MFA (cth hilang telefon): buang faktor Authenticator; pengguna
-- imbas kod QR baharu pada log masuk seterusnya.
create or replace function public.admin_reset_mfa(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not is_admin() then raise exception 'Hanya admin' using errcode = '42501'; end if;
  delete from auth.mfa_factors where user_id = p_id;
  insert into staff_audit (target_id, action) values (p_id, 'reset_mfa');
end;
$function$;

revoke all on function public.admin_list_accounts() from public, anon;
revoke all on function public._other_active_admins(uuid) from public, anon, authenticated;
revoke all on function public.admin_save_staff(uuid, text, island_code, staff_role) from public, anon;
revoke all on function public.admin_set_active(uuid, boolean) from public, anon;
revoke all on function public.admin_reset_mfa(uuid) from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;
grant execute on function public.admin_save_staff(uuid, text, island_code, staff_role) to authenticated;
grant execute on function public.admin_set_active(uuid, boolean) to authenticated;
grant execute on function public.admin_reset_mfa(uuid) to authenticated;
