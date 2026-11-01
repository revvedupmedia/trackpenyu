import { test, expect } from '@playwright/test'
import { boot, tables, ADMIN, KERANI, profiles, adminSession } from '../fixtures/helpers.mjs'

const accounts = [
  { id: ADMIN.id, email: ADMIN.email, mfa: true, last_sign_in_at: '2026-10-31T01:00:00Z' },
  { id: KERANI.id, email: KERANI.email },
  { id: 'u-staf', email: 'staf@contoh.my' },
  { id: 'u-baru', email: 'baru@contoh.my' },
]

test('Urus Staf: daftar akaun baharu tanpa UID/SQL', async ({ page }) => {
  await boot(page, { ...adminSession(), accounts })
  await page.goto('portal.html')
  await expect(page.locator('#staffMsg')).toContainText('1 akaun login belum didaftar')
  const row = page.locator('.staff-row', { hasText: 'baru@contoh.my' })
  await expect(row.locator('.tag-new')).toHaveText('Belum didaftar')
  await row.locator('.staff-sum').click()
  await page.fill('#sfName', 'Staf Baharu')
  await page.selectOption('#sfIsland', 'PSB')
  await page.selectOption('#sfRole', 'kerani')
  await page.click('#sfSave')
  await expect(page.locator('#staffMsg')).toContainText('Staf Baharu didaftar')
  const p = (await tables(page)).staff_profiles.find((x) => x.id === 'u-baru')
  expect(p).toMatchObject({ full_name: 'Staf Baharu', island: 'PSB', role: 'kerani' })
  await expect(page.locator('.staff-row', { hasText: 'Staf Baharu' }).locator('.tag-new')).toHaveCount(0)
})

test('Urus Staf: tukar peranan dengan pengesahan, nyahaktif & aktifkan semula', async ({ page }) => {
  await boot(page, { ...adminSession(), accounts })
  await page.goto('portal.html')
  const row = () => page.locator('.staff-row', { hasText: 'Kerani Ujian' })
  await row().locator('.staff-sum').click()
  await page.selectOption('#sfRole', 'admin')
  await page.click('#sfSave')       // dialog pengesahan diterima automatik dalam ujian
  await expect(row().locator('.tag-admin')).toHaveText('Admin')
  await row().locator('.staff-sum').click()
  await page.click('#sfActive')
  await expect(row().locator('.tag-off')).toHaveText('Nyahaktif')
  await row().locator('.staff-sum').click()
  await page.click('#sfActive')
  await expect(row().locator('.tag-off')).toHaveCount(0)
})

test('Urus Staf: admin tidak boleh ubah peranan/status sendiri; reset MFA', async ({ page }) => {
  await boot(page, { ...adminSession(), accounts })
  await page.goto('portal.html')
  const me = page.locator('.staff-row', { hasText: 'Admin Ujian' })
  await expect(me).toContainText('MFA ✓')
  await me.locator('.staff-sum').click()
  await expect(page.locator('#sfRole')).toBeDisabled()
  await expect(page.locator('#sfActive')).toHaveCount(0)
  await page.click('#sfMfa')
  await expect(page.locator('#staffMsg')).toContainText('MFA direset')
  await expect(me).toContainText('MFA ✗')
})

test('Urus Staf tidak dipaparkan kepada kerani', async ({ page }) => {
  await boot(page, { session: true, user: KERANI, accounts, tables: { staff_profiles: profiles } })
  await page.goto('portal.html')
  await expect(page.locator('#hello')).toContainText('Kerani')
  await expect(page.locator('#staffList')).toBeHidden()
})

test('staf dinyahaktif: sesi lama ditamatkan dengan mesej', async ({ page }) => {
  const inactive = profiles.map((p) => p.id === KERANI.id ? { ...p, active: false } : p)
  await boot(page, { session: true, user: KERANI, tables: { staff_profiles: inactive } })
  await page.goto('minyak/')
  await page.waitForURL(/sebab=nyahaktif/)
  await expect(page.locator('.msg-err:not([hidden])')).toContainText('dinyahaktifkan')
})

test('Urus Staf: pilihan dropdown boleh dibaca (kontras teks/latar)', async ({ page }) => {
  await boot(page, { ...adminSession(), accounts })
  await page.goto('portal.html')
  await page.locator('.staff-row', { hasText: 'baru@contoh.my' }).locator('.staff-sum').click()
  const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b }
  for (const sel of ['#sfIsland option', '#sfRole option']) {
    const { color, bg } = await page.locator(sel).first().evaluate((o) => ({ color: getComputedStyle(o).color, bg: getComputedStyle(o).backgroundColor }))
    // Latar mesti ditetapkan sendiri (bukan lutsinar): sistem seperti Windows
    // melukis senarai dengan latar terang dan teks tema gelap tenggelam.
    expect(bg, `${sel} tiada warna latar sendiri`).not.toBe('rgba(0, 0, 0, 0)')
    expect(Math.abs(lum(color) - lum(bg)), `${sel}: ${color} atas ${bg}`).toBeGreaterThan(120)
  }
})
