// Kata laluan: wajib tukar pada log masuk pertama (kata laluan sementara dari
// admin), tukar sendiri dari app/Portal, dan butang admin di Urus Staf.
// Tanda tukar_kata_laluan dipadam oleh database (trigger) => diuji dalam
// tests/sql/kata-laluan.sql; di sini tiruan updateUser memadamnya.
import { test, expect } from '@playwright/test'
import { boot, tables, calls, profiles, adminSession } from '../fixtures/helpers.mjs'

const STAF = { id: 'u-staf', email: 'staf@contoh.my' }
const withFlag = (flag) => profiles.map((p) => p.id === STAF.id ? { ...p, tukar_kata_laluan: flag } : p)
const myFlag = async (page) => (await tables(page)).staff_profiles.find((p) => p.id === STAF.id).tukar_kata_laluan

test('Log masuk pertama: wajib tetapkan kata laluan sendiri sebelum masuk app', async ({ page }) => {
  await boot(page, { session: false, user: STAF, tables: { staff_profiles: withFlag(true) } })
  await page.goto('login.html?next=penyu%2F')
  await page.fill('#email', STAF.email)
  await page.fill('#pw', 'betul')
  await page.click('#btn')
  await expect(page.locator('h1')).toHaveText('Tetapkan Kata Laluan Anda')
  await expect(page.locator('#back, #p0')).toHaveCount(0)          // tiada jalan pintas
  await page.fill('#p1', 'betul123'); await page.fill('#p2', 'betul124')
  await page.click('#btn')
  await expect(page.locator('#err')).toContainText('tidak sama')
  await page.fill('#p1', 'pendek'); await page.fill('#p2', 'pendek')
  await page.click('#btn')                                          // kurang 8 aksara: tidak dihantar
  await expect(page.locator('h1')).toHaveText('Tetapkan Kata Laluan Anda')
  expect((await calls(page)).some((c) => c[0] === 'updateUser')).toBe(false)

  // Cuba lari terus ke app => kembali ke skrin tukar kata laluan.
  await page.goto('penyu/')
  await page.waitForURL(/login\.html\?next=penyu%2F&tukar=1/)
  await expect(page.locator('h1')).toHaveText('Tetapkan Kata Laluan Anda')
  await page.goto('portal.html')
  await page.waitForURL(/login\.html\?tukar=1/)

  await page.goto('login.html?next=penyu%2F&tukar=1')
  await page.fill('#p1', 'KataBaharu88'); await page.fill('#p2', 'KataBaharu88')
  await page.click('#btn')
  await page.waitForURL(/\/penyu\//)
  expect(await myFlag(page)).toBe(false)
  expect(page.errors).toEqual([])
})

test('Tukar sendiri dari Penyu: kata laluan semasa disemak dahulu', async ({ page }) => {
  await boot(page, { session: true, user: STAF, tables: { staff_profiles: withFlag(false) } })
  await page.addInitScript(() => sessionStorage.setItem('penyu-island', 'PTK'))
  await page.goto('penyu/#entries')
  await expect(page.locator('#navPw')).toBeVisible()               // staf tiada butang Portal
  await expect(page.locator('#navPortal')).toBeHidden()
  await page.click('#navPw')
  await page.waitForURL(/login\.html\?tukar=1&next=penyu%2F/)
  await expect(page.locator('h1')).toHaveText('Tukar Kata Laluan')
  await page.fill('#p0', 'salah'); await page.fill('#p1', 'KataBaharu88'); await page.fill('#p2', 'KataBaharu88')
  await page.click('#btn')
  await expect(page.locator('#err')).toHaveText('Kata laluan semasa salah.')
  expect((await calls(page)).some((c) => c[0] === 'updateUser')).toBe(false)
  await page.fill('#p0', 'betul')
  await page.click('#btn')
  await expect(page.locator('h1')).toHaveText('Kata Laluan Ditukar')
  await page.click('#go')
  await page.waitForURL(/\/penyu\//)
  expect(page.errors).toEqual([])
})

test('Portal: pautan tukar kata laluan; Urus Staf tanda & batal wajib tukar', async ({ page }) => {
  await boot(page, { ...adminSession(), accounts: [
    { id: 'u-admin', email: 'admin@contoh.my', mfa: true },
    { id: 'u-staf', email: 'staf@contoh.my' },
    { id: 'u-baru', email: 'baru@contoh.my' },
  ] })
  await page.goto('portal.html')
  await expect(page.locator('#changePw')).toHaveAttribute('href', 'login.html?tukar=1')
  // Daftar staf baharu => automatik wajib tukar kata laluan.
  await page.locator('.staff-row', { hasText: 'baru@contoh.my' }).locator('.staff-sum').click()
  await page.fill('#sfName', 'Staf Baharu')
  await page.click('#sfSave')
  await expect(page.locator('.staff-row', { hasText: 'Staf Baharu' })).toContainText('Belum tukar kata laluan')
  // Staf sedia ada: admin tanda wajib tukar, kemudian batal.
  const staf = page.locator('.staff-row', { hasText: 'staf@contoh.my' })
  await expect(staf).not.toContainText('Belum tukar kata laluan')
  await staf.locator('.staff-sum').click()
  await page.click('#sfPw')
  await expect(page.locator('#staffMsg')).toContainText('wajib tukar kata laluan')
  await expect(staf).toContainText('Belum tukar kata laluan')
  expect(await myFlag(page)).toBe(true)
  await staf.locator('.staff-sum').click()
  await expect(page.locator('#sfPw')).toHaveText('Batal wajib tukar kata laluan')
  await page.click('#sfPw')
  await expect(staf).not.toContainText('Belum tukar kata laluan')
  // Akaun sendiri: tiada butang wajib tukar.
  await page.locator('.staff-row', { hasText: 'admin@contoh.my' }).locator('.staff-sum').click()
  await expect(page.locator('#sfPw')).toHaveCount(0)
  expect(page.errors).toEqual([])
})
