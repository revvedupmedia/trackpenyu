// Eksport Excel Penyu: julat tahun ikut data sebenar (tiada tahun hadapan),
// pilihan Dari/Hingga, Ringkasan berbilang tahun, dan format rasmi setahun.
import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { boot, adminSession } from '../fixtures/helpers.mjs'

const XLSX = createRequire(import.meta.url)('../../vendor/sheetjs-0.20.3/xlsx.full.min.js')
const NOW = new Date().getFullYear()
const month = (telur, penyu = 0, menetas = 0, buruk = 0) => ({ telur, penyu, menetas, buruk })
const empty = () => Array.from({ length: 12 }, () => month(0))
// Data PTK: rekod lama 1990 & 2005, harian tahun semasa. PSB tiada data.
const yearsPTK = { 1990: empty(), 2005: empty(), [NOW]: empty() }
yearsPTK[1990][5] = month(1200, 10, 900, 300)
yearsPTK[2005][6] = month(500, 4, 400, 100)
yearsPTK[NOW][0] = month(80, 1, 0, 0)

async function openAdmin(page) {
  await boot(page, {
    ...adminSession({
      daily_entries: [{ id: 'd1', island: 'PTK', tarikh: `${NOW}-01-05`, ram: 'LPP', bilangan_penyu_bertag: 1, bilangan_penyu_takbertag: 0,
        jumlah_telur_diram_bertag: 80, jumlah_telur_diram_takbertag: 0, created_by: 'u-admin' }],
      monthly_summaries: [
        { island: 'PTK', year: 1990, month: 6, bilangan_penyu: 10, jumlah_telur: 1200, telur_menetas: 900, telur_buruk: 300, telur_dikutip: 1250 },
        { island: 'PTK', year: NOW, month: 2, bilangan_penyu: 3, jumlah_telur: 210, telur_menetas: 150, telur_buruk: 60 },
      ],
    }),
    rpc: { get_multi_year_monthly: { PTK: yearsPTK } },
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => sessionStorage.setItem('penyu-island', 'PTK'))
  await page.goto('penyu/#admin')
  await expect(page.locator('#ex_hint')).toContainText('Akan dijana')
}
const options = (page, id) => page.locator(`#${id} option`).evaluateAll((os) => os.map((o) => Number(o.value)))
async function download(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ex_go')])
  return { name: dl.suggestedFilename(), wb: XLSX.read(await readFile(await dl.path()), { cellFormula: true }) }
}

test('Eksport: tahun ikut data sebenar (1990–tahun semasa), tiada tahun hadapan', async ({ page }) => {
  await openAdmin(page)
  const from = await options(page, 'ex_from')
  expect(from[0]).toBe(NOW)                     // terkini dahulu, lalai tahun semasa
  expect(from.at(-1)).toBe(1990)
  expect(from).toHaveLength(NOW - 1990 + 1)
  expect(from).not.toContain(NOW + 1)
  expect(await options(page, 'ex_to')).toEqual(from)
  await page.selectOption('#ex_island', 'PSB')
  await expect(page.locator('#ex_hint')).toContainText('Tiada data')
  await expect(page.locator('#ex_go')).toBeDisabled()
  expect(page.errors).toEqual([])
})

test('Eksport: Dari 1990 Hingga tahun semasa → Ringkasan Tahunan + Bulanan dengan formula', async ({ page }) => {
  await openAdmin(page)
  await page.selectOption('#ex_from', '1990')
  await expect(page.locator('#ex_hint')).toContainText(`Ringkasan PTK 1990–${NOW}`)
  const { name, wb } = await download(page)
  expect(name).toBe(`Penyu-PTK-1990-${NOW}-Ringkasan.xlsx`)
  expect(wb.SheetNames).toEqual(['Tahunan', 'Bulanan'])
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Tahunan, { header: 1 })
  expect(rows[0][0]).toBe(`RINGKASAN TAHUNAN DATA PENYU PULAU TALANG-TALANG KECHIL 1990 HINGGA ${NOW}`)
  const byYear = Object.fromEntries(rows.filter((r) => typeof r[0] === 'number').map((r) => [r[0], r]))
  expect(Object.keys(byYear)).toHaveLength(NOW - 1990 + 1)
  expect(byYear[1990].slice(1, 6)).toEqual([10, 1250, 1200, 900, 300])   // dikutip (rekod lama) ≠ diram
  expect(byYear[1991][7]).toBe('Tiada rekod')
  expect(byYear[NOW + 1]).toBeUndefined()
  const total = rows.findIndex((r) => r[0] === 'JUMLAH') + 1
  expect(wb.Sheets.Tahunan[`B${total}`].f).toBe(`SUM(B5:B${total - 1})`)
  expect(wb.Sheets.Tahunan['G5'].f).toContain('E5/(E5+F5)')
  expect(XLSX.utils.sheet_to_json(wb.Sheets.Bulanan, { header: 1 }).filter((r) => typeof r[0] === 'number')).toHaveLength((NOW - 1990 + 1) * 12)
  expect(page.errors).toEqual([])
})

test('Eksport: satu tahun (rekod lama, harian, Semua) → format rasmi dengan dropdown Tahun & Pulau dalam fail', async ({ page }) => {
  await openAdmin(page)
  await page.selectOption('#ex_from', '2005'); await page.selectOption('#ex_to', '2005')
  await expect(page.locator('#ex_hint')).toContainText('format rasmi PTK 2005')
  const lama = await download(page)
  expect(lama.name).toBe('Penyu-PTK-2005.xlsx')
  expect(lama.wb.SheetNames).toEqual(['JAN', 'FEB', 'MAC', 'APRIL', 'MEI', 'JUN', 'JULAI', 'OGOS', 'SEPT', 'OKTO', 'NOV', 'DIS', 'JUMLAH', 'DATA'])
  expect(lama.wb.Sheets.JAN.V1.v).toBe(2005)
  expect(lama.wb.Sheets.JAN.V2.v).toBe('Pulau Talang-Talang Kechil')
  expect(lama.wb.Sheets.JAN.A1.f).toContain('UPPER(JAN!$V$2)')

  await page.selectOption('#ex_from', String(NOW)); await page.selectOption('#ex_to', String(NOW))
  await expect(page.locator('#ex_hint')).toContainText(`format rasmi PTK ${NOW}`)
  const { name, wb } = await download(page)
  expect(name).toBe(`Penyu-PTK-${NOW}.xlsx`)
  expect(wb.Sheets.JAN.G12.v).toBe(80)                   // 5 Jan: rekod harian LPP
  const jumlah = wb.Sheets.JUMLAH
  expect(jumlah.S10.v).toContain('Rekod bulanan lama')   // FEB: rekod lama tidak hilang
  expect(jumlah.W10.v).toBe(210)                         //   telur diram, blok tanpa pecahan
  const tahun = XLSX.utils.sheet_to_json(wb.Sheets.DATA, { header: 1 }).slice(1).map((r) => r[29]).filter(Boolean)
  expect(tahun[0]).toBe(NOW)                             // dropdown tahun: terkini dahulu, hingga 1990
  expect(tahun.at(-1)).toBe(1990)

  await page.selectOption('#ex_island', 'ALL')
  await expect(page.locator('#ex_hint')).toContainText(`format rasmi semua pulau ${NOW}`)
  const all = await download(page)
  expect(all.name).toBe(`Penyu-ALL-${NOW}.xlsx`)
  expect(all.wb.Sheets.JAN.V2.v).toBe('Semua Pulau')
  expect(all.wb.Sheets.JAN.A1.v).toBe('REKOD PENDARATAN PENYU DAN KUTIPAN TELUR DI SEMUA PULAU')

  await page.selectOption('#ex_from', String(NOW)); await page.selectOption('#ex_to', '1990')
  await expect(page.locator('#ex_hint')).toContainText('mesti sebelum')
  await expect(page.locator('#ex_go')).toBeDisabled()
  expect(page.errors).toEqual([])
})
