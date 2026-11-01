import { test, expect } from '@playwright/test'
import JSZip from '../../vendor/jszip-3.10.1/jszip.min.js'
import { boot, calls, tables, ADMIN, KERANI, profiles, adminSession } from '../fixtures/helpers.mjs'

test('landing: satu butang Log Masuk, tiada senarai app', async ({ page }) => {
  await boot(page, { session: false })
  await page.goto('/')
  await expect(page.locator('h1')).toHaveText('Portal LPP')
  await expect(page.locator('#cta')).toHaveAttribute('href', 'login.html')
  await expect(page.locator('.app-card')).toHaveCount(0)
  expect(page.errors).toEqual([])
})

for (const path of ['portal.html', 'penyu/', 'minyak/']) {
  test(`belum log masuk: ${path} -> login`, async ({ page }) => {
    await boot(page, { session: false })
    await page.goto(path)
    await page.waitForURL(/login\.html/)
    if (path !== 'portal.html') expect(page.url()).toContain('next=' + encodeURIComponent(path))
  })
}

test('kata laluan salah dipaparkan dalam Bahasa Melayu', async ({ page }) => {
  await boot(page, { session: false, tables: { staff_profiles: profiles } })
  await page.goto('login.html')
  await page.fill('#email', 'x@y.my'); await page.fill('#pw', 'salah'); await page.click('#btn')
  await expect(page.locator('#err')).toHaveText('Emel atau kata laluan salah.')
})

test('MFA admin kali pertama: daftar QR, kod salah ditolak, kod betul ke portal', async ({ page }) => {
  await boot(page, { session: false, user: ADMIN, factors: [{ id: 'lama', status: 'unverified', factor_type: 'totp' }], tables: { staff_profiles: profiles } })
  await page.goto('login.html')
  await page.fill('#email', ADMIN.email); await page.fill('#pw', 'betul'); await page.click('#btn')
  await expect(page.locator('h1')).toHaveText('Sediakan Pengesahan Admin')
  // Kod QR dimuat sebagai gambar sah (bukan pecah) dan tiada teks HTML terkeluar.
  await expect.poll(() => page.locator('#qr').evaluate((i) => i.complete && i.naturalWidth)).toBeGreaterThan(0)
  await expect(page.locator('#view')).not.toContainText('alt=')
  expect((await calls(page)).filter((c) => c[0] === 'unenroll')).toEqual([['unenroll', 'lama']])
  await page.fill('#code', '111111'); await page.click('#btn')
  await expect(page.locator('#err')).toContainText('Kod salah')
  await page.fill('#code', '123456'); await page.click('#btn')
  await page.waitForURL(/portal\.html/)
  await expect(page.locator('#adminZone')).toBeVisible()
})

test('MFA admin: sesi aal1 dihantar ke langkah kod, kemudian kembali ke app', async ({ page }) => {
  await boot(page, { ...adminSession(), aal: 'aal1' })
  await page.goto('minyak/')
  await page.waitForURL(/login\.html\?next=minyak%2F&mfa=1/)
  await expect(page.locator('h1')).toHaveText('Pengesahan Admin')
  await page.fill('#code', '123456'); await page.click('#btn')
  await page.waitForURL(/\/minyak\/$/)
})

test('kerani: tiada MFA, tiada Pentadbiran; log keluar automatik selepas 30 minit', async ({ page }) => {
  await boot(page, { session: true, user: KERANI, tables: { staff_profiles: profiles } })
  await page.clock.install()
  await page.goto('portal.html')
  await expect(page.locator('#hello')).toContainText('Kerani Ujian')
  await expect(page.locator('#adminZone')).toBeHidden()
  await page.clock.runFor(29 * 60e3 + 5e3)
  await expect(page.locator('[role=alert]')).toContainText('dilog keluar dalam 1 minit')
  await page.mouse.click(5, 5)
  await page.clock.runFor(16e3)
  await expect(page.locator('[role=alert]')).toHaveCount(0)
  await page.clock.runFor(31 * 60e3)
  await page.waitForURL(/sebab=tidak-aktif/)
  await page.clock.resume()
  await expect(page.locator('.msg-ok')).toContainText('tiada aktiviti')
})

test('ralat JavaScript dihantar ke log ralat', async ({ page }) => {
  await boot(page, { session: true, user: KERANI, tables: { staff_profiles: profiles } })
  await page.goto('portal.html')
  await expect(page.locator('#hello')).toContainText('Kerani')
  await page.evaluate(() => setTimeout(() => { throw new Error('Ralat ujian') }, 0))
  await expect.poll(async () => (await tables(page)).client_errors?.[0]?.message).toContain('Ralat ujian')
})

test('backup: ZIP mengandungi Excel + JSON semua jadual dan tarikh direkod', async ({ page }) => {
  const daily = Array.from({ length: 2300 }, (_, i) => ({ id: 'd' + i, tarikh: '2026-01-01', catatan: i === 7 ? { a: 1 } : null }))
  await boot(page, { ...adminSession({ daily_entries: daily, staff_audit: [{ id: 1, action: 'daftar' }] }),
    accounts: [{ id: 'u-admin', email: 'admin@contoh.my', mfa: true }, { id: 'u-kerani', email: 'kerani@contoh.my' }] })
  await page.goto('portal.html')
  await expect(page.locator('#backupStatus')).toContainText('Belum pernah backup')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backupBtn')])
  expect(dl.suggestedFilename()).toMatch(/^Backup_PortalLPP_\d{4}-\d{2}-\d{2}\.zip$/)
  const zip = await JSZip.loadAsync(await (await import('node:fs/promises')).readFile(await dl.path()))
  const names = Object.keys(zip.files)
  expect(names.some((n) => n.endsWith('.xlsx'))).toBe(true)
  const json = JSON.parse(await zip.file(names.find((n) => n.endsWith('.json'))).async('string'))
  expect(json.data.daily_entries).toHaveLength(2300)   // lebih 1000 baris: semua halaman diambil
  expect(json.data.staff_profiles).toHaveLength(3)
  expect(Object.keys(json.data)).toContain('staff_audit')
  // Akaun login dengan ID asal (untuk pulih), tiada kata laluan.
  expect(json.accounts.map((a) => a.email)).toEqual(['admin@contoh.my', 'kerani@contoh.my'])
  expect(json.accounts[0]).toMatchObject({ id: 'u-admin', role: 'admin', active: true })
  expect(JSON.stringify(json.accounts)).not.toMatch(/password/i)
  expect(json.meta).toMatchObject({ format: 2, supabase_url: expect.stringContaining('supabase.co'), files: null })
  expect(names.some((n) => n.startsWith('fail/'))).toBe(false)   // fail tidak termasuk jika tidak ditanda
  await expect(page.locator('#backupStatus')).toContainText('Backup terakhir hari ini')
  expect(page.errors).toEqual([])
})

test('backup "Termasuk fail": resit & video latar masuk ZIP pada laluan asal', async ({ page }) => {
  await boot(page, adminSession({
    minyak_entries: [
      { id: 'm1', entry_date: '2026-10-01', fuel_type: 'diesel', amount: 10, receipt_path: 'receipts/2026/a.jpg', deleted_at: null },
      { id: 'm2', entry_date: '2026-10-02', fuel_type: 'ron95', amount: 20, receipt_path: 'receipts/2026/b.jpg', deleted_at: '2026-10-03' },
      { id: 'm3', entry_date: '2026-10-04', fuel_type: 'ron95', amount: 30, receipt_path: 'receipts/hilang.jpg', deleted_at: null },
      { id: 'm4', entry_date: '2026-10-05', fuel_type: 'ron95', amount: 40, receipt_path: null, deleted_at: null },
    ],
    minyak_settings: [{ key: 'bg_video_url', value: 'http://127.0.0.1:8765/storage/v1/object/public/app-assets/minyak/bg%201.mp4' }],
  }))
  await page.route('**/hilang-404', (r) => r.fulfill({ status: 404, body: '' }))
  await page.route('**/storage/v1/object/public/**', (r) => r.fulfill({ contentType: 'video/mp4', body: 'video' }))
  await page.goto('portal.html')
  await page.evaluate(() => {
    const f = JSON.parse(localStorage.__fake)
    f.receiptFiles = { 'receipts/2026/a.jpg': '/tests/fixtures/receipt-a.txt', 'receipts/2026/b.jpg': '/tests/fixtures/receipt-same.txt', 'receipts/hilang.jpg': '/hilang-404' }
    localStorage.__fake = JSON.stringify(f); window.__fake = f
  })
  await page.check('#backupFiles')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backupBtn')])
  const zip = await JSZip.loadAsync(await (await import('node:fs/promises')).readFile(await dl.path()))
  const fs = await import('node:fs/promises')
  expect(await zip.file('fail/minyak-receipts/receipts/2026/a.jpg').async('string')).toBe(await fs.readFile(new URL('../fixtures/receipt-a.txt', import.meta.url), 'utf8'))
  expect(zip.file('fail/minyak-receipts/receipts/2026/b.jpg')).toBeTruthy()   // entri dipadam (soft) pun disimpan
  expect(zip.file('fail/app-assets/minyak/bg 1.mp4')).toBeTruthy()
  const json = JSON.parse(await zip.file(Object.keys(zip.files).find((n) => n.endsWith('.json'))).async('string'))
  expect(json.meta.files.included).toBe(3)
  expect(json.meta.files.failed).toEqual([expect.objectContaining({ path: 'receipts/hilang.jpg', error: 'HTTP 404' })])
  await expect(page.locator('#backupProgress')).toContainText('3 fail')
  await expect(page.locator('#backupProgress')).toContainText('1 fail gagal')
  expect(page.errors).toEqual([])
})
