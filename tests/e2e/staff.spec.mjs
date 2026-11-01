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
