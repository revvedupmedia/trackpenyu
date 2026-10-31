// Pembantu ujian pelayar. Supabase digantikan dengan fixtures/fake-supabase.mjs;
// semua kod app (shared/auth.js, login, portal, penyu, minyak) berjalan sebenar.
import { readFileSync } from 'node:fs'

const FAKE = readFileSync(new URL('./fake-supabase.mjs', import.meta.url), 'utf8')

export async function boot(page, state) {
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(e.message))
  page.on('dialog', (d) => d.accept())
  await page.route(/\.mp4$/, (r) => r.abort())
  await page.route('**/vendor/supabase-js-*/supabase-js.min.mjs', (r) =>
    r.fulfill({ contentType: 'application/javascript', body: FAKE }))
  await page.addInitScript((s) => {
    if (!localStorage.__fakeInit) { localStorage.__fakeInit = '1'; localStorage.__fake = JSON.stringify(s) }
  }, state)
}

export const calls = (page) => page.evaluate(() => window.__calls || [])
export const tables = (page) => page.evaluate(() => JSON.parse(localStorage.__fake).tables || {})

export const ADMIN = { id: 'u-admin', email: 'admin@contoh.my' }
export const KERANI = { id: 'u-kerani', email: 'kerani@contoh.my' }
export const profiles = [
  { id: ADMIN.id, full_name: 'Admin Ujian', island: 'PTB', role: 'admin' },
  { id: KERANI.id, full_name: 'Kerani Ujian', island: 'PTB', role: 'kerani' },
  { id: 'u-staf', full_name: 'Staf Ujian', island: 'PTK', role: 'staff' },
]

// Sesi admin yang sudah lepasi MFA.
export const adminSession = (tables = {}) => ({
  session: true, user: ADMIN, aal: 'aal2',
  factors: [{ id: 'f1', status: 'verified', factor_type: 'totp' }],
  tables: { staff_profiles: profiles, ...tables },
})

// 52 entri minyak Mei–Ogos 2026 (jumlah RM5,533; Diesel RM1,845; RON95 RM3,688).
export function minyakYear() {
  const rows = []
  const perMonth = { 5: 3, 6: 9, 7: 20, 8: 20 }
  for (const [m, n] of Object.entries(perMonth)) for (let i = 0; i < n; i++) rows.push({
    id: `m${m}-${i}`, entry_date: `2026-${String(m).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
    fuel_type: i % 3 ? 'ron95' : 'diesel', amount: 50 + i * 7, distance_km: i % 2 ? 12 : null,
    needs_claim: i % 4 === 0, claim_status: i % 4 === 0 ? 'pending' : 'not_applicable',
    user_email: KERANI.email, user_id: KERANI.id, receipt_path: i % 2 ? 'k/r.pdf' : null,
    created_at: `2026-${String(m).padStart(2, '0')}-01T00:00:${String(i).padStart(2, '0')}Z`, deleted_at: null, dup_ok: false,
  })
  return rows
}
