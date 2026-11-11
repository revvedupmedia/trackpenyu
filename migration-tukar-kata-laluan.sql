-- 🔑 Wajib tukar kata laluan pada log masuk pertama.
--
-- Admin cipta akaun dengan kata laluan sementara (Supabase → Authentication →
-- Add user), kemudian daftar staf di Portal → Urus Staf. Staf itu ditanda
-- tukar_kata_laluan = true, dan app memaksa staf tetapkan kata laluan sendiri
-- sebelum boleh masuk. Tanda dipadam oleh DATABASE (trigger pada auth.users)
-- hanya bila kata laluan benar-benar bertukar; staf tidak boleh padam tanda
-- sendiri (tiada polisi UPDATE pada staff_profiles untuk staf).
--
-- Admin juga boleh tanda semula (cth selepas reset kata laluan staf di
-- Supabase): Urus Staf → "Wajib tukar kata laluan".
--
-- Nota: ini kawalan kebersihan kata laluan, bukan sekatan data. Akses data
-- kekal ditentukan oleh RLS & peranan.
-- Selamat diulang.

alter table public.staff_profiles add column if not exists tukar_kata_laluan boolean not null default false;

alter table public.staff_audit drop constraint if exists staff_audit_action_check;
alter table public.staff_audit add constraint staff_audit_action_check
  check (action in ('daftar','ubah','nyahaktif','aktif','reset_mfa','wajib_tukar','batal_wajib_tukar'));

-- Padam tanda bila kata laluan bertukar (dari app, pautan reset emel atau
-- Supabase). Fungsi trigger: tidak boleh dipanggil terus oleh sesiapa.
create or replace function public._kata_laluan_ditukar()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.staff_profiles set tukar_kata_laluan = false where id = new.id and tukar_kata_laluan;
  end if;
  return new;
end;
$$;
revoke all on function public._kata_laluan_ditukar() from public, anon, authenticated;
drop trigger if exists kata_laluan_ditukar on auth.users;
create trigger kata_laluan_ditukar after update of encrypted_password on auth.users
  for each row execute function public._kata_laluan_ditukar();

-- Senarai akaun: tambah lajur tukar_kata_laluan (jenis hasil berubah => drop dahulu).
drop function if exists public.admin_list_accounts();
create function public.admin_list_accounts()
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
               full_name text, island island_code, role staff_role, active boolean, mfa boolean, registered boolean,
               tukar_kata_laluan boolean)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not is_admin() then raise exception 'Hanya admin' using errcode = '42501'; end if;
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at,
           p.full_name, p.island, p.role, coalesce(p.active, true),
           exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
           p.id is not null,
           coalesce(p.tukar_kata_laluan, false)
    from auth.users u left join public.staff_profiles p on p.id = u.id
    order by (p.id is null) desc, p.role, lower(coalesce(p.full_name, u.email));
end;
$function$;

-- Daftar staf baharu => wajib tukar kata laluan sementara. Ubah staf sedia
-- ada tidak menyentuh tanda ini.
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
  insert into staff_profiles (id, full_name, island, role, tukar_kata_laluan) values (p_id, trim(p_full_name), p_island, p_role, true)
  on conflict (id) do update set full_name = excluded.full_name, island = excluded.island, role = excluded.role;
  insert into staff_audit (target_id, action, before, after)
  values (p_id, case when v_before.id is null then 'daftar' else 'ubah' end,
          case when v_before.id is null then null else to_jsonb(v_before) end,
          (select to_jsonb(s) from staff_profiles s where s.id = p_id));
end;
$function$;

-- Admin tanda / batal "wajib tukar kata laluan" untuk staf berdaftar.
create or replace function public.admin_wajib_tukar_kata_laluan(p_id uuid, p_wajib boolean)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_before staff_profiles;
begin
  if not is_admin() then raise exception 'Hanya admin' using errcode = '42501'; end if;
  select * into v_before from staff_profiles where id = p_id;
  if v_before.id is null then raise exception 'Daftar staf ini dahulu'; end if;
  update staff_profiles set tukar_kata_laluan = coalesce(p_wajib, false) where id = p_id;
  insert into staff_audit (target_id, action, before, after)
  values (p_id, case when coalesce(p_wajib, false) then 'wajib_tukar' else 'batal_wajib_tukar' end, to_jsonb(v_before),
          (select to_jsonb(s) from staff_profiles s where s.id = p_id));
end;
$function$;

revoke all on function public.admin_list_accounts() from public, anon;
revoke all on function public.admin_save_staff(uuid, text, island_code, staff_role) from public, anon;
revoke all on function public.admin_wajib_tukar_kata_laluan(uuid, boolean) from public, anon;
grant execute on function public.admin_list_accounts() to authenticated;
grant execute on function public.admin_save_staff(uuid, text, island_code, staff_role) to authenticated;
grant execute on function public.admin_wajib_tukar_kata_laluan(uuid, boolean) to authenticated;

-- Akaun berdaftar yang belum pernah log masuk masih guna kata laluan yang
-- admin buat: wajibkan tukar pada log masuk pertama.
update public.staff_profiles p set tukar_kata_laluan = true
  from auth.users u
 where u.id = p.id and u.last_sign_in_at is null and not p.tukar_kata_laluan;
