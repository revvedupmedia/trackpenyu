#!/usr/bin/env bash
# Dipanggil oleh run.sh selepas ujian lain (lpp_test sudah lengkap, termasuk MFA).
# 1) Setiap jadual database MESTI ada dalam shared/backup.js (BACKUP_TABLES).
# 2) Backup (bentuk JSON sama seperti Portal) -> alat/pulih-backup.mjs -> SQL ->
#    database baharu = data asal, akaun dengan ID asal, selamat diulang.
set -euo pipefail
cd "$(dirname "$0")/../.."
psql_db() { psql -X -q -v ON_ERROR_STOP=1 -d "$@"; }
q() { psql -X -q -At -v ON_ERROR_STOP=1 -d "$@"; }
fail() { echo "  GAGAL: $*"; exit 1; }
OUT=$(mktemp -d)

psql_db lpp_test -f tests/sql/data-contoh.sql

# --- 1. Liputan: jadual database vs BACKUP_TABLES
q lpp_test -c "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1" > "$OUT/db.txt"
node -e "import('./shared/backup.js').then(m => console.log(m.BACKUP_TABLES.slice().sort().join('\n')))" > "$OUT/backup.txt"
missing=$(comm -23 "$OUT/db.txt" "$OUT/backup.txt")
[ -z "$missing" ] || fail "jadual tiada dalam BACKUP_TABLES (shared/backup.js): $(echo $missing)"
echo "  OK: semua $(wc -l < "$OUT/db.txt") jadual database ada dalam backup"
empty=$(while read -r t; do [ "$(q lpp_test -c "select count(*) from public.$t")" = 0 ] && echo "$t"; done < "$OUT/db.txt" || true)
[ -z "$empty" ] || fail "data-contoh.sql tidak isi jadual: $(echo $empty)"

# --- 2. Jana backup seperti Portal (JSON PostgREST = to_json PostgreSQL)
tables_json=$(node -e "import('./shared/backup.js').then(m => console.log(m.BACKUP_TABLES.join(' ')))")
{
  echo "select json_build_object("
  echo "  'meta', json_build_object('app','Portal LPP','format',2,'version','ujian','created_at',now(),'created_by','admin@contoh.my','supabase_url','https://lama.supabase.co'),"
  echo "  'accounts', (select json_agg(json_build_object('id',u.id,'email',u.email,'created_at',u.created_at,'full_name',p.full_name,'role',p.role,'island',p.island,'active',coalesce(p.active,true))) from auth.users u left join public.staff_profiles p on p.id=u.id),"
  echo "  'data', json_build_object("
  sep=""
  for t in $tables_json; do echo "    $sep'$t', (select coalesce(json_agg(x), '[]') from public.$t x)"; sep=","; done
  echo "  ))"
} > "$OUT/dump.sql"
mkdir -p "$OUT/backup"
q lpp_test -f "$OUT/dump.sql" > "$OUT/backup/backup-2026-11-01.json"
# Satu akaun dinyahaktif: mesti kekal tidak boleh log masuk selepas pulih.
node -e "
const fs=require('fs'),f=process.argv[1],b=JSON.parse(fs.readFileSync(f));
b.accounts.find(a=>a.email==='staf@contoh.my').active=false; fs.writeFileSync(f,JSON.stringify(b))" "$OUT/backup/backup-2026-11-01.json"

node alat/pulih-backup.mjs "$OUT/backup" --url-baharu https://baru.supabase.co > "$OUT/pulih.sql" 2> "$OUT/pulih.log"

# --- 3. Database baharu: struktur dari snapshot + migration, kemudian pulih
psql -X -q -d postgres -c "drop database if exists lpp_pulih" -c "create database lpp_pulih"
psql_db lpp_pulih -f tests/sql/supabase-stubs.sql
psql_db lpp_pulih -f "$SNAPSHOT"
for m in $MIGRATIONS_LIST migration-mfa-admin-wajib.sql; do psql_db lpp_pulih -f "$m"; done
q lpp_pulih -f "$OUT/pulih.sql" > "$OUT/hasil1.txt"
q lpp_pulih -f "$OUT/pulih.sql" > "$OUT/hasil2.txt"   # kali kedua: tiada apa berubah
N=$(q lpp_test -c "select count(*) from auth.users")   # bilangan akaun ujian (termasuk peranan lihat)
grep -q "akaun login: $N baharu" "$OUT/hasil1.txt" || fail "akaun tidak dicipta: $(cat "$OUT/hasil1.txt")"
grep -q "staff_profiles: $N baris baharu" "$OUT/hasil1.txt" || fail "staff_profiles: $(cat "$OUT/hasil1.txt")"
grep -v "^URL" "$OUT/hasil2.txt" | grep -vq ": 0 baris baharu\|: 0 baharu" && fail "pulih kali kedua mengubah data: $(cat "$OUT/hasil2.txt")"
echo "  OK: pulih selamat diulang (kali kedua 0 baris baharu)"

# Setiap jadual sama dengan asal (kecuali URL video latar yang ditukar).
for t in $tables_json; do
  sig="select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by to_jsonb(x)::text), '')) from public.$t x"
  [ "$t" = minyak_settings ] && sig="select count(*) || ':' || md5(coalesce(string_agg(replace(to_jsonb(x)::text, 'lama.supabase', 'baru.supabase'), '|' order by to_jsonb(x)::text), '')) from public.$t x"
  a=$(q lpp_test -c "$sig"); b=$(q lpp_pulih -c "$(echo "$sig" | sed "s/replace(to_jsonb(x)::text, 'lama.supabase', 'baru.supabase')/to_jsonb(x)::text/")")
  [ "$a" = "$b" ] || fail "$t berbeza selepas pulih ($a vs $b)"
done
echo "  OK: $(echo $tables_json | wc -w) jadual dipulihkan sama dengan asal (log audit tidak bertambah)"

[ "$(q lpp_pulih -c "select value from minyak_settings where key='bg_video_url'")" = "https://baru.supabase.co/storage/v1/object/public/app-assets/minyak/bg_1.mp4" ] || fail "URL video latar tidak ditukar"
echo "  OK: URL Storage ditukar ke projek baharu"

[ "$(q lpp_test -c "select string_agg(id || email, ',' order by id) from auth.users")" = "$(q lpp_pulih -c "select string_agg(id || email, ',' order by id) from auth.users")" ] || fail "ID/emel akaun berbeza"
[ "$(q lpp_pulih -c "select count(*) from auth.users where encrypted_password = '' and confirmation_token = '' and recovery_token = '' and aud = 'authenticated' and email_confirmed_at is not null")" = "$N" ] || fail "lajur akaun Supabase tidak diisi"
[ "$(q lpp_pulih -c "select count(*) from auth.identities")" = "$N" ] || fail "auth.identities tidak dicipta"
[ "$(q lpp_pulih -c "select string_agg(email, ',') from auth.users where banned_until > now() + interval '50 years'")" = "staf@contoh.my" ] || fail "akaun nyahaktif tidak disekat"
echo "  OK: akaun login dicipta dengan ID asal, tanpa kata laluan; akaun nyahaktif kekal disekat"

# Kaunter ID diteruskan: baris baharu tidak bertembung dengan ID yang dipulihkan.
psql_db lpp_pulih -c "insert into public.client_errors (message) values ('selepas pulih')"
[ "$(q lpp_pulih -c "select count(distinct id) = count(*) from public.client_errors")" = t ] || fail "ID bertembung selepas pulih"
# Trigger kembali aktif selepas pulih (session_replication_role hanya dalam transaksi).
before=$(q lpp_pulih -c "select count(*) from public.minyak_entries_audit")
psql_db lpp_pulih -c "update public.minyak_entries set notes = 'ubah' where entry_date = '2026-10-02'"
[ "$(q lpp_pulih -c "select count(*) from public.minyak_entries_audit")" -gt "$before" ] || fail "trigger audit tidak aktif selepas pulih"
echo "  OK: kaunter ID diteruskan, trigger audit aktif semula"
