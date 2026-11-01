-- Pembaikan: "Database error querying schema" semasa log masuk akaun yang
-- pernah dinyahaktif melalui Portal → Urus Staf.
--
-- Punca: admin_set_active menetapkan auth.users.banned_until = 'infinity'.
-- PostgreSQL menerimanya, tetapi pelayan log masuk Supabase (GoTrue) tidak
-- boleh membaca 'infinity' sebagai masa, lalu gagal sebelum menyemak sekatan.
-- Kini guna 100 tahun dari sekarang (cara sama seperti "Ban user" Supabase).
-- Run dalam Supabase SQL Editor. Selamat diulang.

-- 1) Baiki akaun sedia ada: staf aktif -> buka sekatan; staf nyahaktif -> 100 tahun.
update auth.users u
   set banned_until = case when coalesce(p.active, true) then null else now() + interval '100 years' end
  from public.staff_profiles p
 where p.id = u.id and u.banned_until = 'infinity';
update auth.users set banned_until = null
 where banned_until = 'infinity' and id not in (select id from public.staff_profiles);

-- 2) Fungsi nyahaktif / aktifkan semula yang dibetulkan.
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
  -- Bukan 'infinity': pelayan log masuk Supabase tidak boleh membacanya.
  update auth.users set banned_until = case when p_active then null else now() + interval '100 years' end where id = p_id;
  insert into staff_audit (target_id, action, before, after)
  values (p_id, case when p_active then 'aktif' else 'nyahaktif' end, to_jsonb(v_before),
          (select to_jsonb(s) from staff_profiles s where s.id = p_id));
end;
$function$;
