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
  await expect(page.locator('#islandBadge')).toHaveText('PTK')
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
