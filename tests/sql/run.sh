#!/usr/bin/env bash
# Bina database ujian dari snapshot + migration, uji RLS & audit, dan uji
# pusingan penuh export-schema.sql (eksport -> bina semula -> eksport = sama).
# Perlu PostgreSQL; sambungan melalui pemboleh ubah PG* biasa (PGHOST, PGUSER...).
set -euo pipefail
cd "$(dirname "$0")/../.."
SNAPSHOT=$(ls schema-snapshot-*.sql | sort | tail -1)
# Migration yang lebih baru daripada snapshot (ikut README), kecuali MFA langkah 2.
MIGRATIONS=(migration-fix-audit-dan-akses.sql migration-minyak-audit.sql migration-log-ralat.sql)
OUT=$(mktemp -d)
export PGOPTIONS="-c client_min_messages=warning"
psql_db() { psql -X -q -v ON_ERROR_STOP=1 -d "$@"; }
fresh() { psql -X -q -d postgres -c "drop database if exists $1" -c "create database $1"; psql_db "$1" -f tests/sql/supabase-stubs.sql; }

echo "== Bina dari $SNAPSHOT + ${#MIGRATIONS[@]} migration"
fresh lpp_test
psql_db lpp_test -f "$SNAPSHOT"
for m in "${MIGRATIONS[@]}"; do psql_db lpp_test -f "$m"; psql_db lpp_test -f "$m"; done   # dua kali: mesti selamat diulang

echo "== RLS & audit"
psql_db lpp_test -f tests/sql/rls.sql 2>&1 | grep -E 'OK:|GAGAL|ERROR' | sed 's/^.*NOTICE:  /  /'
psql_db lpp_test -f migration-mfa-admin-wajib.sql
psql_db lpp_test -f migration-mfa-admin-wajib.sql
psql_db lpp_test -f tests/sql/mfa.sql 2>&1 | grep -E 'OK:|GAGAL|ERROR' | sed 's/^.*NOTICE:  /  /'

echo "== Pusingan penuh export-schema.sql"
psql -X -At -v ON_ERROR_STOP=1 -d lpp_test -f export-schema.sql > "$OUT/a.sql"
fresh lpp_rebuild
psql_db lpp_rebuild -f "$OUT/a.sql"
psql -X -At -v ON_ERROR_STOP=1 -d lpp_rebuild -f export-schema.sql > "$OUT/b.sql"
diff <(grep -v '^-- Dijana' "$OUT/a.sql") <(grep -v '^-- Dijana' "$OUT/b.sql")
echo "  OK: eksport -> bina semula -> eksport sama ($(grep -c '^create table' "$OUT/a.sql") jadual, $(grep -c '^create policy' "$OUT/a.sql") polisi)"
echo "SEMUA UJIAN SQL LULUS"
