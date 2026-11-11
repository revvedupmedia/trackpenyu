// Peranan Lihat Sahaja (pegawai kanan): Penyu sahaja, semua pulau, Mod
// Pembentangan; tiada borang entri, tiada Admin, tiada eksport, tiada Minyak.
import { test, expect } from '@playwright/test'
import { boot, tables, profiles, adminSession } from '../fixtures/helpers.mjs'

const LIHAT = { id: 'u-lihat', email: 'pegawai@contoh.my' }
const withLihat = [...profiles, { id: LIHAT.id, full_name: 'Pegawai Ujian', island: 'PTB', role: 'lihat' }]
const lihatSession = () => ({ session: true, user: LIHAT, tables: { staff_profiles: withLihat } })

test('Lihat Sahaja: portal terus ke Penyu, Dashboard & Mod Pembentangan tanpa muat turun', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await boot(page, lihatSession())
  await page.addInitScript(() => sessionStorage.setItem('penyu-island', 'PTK'))
  await page.goto('portal.html')
  await page.waitForURL(/\/penyu\//)
  await page.evaluate(() => { location.hash = 'entry' })        // borang entri => Dashboard
  await page.waitForURL(/#dashboard$/)
  await expect(page.locator('#presModeBtn')).toBeVisible()
  await expect(page.locator('#presentBtn, #pp_go')).toHaveCount(0)   // tiada PowerPoint
  await expect(page.locator('#navEntry')).toBeHidden()
  await expect(page.locator('#navAdmin')).toBeHidden()
  await expect(page.locator('#islandSwitcher')).toBeVisible()        // semua pulau
  await page.click('#presModeBtn')
  await expect(page.locator('#pClose')).toBeVisible()
  await page.evaluate(() => { location.hash = 'admin' })
  await page.reload()
  await expect(page.locator('#app')).toContainText('Akses admin sahaja.')
  await expect(page.locator('#ex_go')).toHaveCount(0)                // tiada eksport Excel
  expect(page.errors).toEqual([])
})

test('Lihat Sahaja: tiada akses Minyak', async ({ page }) => {
  await boot(page, lihatSession())
  await page.goto('minyak/')
  await page.waitForURL(/portal\.html\?denied=minyak/)
  await expect(page.locator('#notice')).toContainText('tiada akses ke Minyak')
})

test('Urus Staf: admin boleh beri peranan Lihat Sahaja', async ({ page }) => {
  await boot(page, { ...adminSession(), accounts: [
    { id: 'u-admin', email: 'admin@contoh.my', mfa: true },
    { id: 'u-baru', email: 'baru@contoh.my' },
  ] })
  await page.goto('portal.html')
  await page.locator('.staff-row', { hasText: 'baru@contoh.my' }).locator('.staff-sum').click()
  await expect(page.locator('#sfRole option[value=lihat]')).toHaveText('Lihat Sahaja')
  await page.fill('#sfName', 'Pegawai Kanan')
  await page.selectOption('#sfRole', 'lihat')
  await page.click('#sfSave')
  await expect(page.locator('#staffMsg')).toContainText('Pegawai Kanan didaftar')
  expect((await tables(page)).staff_profiles.find((x) => x.id === 'u-baru')).toMatchObject({ role: 'lihat' })
  await expect(page.locator('.staff-row', { hasText: 'Pegawai Kanan' })).toContainText('Lihat Sahaja')
})
