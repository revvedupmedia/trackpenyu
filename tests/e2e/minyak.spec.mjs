import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { boot, calls, tables, KERANI, ADMIN, adminSession, minyakYear } from '../fixtures/helpers.mjs'

const XLSX = createRequire(import.meta.url)('../../vendor/sheetjs-0.20.3/xlsx.full.min.js')
const today = new Date().toISOString().slice(0, 10)

async function openYear(page, seed) {
  await boot(page, adminSession({ minyak_entries: seed }))
  await page.goto('minyak/')
  await page.click('#viewToggle button[data-view=year]')
  await page.locator('#yearSection').waitFor()
}

test('paparan Tahun: jumlah, ringkasan bulan, rekod; tekan bulan buka bulan itu', async ({ page }) => {
  await openYear(page, minyakYear())
  await expect(page.locator('#gaugeTotal')).toHaveText('RM5,533.00')
  await expect(page.locator('#historyCount')).toHaveText('52 entri')
  await page.locator('.year-row').nth(6).click()   // Julai
  await expect(page.locator('#monthText')).toHaveText('Julai 2026')
  await expect(page.locator('#historyCount')).toHaveText('20 entri')
  expect(page.errors).toEqual([])
})

test('penapis Diesel: statistik & rekod ikut jenis, diingat selepas muat semula', async ({ page }) => {
  await openYear(page, minyakYear())
  await page.click('#fuelFilter button[data-f=diesel]')
  await expect(page.locator('#historyCount')).toHaveText('18 entri')
  await expect(page.locator('#gaugeTotal')).toHaveText('RM1,845.00')
  await expect(page.locator('#gaugeSub')).toHaveText('Diesel tahun ini')
  await page.reload()
  await expect(page.locator('#fuelFilter button.active')).toHaveAttribute('data-f', 'diesel')
})

test('Excel: Ringkasan + Rekod, jumlah betul, tarikh tidak anjak zon waktu', async ({ page }) => {
  await openYear(page, minyakYear())
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')])
  expect(dl.suggestedFilename()).toBe('Minyak_2026.xlsx')
  const wb = XLSX.read(await readFile(await dl.path()))
  expect(wb.SheetNames).toEqual(['Ringkasan', 'Rekod'])
  const ring = XLSX.utils.sheet_to_json(wb.Sheets.Ringkasan, { header: 1 })
  expect(ring.at(-1)).toEqual(['JUMLAH', 52, 1845, 3688, 5533, 1344])
  const rek = XLSX.utils.sheet_to_json(wb.Sheets.Rekod, { header: 1, raw: false })
  expect(rek[1][0]).toBe('01/05/2026')
})

test('Semakan Data: resit sama, mungkin pendua, odometer, jumlah luar biasa; padam & pulih', async ({ page }) => {
  const e = (id, date, fuel, amount, extra = {}) => ({ id, entry_date: date, fuel_type: fuel, amount, user_id: KERANI.id, user_email: KERANI.email, deleted_at: null, dup_ok: false, created_at: id, ...extra })
  const seed = [
    e('a1', '2026-08-21', 'ron95', 377, { user_id: ADMIN.id, receipt_path: 'p/same1.jpg' }),
    e('a2', '2026-08-21', 'ron95', 377, { user_id: ADMIN.id, receipt_path: 'p/same2.jpg' }),
    e('b1', '2026-08-13', 'ron95', 199, { receipt_hash: 'h1', receipt_path: 'p/x.jpg' }),
    e('b2', '2026-08-14', 'ron95', 199, { receipt_hash: 'h1', receipt_path: 'p/y.jpg' }),
    e('c1', '2026-08-02', 'diesel', 100, { odometer_start: 500, odometer_end: 400 }),
    e('d1', '2026-08-03', 'diesel', 5000, { receipt_path: 'p/o.jpg' }),
    ...['2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08'].map((d, i) => e('n' + i, d, 'diesel', 100, { receipt_path: 'p/n.jpg' })),
    e('z1', '2026-08-09', 'diesel', 90, { deleted_at: '2026-10-30T01:00:00Z' }),
  ]
  await boot(page, { ...adminSession({ minyak_entries: seed }), receiptFiles: { 'p/same1.jpg': '/tests/fixtures/receipt-same.txt', 'p/same2.jpg': '/tests/fixtures/receipt-same.txt' } })
  await page.goto('minyak/')
  await expect(page.locator('#checkBadge')).toHaveText('4')
  await page.click('#checkOpen')
  const titles = page.locator('#checkList .chk-title')
  await expect(titles).toContainText(['Resit sama digunakan untuk 2 entri', 'Odometer tidak sah (1)', 'Mungkin pendua: 2 entri RON95 RM377.00', 'Jumlah luar biasa Diesel (1)'])
  await page.click('text=🔍 Bandingkan resit')
  await expect(titles.filter({ hasText: 'Resit sama' })).toHaveCount(2)
  await expect(page.locator('#checkDeleted li')).toHaveCount(1)
  await page.locator('#checkList .imp-item').first().locator('[data-a=del]').first().click()
  await expect(page.locator('#checkDeleted li')).toHaveCount(2)
  await page.locator('#checkDeleted li').first().locator('button').click()
  await expect(page.locator('#checkDeleted li')).toHaveCount(1)
})

test('Tambah Entri: amaran pendua, resit sama disekat, tarikh masa depan ditolak', async ({ page }) => {
  const seed = [{ id: 'x', entry_date: '2026-08-07', fuel_type: 'diesel', amount: 100, user_email: KERANI.email, deleted_at: null, dup_ok: false, receipt_hash: null }]
  await boot(page, adminSession({ minyak_entries: seed }))
  await page.goto('minyak/')
  await page.click('#fabAdd')
  await page.fill('#entryDate', '2026-08-07'); await page.fill('#entryAmount', '100')
  await page.click('#submitBtn')
  await expect(page.locator('#formError')).toHaveClass(/is-warn/)
  await expect(page.locator('#submitBtn')).toHaveText('Simpan juga (entri berbeza)')
  await page.click('#submitBtn')
  await expect.poll(async () => (await tables(page)).minyak_entries.length).toBe(2)
  expect((await tables(page)).minyak_entries[1].dup_ok).toBe(true)

  // Resit sama: cap jari fail asal sudah wujud.
  const buf = Buffer.from('gambar-resit-ujian')
  const hash = (await import('node:crypto')).createHash('sha256').update(buf).digest('hex')
  await page.evaluate((h) => { const f = JSON.parse(localStorage.__fake); f.tables.minyak_entries[0].receipt_hash = h; localStorage.__fake = JSON.stringify(f); window.__fake = f }, hash)
  await page.click('#fabAdd')
  await page.fill('#entryDate', '2026-08-09'); await page.fill('#entryAmount', '55')
  await page.setInputFiles('#receiptFile', { name: 'r.png', mimeType: 'image/png', buffer: buf })
  await page.click('#submitBtn')
  await expect(page.locator('#formError')).toContainText('Resit ini sudah digunakan')
  await page.fill('#entryDate', '2099-01-01'); await page.click('#submitBtn')
  await expect(page.locator('#formError')).toHaveText('Tarikh tidak boleh pada masa depan.')
})

test('gambar resit besar dikecilkan sebelum upload; cap jari dari fail asal', async ({ page }) => {
  await boot(page, adminSession({ minyak_entries: [] }))
  await page.goto('minyak/')
  // Jana gambar 3000x4000 (saiz kamera telefon) dalam pelayar: kertas, teks dan
  // bintik rawak supaya JPEG tidak terlalu mudah dimampatkan.
  const big = await page.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 3000, height: 4000 }), g = c.getContext('2d')
    const grad = g.createLinearGradient(0, 0, 3000, 4000); grad.addColorStop(0, '#efe9df'); grad.addColorStop(1, '#d9d2c4')
    g.fillStyle = grad; g.fillRect(0, 0, 3000, 4000)
    for (let i = 0; i < 60000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * 3000, Math.random() * 4000, 3, 3) }
    g.fillStyle = '#111'; g.font = '60px monospace'
    for (let y = 600; y < 3600; y += 90) g.fillText('DIESEL 21.412 L x RM4.67   RM 100.00', 300, y)
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.97)); return Array.from(new Uint8Array(await b.arrayBuffer()))
  })
  const buf = Buffer.from(big)
  await page.click('#fabAdd')
  await page.fill('#entryDate', '2026-09-03'); await page.fill('#entryAmount', '100')
  await page.setInputFiles('#receiptFile', { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: buf })
  await expect(page.locator('#previewSize')).toContainText('→')
  await page.click('#submitBtn')
  await expect.poll(async () => (await calls(page)).find((c) => c[0] === 'upload')).toBeTruthy()
  const up = (await calls(page)).find((c) => c[0] === 'upload')
  expect(up[3]).toBeLessThan(buf.length / 4)          // sekurang-kurangnya 4× lebih kecil
  expect(up[4]).toBe('image/jpeg')
  const hash = (await import('node:crypto')).createHash('sha256').update(buf).digest('hex')
  expect((await tables(page)).minyak_entries[0].receipt_hash).toBe(hash)
})

// PDF Setel dijana daripada teks fixture (tanpa data peribadi) dengan Chromium,
// sama seperti resit e-mel Setel yang dicetak ke PDF.
async function setelPdf(browser, fixture, swap = {}) {
  let text = await readFile(new URL('../fixtures/' + fixture, import.meta.url), 'utf8')
  for (const [a, b] of Object.entries(swap)) text = text.replaceAll(a, b)
  const p = await browser.newPage()
  await p.setContent(`<body style="font:14px sans-serif">${text.split('\n').filter(Boolean).map((l) => `<div>${l.replace(/</g, '&lt;')}</div>`).join('')}<div>Copyright @ 2026 Setel</div></body>`)
  const pdf = await p.pdf({ format: 'A4' }); await p.close(); return pdf
}

test('Import Setel: baca PDF, kesan pendua & PDF rosak, sahkan dengan kiraan undur, simpan', async ({ page, browser }) => {
  const diesel = await setelPdf(browser, 'setel-diesel.txt')
  const ron = await setelPdf(browser, 'setel-ron95-budi.txt')
  const seed = [{ id: 'old', entry_date: '2026-09-03', fuel_type: 'diesel', amount: 100, user_email: KERANI.email, deleted_at: null, dup_ok: false }]
  await boot(page, adminSession({ minyak_entries: seed }))
  await page.goto('minyak/')
  await page.click('#importOpen')
  await page.setInputFiles('#importFiles', [
    { name: 'diesel.pdf', mimeType: 'application/pdf', buffer: diesel },
    { name: 'ron95.pdf', mimeType: 'application/pdf', buffer: ron },
    { name: 'ron95-salinan.pdf', mimeType: 'application/pdf', buffer: ron },
    { name: 'rosak.pdf', mimeType: 'application/pdf', buffer: Buffer.from('bukan pdf') },
  ])
  await expect(page.locator('#importProgress')).toContainText('Semak setiap resit', { timeout: 30_000 })
  const chips = page.locator('.imp-item .imp-chip')
  await expect(chips).toHaveText(['Mungkin pendua', 'Baharu', 'Pendua', 'Gagal baca'])
  await expect(page.locator('#importSave')).toHaveText('Semak & Simpan 1 entri')
  await page.locator('.imp-item').nth(1).locator('[data-k=claim]').check()
  await page.click('#importSave')
  await expect(page.locator('#importSave')).toHaveText(/Sahkan \(\d\)/)
  await expect(page.locator('#importSave')).toHaveText('✓ Sahkan & Simpan 1 entri', { timeout: 8000 })
  await page.click('#importSave')
  await expect(page.locator('#importSummary')).toContainText('1 entri disimpan')
  const saved = (await tables(page)).minyak_entries.find((r) => r.receipt_ref)
  expect(saved).toMatchObject({ entry_date: '2026-10-09', fuel_type: 'ron95', amount: 199, needs_claim: true, claim_status: 'pending', receipt_ref: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })
  expect(saved.notes).toContain('Subsidi BUDI RM268.00')
})
