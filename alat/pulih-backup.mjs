#!/usr/bin/env node
// Pulih backup Portal LPP ke projek Supabase (baharu atau sedia ada).
// Hanya perlu Node.js 18+ (tiada pakej lain). Panduan penuh: README.md,
// bahagian "Pindah ke Supabase atau GitHub baharu".
//
// 1) Jana SQL data (akaun login + semua jadual) dari folder ZIP backup yang
//    sudah di-extract:
//      node alat/pulih-backup.mjs <folder-backup> [--url-baharu https://xxxx.supabase.co] > pulih.sql
//    Kemudian run pulih.sql (Supabase SQL Editor, atau psql untuk fail besar)
//    SELEPAS struktur database dibina (snapshot + migration).
//
// 2) Muat naik fail resit & video latar (jika backup dibuat dengan "Termasuk fail"):
//      SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=<service_role key> \
//        node alat/pulih-backup.mjs <folder-backup> --muat-naik-fail
//    Kunci service_role: Supabase > Project Settings > API. JANGAN simpan dalam
//    repo atau kongsi; ia memintas semua RLS.
//
// SQL yang dijana selamat diulang: baris yang sudah wujud (ikut primary key)
// tidak disentuh. Trigger audit dimatikan semasa pulih supaya log audit tidak
// bertambah dengan baris palsu.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BACKUP_TABLES, BACKUP_FORMAT } from '../shared/backup.js'

export function readBackup(input) {
  let file = input
  if (statSync(input).isDirectory()) {
    const found = readdirSync(input).filter((f) => /^backup-.*\.json$/.test(f)).sort()
    if (!found.length) throw new Error(`Tiada fail backup-*.json dalam ${input}. Extract ZIP backup dahulu.`)
    file = join(input, found.at(-1))
  }
  const b = JSON.parse(readFileSync(file, 'utf8'))
  if (!b.meta || !b.data) throw new Error(`${file} bukan backup Portal LPP.`)
  if ((b.meta.format || 1) > BACKUP_FORMAT) throw new Error(`Backup format ${b.meta.format} lebih baharu daripada alat ini (${BACKUP_FORMAT}). Kemas kini repo.`)
  return b
}

// Dollar-quote yang dijamin tidak muncul dalam data.
function quote(text) {
  let tag = 'pulih'
  while (text.includes(`$${tag}$`)) tag += Math.floor(Math.random() * 10)
  return `$${tag}$${text}$${tag}$`
}

export function toSql(backup, { newUrl } = {}) {
  const { meta, data, accounts = [] } = backup
  const out = []
  const w = (s) => out.push(s)
  w(`-- Pulih backup Portal LPP: ${meta.created_at} oleh ${meta.created_by} (app ${meta.version}, format ${meta.format || 1})`)
  w(`-- Dijana oleh alat/pulih-backup.mjs. Run SELEPAS struktur database dibina. Selamat diulang.`)
  w(`begin;`)
  w(`-- Matikan trigger (log audit) & semakan foreign key semasa memasukkan data.`)
  w(`set local session_replication_role = replica;`)
  w(`
create function pg_temp.pulih(t text, rows jsonb) returns text language plpgsql as $f$
declare cols text; n int; c record;
begin
  if to_regclass('public.' || quote_ident(t)) is null then return t || ': DILANGKAU (jadual tiada)'; end if;
  select string_agg(quote_ident(column_name), ',' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = t and is_generated = 'NEVER';
  execute format('insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing', t, cols, cols, t) using rows;
  get diagnostics n = row_count;
  -- Kaunter ID (identity) diteruskan selepas nilai terbesar yang dipulihkan.
  for c in select column_name from information_schema.columns where table_schema = 'public' and table_name = t and is_identity = 'YES' loop
    execute format('select setval(pg_get_serial_sequence(%L, %L), greatest(coalesce((select max(%I) from public.%I), 0), 1))', 'public.' || t, c.column_name, c.column_name, t);
  end loop;
  return format('%s: %s baris baharu daripada %s', t, n, jsonb_array_length(rows));
end $f$;`)

  w(`
-- Akaun login dicipta dengan ID asal (semua data merujuk ID ini) TANPA kata
-- laluan: staf guna "Lupa kata laluan" di halaman log masuk. MFA admin perlu
-- didaftar semula (kod QR baharu). Akaun yang sudah wujud tidak diubah.
create function pg_temp.pulih_akaun(rows jsonb) returns text language plpgsql as $f$
declare r jsonb; n int := 0; c text; v text; cols text[];
  isi constant text[][] := array[
    ['instance_id', '''00000000-0000-0000-0000-000000000000'''],
    ['aud', '''authenticated'''], ['role', '''authenticated'''],
    ['encrypted_password', ''''''], ['email_confirmed_at', 'now()'],
    ['created_at', 'coalesce(($2->>''created_at'')::timestamptz, now())'], ['updated_at', 'now()'],
    ['raw_app_meta_data', '''{"provider":"email","providers":["email"]}'''], ['raw_user_meta_data', '''{}'''],
    -- Lajur token mesti '' (bukan NULL) atau log masuk gagal "Database error querying schema".
    ['confirmation_token', ''''''], ['recovery_token', ''''''], ['email_change_token_new', ''''''],
    ['email_change', ''''''], ['email_change_token_current', ''''''], ['phone_change', ''''''],
    ['phone_change_token', ''''''], ['reauthentication_token', ''''''],
    ['banned_until', 'case when ($2->>''active'')::boolean is false then now() + interval ''100 years'' end']];
begin
  select array_agg(column_name::text) into cols from information_schema.columns where table_schema = 'auth' and table_name = 'users';
  for r in select * from jsonb_array_elements(rows) loop
    continue when exists (select 1 from auth.users where id = (r->>'id')::uuid);
    insert into auth.users (id, email) values ((r->>'id')::uuid, lower(r->>'email'));
    for i in 1 .. array_length(isi, 1) loop
      c := isi[i][1]; v := isi[i][2];
      continue when not c = any(cols);
      execute format('update auth.users set %I = %s where id = $1', c, v) using (r->>'id')::uuid, r;
    end loop;
    if to_regclass('auth.identities') is not null then
      begin
        insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
        values (r->>'id', (r->>'id')::uuid, jsonb_build_object('sub', r->>'id', 'email', lower(r->>'email'), 'email_verified', true), 'email', now(), now());
      exception when others then raise warning 'auth.identities %: %', r->>'email', sqlerrm;
      end;
    end if;
    n := n + 1;
  end loop;
  return format('akaun login: %s baharu daripada %s', n, jsonb_array_length(rows));
end $f$;`)

  w(`\n-- Laporan: setiap baris memaparkan hasil satu langkah.`)
  w(`create temp table pulih_laporan (langkah serial, hasil text) on commit drop;`)
  w(`insert into pulih_laporan (hasil) select pg_temp.pulih_akaun(${quote(JSON.stringify(accounts))}::jsonb);`)
  const extra = Object.keys(data).filter((t) => !BACKUP_TABLES.includes(t))
  for (const t of [...BACKUP_TABLES, ...extra]) {
    if (!data[t]) continue
    w(`insert into pulih_laporan (hasil) select pg_temp.pulih(${quote(t)}, ${quote(JSON.stringify(data[t]))}::jsonb);`)
  }
  // URL awam Storage projek lama (cth video latar Minyak) -> projek baharu.
  const oldUrl = meta.supabase_url?.replace(/\/+$/, '')
  if (newUrl && oldUrl && newUrl.replace(/\/+$/, '') !== oldUrl) {
    w(`update public.minyak_settings set value = replace(value, ${quote(oldUrl)}, ${quote(newUrl.replace(/\/+$/, ''))}) where value like ${quote(oldUrl + '%')};`)
    w(`insert into pulih_laporan (hasil) values ('URL Storage ditukar ke projek baharu');`)
  }
  w(`select hasil as "Hasil pulih" from pulih_laporan order by langkah;`)
  w(`commit;`)
  return out.join('\n') + '\n'
}

export function listFiles(dir) {
  const root = join(dir, 'fail')
  if (!existsSync(root)) return []
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
  return walk(root).map((full) => {
    const [bucket, ...rest] = relative(root, full).split(sep)
    return { full, bucket, path: rest.join('/') }
  })
}

const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', heic: 'image/heic' }

export async function uploadFiles(dir, { url, key, log = console.error, fetchImpl = fetch } = {}) {
  if (!url || !key) throw new Error('Perlu SUPABASE_URL dan SUPABASE_SERVICE_KEY (kunci service_role projek baharu).')
  const files = listFiles(dir)
  if (!files.length) throw new Error(`Tiada folder fail/ dalam ${dir}. Backup perlu dibuat dengan "Termasuk fail".`)
  let ok = 0
  const failed = []
  for (const f of files) {
    const ext = f.path.split('.').pop().toLowerCase()
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/storage/v1/object/${f.bucket}/${f.path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'x-upsert': 'true', 'Content-Type': TYPES[ext] || 'application/octet-stream' },
      body: readFileSync(f.full),
    })
    if (res.ok) ok++
    else failed.push(`${f.bucket}/${f.path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    log(`${ok + failed.length}/${files.length} ${f.bucket}/${f.path} ${res.ok ? 'OK' : 'GAGAL'}`)
  }
  return { ok, failed }
}

async function main(argv) {
  const args = argv.slice(2)
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined }
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? (args.splice(i, 1), true) : false }
  const newUrl = opt('--url-baharu')
  const upload = flag('--muat-naik-fail')
  const [input] = args
  if (!input) {
    console.error('Guna: node alat/pulih-backup.mjs <folder-backup> [--url-baharu https://xxxx.supabase.co] > pulih.sql\n' +
      '      node alat/pulih-backup.mjs <folder-backup> --muat-naik-fail   (perlu SUPABASE_URL & SUPABASE_SERVICE_KEY)')
    process.exit(2)
  }
  if (upload) {
    const { ok, failed } = await uploadFiles(input, { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY })
    console.error(`\nSiap: ${ok} fail dimuat naik, ${failed.length} gagal.`)
    failed.forEach((f) => console.error('  ' + f))
    process.exit(failed.length ? 1 : 0)
  }
  const backup = readBackup(input)
  process.stdout.write(toSql(backup, { newUrl }))
  const n = Object.values(backup.data).reduce((s, r) => s + r.length, 0)
  console.error(`SQL dijana: ${n} baris dari ${Object.keys(backup.data).length} jadual, ${(backup.accounts || []).length} akaun login.`)
  if (!backup.accounts) console.error('AMARAN: backup lama tanpa senarai akaun. Cipta akaun dengan ID asal dahulu (lihat README), jika tidak data staf tidak dapat dipulihkan.')
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv).catch((e) => { console.error('Gagal: ' + e.message); process.exit(1) })
}
