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
  await expect(page.locator('img[alt^="Kod QR"]')).toBeVisible()
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
  await boot(page, adminSession({ daily_entries: daily }))
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
  await expect(page.locator('#backupStatus')).toContainText('Backup terakhir hari ini')
  expect(page.errors).toEqual([])
})
