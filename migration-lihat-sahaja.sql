-- Peranan baharu "lihat" (paparan: Lihat Sahaja) untuk pegawai kanan.
--
-- Lihat Sahaja = boleh BACA data Penyu semua pulau (dashboard, entri, Mod
-- Pembentangan). TIDAK boleh tambah/ubah/padam apa-apa, tiada akses Minyak
-- dan resit (can_use_minyak() kekal admin & kerani sahaja).
--
-- Selamat diulang. Boleh run sekali gus (satu transaksi): nilai enum baharu
-- tidak digunakan sebagai enum dalam fail ini (perbandingan guna ::text),
-- jadi tiada ralat "unsafe use of new value".

alter type public.staff_role add value if not exists 'lihat';

-- BACA semua pulau: admin, kerani, lihat.
create or replace function public.can_view_all()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from staff_profiles
                 where id = auth.uid() and role::text in ('admin','kerani','lihat'));
$$;

-- UBAH / PADAM entri sendiri: dahulu "bukan kerani"; sekarang hanya peranan
-- yang memang boleh menulis (staf & admin). Peranan lihat-sahaja (kerani,
-- lihat, dan mana-mana peranan baharu kelak) disekat secara lalai.
drop policy if exists "update daily entries - own entries only" on public.daily_entries;
create policy "update daily entries - own entries only" on public.daily_entries
  for update using (is_admin() or (created_by = auth.uid() and my_role() in ('staff','admin')));

drop policy if exists "update nest records - own entries only" on public.nest_records;
create policy "update nest records - own entries only" on public.nest_records
  for update using (is_admin() or (created_by = auth.uid() and my_role() in ('staff','admin')));

drop policy if exists "delete own daily entries" on public.daily_entries;
create policy "delete own daily entries" on public.daily_entries
  for delete using (is_admin() or (created_by = auth.uid() and my_role() in ('staff','admin')));

drop policy if exists "delete own nest records" on public.nest_records;
create policy "delete own nest records" on public.nest_records
  for delete using (is_admin() or (created_by = auth.uid() and my_role() in ('staff','admin')));

-- Padam berkumpulan (fungsi SECURITY DEFINER, melangkau RLS): sekatan yang
-- sama: hanya staf & admin. Selebihnya sama seperti sebelum ini.
create or replace function public.delete_entries_with_backup(p_table text, p_ids uuid[], p_note text default 'Padam di Log')
returns integer language plpgsql security definer
set search_path = public as $$
declare
  v_batch  uuid := gen_random_uuid();
  v_n      integer := 0;
  v_island island_code;
  v_year   integer;
begin
  if auth.uid() is null then
    raise exception 'Perlu log masuk';
  end if;
  if not coalesce(my_role() in ('staff','admin'), false) then
    raise exception 'Peranan ini tidak boleh padam entri' using errcode = '42501';
  end if;

  if p_table = 'daily_entries' then
    select island, extract(year from tarikh)::int into v_island, v_year
      from daily_entries
     where id = any(p_ids) and (created_by = auth.uid() or is_admin())
     order by tarikh limit 1;
    if v_island is null then return 0; end if;

    insert into import_undo (batch, table_name, row_id, action, before)
      select v_batch, 'daily_entries', d.id, 'delete', to_jsonb(d)
        from daily_entries d
       where d.id = any(p_ids) and (d.created_by = auth.uid() or is_admin());

    delete from daily_entries
     where id = any(p_ids) and (created_by = auth.uid() or is_admin());
    get diagnostics v_n = row_count;

  elsif p_table = 'nest_records' then
    select island, extract(year from tarikh_dijumpai)::int into v_island, v_year
      from nest_records
     where id = any(p_ids) and (created_by = auth.uid() or is_admin())
     order by tarikh_dijumpai limit 1;
    if v_island is null then return 0; end if;

    insert into import_undo (batch, table_name, row_id, action, before)
      select v_batch, 'nest_records', n.id, 'delete', to_jsonb(n)
        from nest_records n
       where n.id = any(p_ids) and (n.created_by = auth.uid() or is_admin());

    delete from nest_records
     where id = any(p_ids) and (created_by = auth.uid() or is_admin());
    get diagnostics v_n = row_count;

  else
    raise exception 'Jadual tidak sah';
  end if;

  insert into import_log (batch, island, year, file_name, deleted, created_by)
  values (v_batch, v_island, v_year, p_note, v_n, auth.uid());

  return v_n;
end;
$$;
revoke execute on function public.delete_entries_with_backup(text, uuid[], text) from public, anon;
grant execute on function public.delete_entries_with_backup(text, uuid[], text) to authenticated;
