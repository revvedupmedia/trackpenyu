// Ujian pembaca resit Setel (minyak/setel.js) dengan teks resit sebenar yang
// dinamakan semula (tiada nama/emel/nombor invois sebenar).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// pdf.js memaparkan amaran kanvas dalam Node; tidak berkaitan dengan bacaan teks.
const warn = console.warn; console.warn = () => {}
const { parseSetelText } = await import('../../minyak/setel.js')
console.warn = warn

const fx = (n) => readFileSync(new URL('../fixtures/' + n, import.meta.url), 'utf8')

test('Diesel: tarikh, jenis, jumlah, liter, stesen', () => {
  const r = parseSetelText(fx('setel-diesel.txt'))
  assert.equal(r.ok, true)
  assert.deepEqual(r.warnings, [])
  assert.equal(r.data.ref, '11111111-2222-4333-8444-555555555555')
  assert.equal(r.data.date, '2026-09-03')
  assert.equal(r.data.fuel, 'diesel')
  assert.equal(r.data.amount, 100)
  assert.equal(r.data.liters, '21.412')
  assert.equal(r.data.station, 'PETRONAS Kuching Utara')
  assert.equal(r.data.notes, '21.412 L · PETRONAS Kuching Utara')
})

test('RON95 dengan subsidi BUDI: jumlah = dibayar, subsidi dalam nota', () => {
  const r = parseSetelText(fx('setel-ron95-budi.txt'))
  assert.equal(r.ok, true)
  assert.deepEqual(r.warnings, [])
  assert.equal(r.data.fuel, 'ron95')
  assert.equal(r.data.amount, 199)
  assert.equal(r.data.gross, 467)
  assert.equal(r.data.subsidy, 268)
  assert.equal(r.data.notes, '100.000 L · PETRONAS Lundu · Subsidi BUDI RM268.00')
})

test('bukan resit Setel ditolak', () => {
  assert.deepEqual(parseSetelText('Invoice\nTOTAL 10.00'), { ok: false, error: 'Bukan resit Setel.' })
})

test('tiada nombor invois ditolak (tiada data separa masuk)', () => {
  const r = parseSetelText(fx('setel-diesel.txt').replace(/[0-9a-f-]{36}/, 'xxx'))
  assert.equal(r.ok, false)
})

test('jenis minyak tidak dikenali: amaran, jenis kosong untuk dipilih pengguna', () => {
  const r = parseSetelText(fx('setel-diesel.txt').replace('PETRONAS DIESEL with', 'PETRONAS PRIMAX 97 with'))
  assert.equal(r.ok, true)
  assert.equal(r.data.fuel, null)
  assert.match(r.warnings.join(' '), /tidak dikenali/)
})

test('jumlah atas dan bawah berbeza: amaran', () => {
  const r = parseSetelText(fx('setel-diesel.txt').replace('Total RM 100.00', 'Total RM 90.00'))
  assert.match(r.warnings.join(' '), /tak sama/)
})
