import { test, expect } from '@playwright/test'
import { boot, profiles, adminSession } from '../fixtures/helpers.mjs'

test('Penyu: setiap skrin dimuat tanpa ralat JavaScript', async ({ page }) => {
  await boot(page, adminSession())
  await page.addInitScript(() => sessionStorage.setItem('penyu-island', 'PTB'))
  await page.goto('penyu/#entry')
  for (const r of ['entry', 'entries', 'dashboard', 'admin', 'island']) {
    await page.evaluate((r) => { location.hash = r }, r)
    await page.waitForTimeout(1200)
    await expect(page.locator('#app')).not.toBeEmpty()
  }
  await page.evaluate(() => { location.hash = 'admin' })
  await expect(page.locator('#app')).toContainText('Penyu Tracker · versi')
  expect(page.errors).toEqual([])
})

test('Penyu: library dari vendor/ dimuat dan berfungsi', async ({ page }) => {
  await boot(page, adminSession())
  await page.addInitScript(() => sessionStorage.setItem('penyu-island', 'PTB'))
  await page.goto('penyu/#entry')
  await page.waitForLoadState('load')
  const r = await page.evaluate(async () => {
    const tpl = await (await fetch('../assets/template-PTB.xlsx')).arrayBuffer()
    const pptx = new PptxGenJS(); pptx.addSlide().addText('Ujian', { x: 1, y: 1 })
    return { chart: Chart.version, xlsx: XLSX.version, sheets: XLSX.read(tpl, { type: 'array' }).SheetNames.length, pptx: (await pptx.write({ outputType: 'uint8array' })).length > 1000 }
  })
  expect(r).toEqual({ chart: '4.4.4', xlsx: '0.20.3', sheets: 13, pptx: true })
})

test('Penyu: staf terus ke pulau sendiri, tiada butang Portal (satu app sahaja)', async ({ page }) => {
  await boot(page, { session: true, user: { id: 'u-staf', email: 'staf@contoh.my' }, tables: { staff_profiles: profiles } })
  await page.goto('portal.html')
  await page.waitForURL(/\/penyu\//)
  await expect(page.locator('#app')).toContainText('PTK')
  await expect(page.locator('.island-switch')).toHaveCount(0)   // staf tidak boleh tukar pulau
  await expect(page.locator('#navPortal')).toBeHidden()
})

test('Penyu: CSS statik mengandungi setiap kelas Tailwind yang digunakan di skrin', async ({ page }) => {
  await boot(page, adminSession())
  await page.addInitScript(() => sessionStorage.setItem('penyu-island', 'PTB'))
  await page.goto('penyu/#dashboard')
  await page.waitForTimeout(1500)
  const missing = await page.evaluate(() => {
    const rules = new Set()
    for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.selectorText) r.selectorText.split(',').forEach((s) => rules.add(s.trim())) } catch {} }
    const tw = /^(-?[a-z]+(-[a-z0-9.\/\[\]%]+)*|[a-z]+:[\w-]+)$/
    const used = new Set([...document.querySelectorAll('[class]')].flatMap((e) => [...e.classList]))
    return [...used].filter((c) => /^(p|m|px|py|pt|pb|mt|mb|mx|my|text|bg|flex|grid|gap|w|h|max-w|min-h|rounded|border|opacity|items|justify|font|tabular|space|hidden|fixed|inset|z|overflow|col|row|sticky|top|left|right|bottom)/.test(c) && tw.test(c))
      .filter((c) => ![...rules].some((s) => s === '.' + CSS.escape(c) || s.startsWith('.' + CSS.escape(c) + ':') || s.startsWith('.' + CSS.escape(c) + ' ')))
  })
  // Cangkuk JavaScript tanpa gaya CSS (gaya ditulis terus pada elemen).
  const JS_HOOKS = ['month-hp-ghost', 'mhp-count']
  expect(missing.filter((c) => !JS_HOOKS.includes(c))).toEqual([])
})

test('Penyu: admin tukar pulau dari tajuk skrin dan kembali ke skrin yang sama', async ({ page }) => {
  // Kad pulau terapung tanpa henti; Playwright hanya klik sasaran yang tidak
  // bergerak. Ujian ini tentang logik tukar pulau, jadi matikan animasi.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await boot(page, adminSession())
  await page.addInitScript(() => { if (!sessionStorage.getItem('penyu-island')) sessionStorage.setItem('penyu-island', 'PTB') })
  await page.goto('penyu/#entries')
  await expect(page.locator('.island-switch')).toContainText('PTB')
  await page.click('.island-switch')
  await page.waitForURL(/#island$/)
  await page.click('[data-code=PSB]')
  await page.waitForURL(/#entries$/)
  await expect(page.locator('.island-switch')).toContainText('PSB')
})

test('Mod Pembentangan kekal gelap & boleh dibaca dalam mod cerah', async ({ page }) => {
  await boot(page, adminSession())
  await page.addInitScript(() => { sessionStorage.setItem('penyu-island', 'PTB'); localStorage.setItem('penyu-theme', 'light') })
  await page.goto('penyu/#dashboard')
  await page.click('#presModeBtn')
  const h = page.locator('.pres h1, .pres h2').first()
  await expect(h).toBeVisible()
  // Teks cerah atas latar gelap: warna teks mesti terang (bukan warna teks mod cerah #0A1F2B).
  const rgb = await h.evaluate((e) => getComputedStyle(e).color)
  const [r, g, b] = rgb.match(/\d+/g).map(Number)
  expect(r + g + b).toBeGreaterThan(600)
})

test('Pilih pulau: kad bergambar, pulau semasa ditanda, jumlah telur dipaparkan', async ({ page }) => {
  await boot(page, adminSession())
  await page.addInitScript(() => sessionStorage.setItem('penyu-island', 'PTK'))
  await page.goto('penyu/#island')
  const cards = page.locator('.isl-card')
  await expect(cards).toHaveCount(3)
  await expect(page.locator('.isl-card.current')).toHaveAttribute('data-code', 'PTK')
  for (const i of [0, 1, 2]) await expect.poll(() => cards.nth(i).locator('img').evaluate((im) => im.complete && im.naturalWidth)).toBeGreaterThan(0)
  await expect(page.locator('.isl-eggs').first()).toContainText('telur sejak 1990')
  expect(page.errors).toEqual([])
})
