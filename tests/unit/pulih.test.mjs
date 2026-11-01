// Ujian alat/pulih-backup.mjs tanpa database: bacaan folder backup, SQL yang
// dijana, dan muat naik fail ke Storage (fetch tiruan). Pulih sebenar ke
// PostgreSQL diuji dalam tests/sql/pulih.sh.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readBackup, toSql, uploadFiles } from '../../alat/pulih-backup.mjs'

function folder(backup, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pulih-'))
  writeFileSync(join(dir, 'backup-2026-11-01.json'), JSON.stringify(backup))
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(dir, 'fail', ...p.split('/').slice(0, -1)), { recursive: true })
    writeFileSync(join(dir, 'fail', ...p.split('/')), body)
  }
  return dir
}
const meta = { format: 2, created_at: '2026-11-01T00:00:00Z', created_by: 'a@b.my', version: 'x', supabase_url: 'https://lama.supabase.co' }

test('folder backup dibaca; format lebih baharu ditolak', () => {
  assert.equal(readBackup(folder({ meta, data: {} })).meta.created_by, 'a@b.my')
  assert.throws(() => readBackup(folder({ meta: { ...meta, format: 99 }, data: {} })), /lebih baharu/)
  assert.throws(() => readBackup(mkdtempSync(join(tmpdir(), 'kosong-'))), /Extract ZIP/)
})

test('SQL: akaun dahulu, data dalam satu transaksi, teks sukar selamat', () => {
  const sql = toSql({ meta, accounts: [{ id: 'x', email: 'A@B.my' }],
    data: { daily_entries: [{ catatan: "it's $pulih$ 🐢" }], staff_profiles: [{ id: 'x' }] } }, { newUrl: 'https://baru.supabase.co/' })
  assert.match(sql, /^begin;$/m)
  assert.match(sql, /set local session_replication_role = replica/)
  assert.ok(sql.indexOf('pulih_akaun($') < sql.indexOf("pulih($pulih$staff_profiles"))
  assert.ok(sql.indexOf('staff_profiles') < sql.indexOf("$pulih$daily_entries"), 'ikut susunan BACKUP_TABLES')
  // Data mengandungi $pulih$: tag lain mesti dipilih supaya SQL tidak pecah.
  const line = sql.split('\n').find((l) => l.includes('daily_entries$'))
  const tag = line.match(/, (\$pulih\d+\$)/)[1]
  assert.ok(line.includes(`${tag}[{"catatan":"it's $pulih$ 🐢"}]${tag}`))
  assert.match(sql, /replace\(value, \$pulih\$https:\/\/lama\.supabase\.co\$pulih\$, \$pulih\$https:\/\/baru\.supabase\.co\$pulih\$\)/)
  assert.match(sql, /^commit;$/m)
})

test('muat naik fail ke laluan asal dengan kunci service_role', async () => {
  const dir = folder({ meta, data: {} }, { 'minyak-receipts/receipts/2026/a b.jpg': 'jpg', 'app-assets/minyak/bg_1.mp4': 'mp4' })
  const sent = []
  const fetchImpl = async (url, o) => { sent.push([url, o.headers, String(o.body)]); return { ok: !url.includes('bg_'), status: 400, text: async () => 'ditolak' } }
  const r = await uploadFiles(dir, { url: 'https://baru.supabase.co/', key: 'K', log: () => {}, fetchImpl })
  assert.equal(r.ok, 1)
  assert.equal(r.failed.length, 1)
  const jpg = sent.find(([u]) => u.includes('receipts'))
  assert.equal(jpg[0], 'https://baru.supabase.co/storage/v1/object/minyak-receipts/receipts/2026/a%20b.jpg')
  assert.equal(jpg[1].Authorization, 'Bearer K')
  assert.equal(jpg[1]['x-upsert'], 'true')
  assert.equal(jpg[1]['Content-Type'], 'image/jpeg')
  assert.equal(jpg[2], 'jpg')
  await assert.rejects(uploadFiles(dir, { url: '', key: '' }), /SUPABASE_SERVICE_KEY/)
})
