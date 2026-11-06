// Ujian penjana Excel format rasmi (penyu/eksport-rasmi.js) dengan data rekaan:
// struktur fail, dropdown Tahun & Pulau, sheet DATA tersembunyi, formula yang
// serasi Google Sheets, dan angka (termasuk Semua Pulau, Menetas Bulanan ikut
// RAM, Menetas Gabung dan rekod bulanan lama). Pengiraan sebenar formula juga
// disemak dengan Excel semasa pembangunan; di sini nilai cache (pilihan awal)
// dan bentuk formula disemak.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { buildRasmiWorkbook, computeRasmiData, patchCells } from '../../penyu/eksport-rasmi.js'

const require = createRequire(import.meta.url)
const JSZip = require('../../vendor/jszip-3.10.1/jszip.min.js')
const XLSX = require('../../vendor/sheetjs-0.20.3/xlsx.full.min.js')
const template = readFileSync(new URL('../../assets/template-PTB.xlsx', import.meta.url))

const raw = {
  daily: [
    { island: 'PTB', tarikh: '2026-01-05', ram: 'LPP', bilangan_penyu_bertag: 1, bilangan_penyu_takbertag: 2, jumlah_telur_diram_bertag: 100, jumlah_telur_diram_takbertag: 50,
      telur_menetas_bertag: 80, telur_menetas_takbertag: null, telur_buruk_bertag: null, telur_buruk_takbertag: null, jumlah_telur_dikeluarkan: 5, catatan: 'Nota <PTB> & "x"' },
    { island: 'PTK', tarikh: '2026-01-05', ram: 'SFC', bilangan_penyu_bertag: 0, bilangan_penyu_takbertag: 1, jumlah_telur_diram_bertag: 0, jumlah_telur_diram_takbertag: 70, catatan: 'Nota PTK' },
    { island: 'PTK', tarikh: '2026-02-10', ram: 'LPP', bilangan_penyu_bertag: 1, bilangan_penyu_takbertag: 0, jumlah_telur_diram_bertag: 90, jumlah_telur_diram_takbertag: 0 },
  ],
  nests: [{ island: 'PSB', tarikh_dijumpai: '2026-03-03', ram: 'SFC', bertag: true, jumlah_telur_diram: 110, telur_menetas: 100, telur_buruk: null }],
  hatch: [
    { island: 'PTK', year: 2026, month: 2, ram: 'ALL', menetas_bertag: 60, menetas_takbertag: 0 },
    { island: 'PTB', year: 2026, month: 1, ram: 'SFC', menetas_bertag: 7, menetas_takbertag: 3, buruk_bertag: 1, buruk_takbertag: 2 },
  ],
  legacy: [{ island: 'PTB', year: 1990, month: 6, bilangan_penyu: 10, jumlah_telur: 1200, telur_menetas: 900, telur_buruk: 300, telur_dikutip: 1250 }],
}
const years = [1990, 2025, 2026]

async function build(island = 'ALL', year = 2026) {
  const zip = await buildRasmiWorkbook(JSZip, template, raw, { years, island, year })
  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  return { zip, wb: XLSX.read(buf, { cellFormula: true, cellStyles: true }) }
}

test('kira data: Semua Pulau = jumlah tiga pulau; buruk, Menetas Bulanan, Gabung, rekod lama', () => {
  const { days, months } = computeRasmiData(raw)
  assert.deepEqual(days.get('PTB|2026|1|5|LPP'), { bp_b: 1, bp_t: 2, td_b: 100, td_t: 50, tm_b: 80, tm_t: 0, bu_b: 20, bu_t: 0 })   // buruk = diram − menetas; tiada menetas → 0
  assert.equal(days.get('ALL|2026|1|5|SFC').td_t, 70)
  assert.deepEqual(days.get('ALL|2026|1|5|DAY'), { dk: 5, cat: ['PTB: Nota <PTB> & "x"', 'PTK: Nota PTK'] })
  assert.equal(days.get('PSB|2026|3|3|SFC').bu_b, 10)                                  // sarang: 110 − 100
  assert.deepEqual(months.get('PTB|2026|1').adj, [0, 0, 7, 3, 0, 0, 1, 2])               // Menetas Bulanan SFC ganti harian
  assert.equal(months.get('PTK|2026|2').menetas, 60)                                     // Gabung: menetas sebulan
  assert.equal(months.get('PTK|2026|2').buruk, 30)                                       //   buruk = 90 − 60
  assert.deepEqual(['penyu', 'dikutip', 'diram', 'menetas', 'buruk'].map((f) => months.get('ALL|1990|6')[f]), [10, 1250, 1200, 900, 300])
})

test('struktur: JAN–DIS + JUMLAH + DATA tersembunyi; dropdown Tahun & Pulau di JAN', async () => {
  const { zip, wb } = await build()
  assert.deepEqual(wb.SheetNames, ['JAN', 'FEB', 'MAC', 'APRIL', 'MEI', 'JUN', 'JULAI', 'OGOS', 'SEPT', 'OKTO', 'NOV', 'DIS', 'JUMLAH', 'DATA'])
  assert.equal(wb.Workbook.Sheets.find((s) => s.name === 'DATA').Hidden, 1)
  assert.equal(wb.Sheets.JAN.V1.v, 2026)
  assert.equal(wb.Sheets.JAN.V2.v, 'Semua Pulau')
  const jan = await zip.file('xl/worksheets/sheet1.xml').async('string')
  assert.match(jan, /<dataValidation type="list"[^>]*sqref="V1"><formula1>DATA!\$AD\$2:\$AD\$4<\/formula1>/)
  assert.match(jan, /sqref="V2"><formula1>"Semua Pulau,Pulau Satang Besar,Pulau Talang-Talang Kechil,Pulau Talang-Talang Besar"<\/formula1>/)
  // senarai tahun: terkini dahulu
  assert.deepEqual(['AD2', 'AD3', 'AD4'].map((r) => wb.Sheets.DATA[r].v), [2026, 2025, 1990])
  // kawasan cetak tidak termasuk kotak pilihan (lajur U–V)
  assert.match(await zip.file('xl/workbook.xml').async('string'), /<definedName name="_xlnm.Print_Area" localSheetId="0">JAN!\$A\$1:\$T\$41<\/definedName>/)
})

test('formula: tajuk ikut pilihan; sel harian SUMIFS ke DATA; tiada fungsi yang Google Sheets/Excel lama tak sokong', async () => {
  const { zip, wb } = await build()
  const J = wb.Sheets.JAN
  assert.equal(J.A1.f, '"REKOD PENDARATAN PENYU DAN KUTIPAN TELUR DI "&UPPER(JAN!$V$2)')
  assert.equal(J.A1.v, 'REKOD PENDARATAN PENYU DAN KUTIPAN TELUR DI SEMUA PULAU')
  assert.equal(wb.Sheets.FEB.A2.f, '"BULAN FEBRUARI "&JAN!$V$1')
  assert.equal(wb.Sheets.JUMLAH.A1.v, 'JUMLAH KESELURUHAN SEMUA PULAU TAHUN 2026')
  assert.match(J.C12.f, /^SUMIFS\(DATA!\$B\$2:\$B\$\d+,DATA!\$A\$2:\$A\$\d+,DATA!\$AH\$2&"1\|"&\$A12&"\|LPP"\)$/)
  assert.equal(wb.Sheets.DATA.AH1.f, 'IFERROR(INDEX($AF$2:$AF$5,MATCH(JAN!$V$2,$AE$2:$AE$5,0)),"ALL")')
  let all = ''
  for (const f of Object.keys(zip.files).filter((f) => /^xl\/worksheets\/.*\.xml$/.test(f))) all += await zip.file(f).async('string')
  assert.doesNotMatch(all, /XLOOKUP|XMATCH|FILTER\(|UNIQUE\(|SORT\(|SEQUENCE\(|TEXTJOIN|LET\(|LAMBDA/)
})

test('nilai awal (Semua Pulau 2026): harian, catatan, baris JUMLAH bulan, sheet JUMLAH', async () => {
  const { wb } = await build()
  const J = wb.Sheets.JAN   // 5 Jan = baris 12
  assert.deepEqual(['C12', 'D12', 'F12', 'G12', 'H12', 'J12', 'K12', 'O12', 'S12'].map((r) => J[r].v), [1, 2, 1, 100, 50, 70, 80, 20, 5])
  assert.equal(J.T12.v, 'PTB: Nota <PTB> & "x"; PTK: Nota PTK')
  assert.equal(J.M39.v, 7)          // Menetas Bulanan SFC PTB
  assert.equal(J.Q39.v, 1)
  assert.equal(wb.Sheets.FEB.K41.f, 'SUM(K40,M40)+SUMIFS(DATA!$Z$2:$Z$7,DATA!$N$2:$N$7,DATA!$AH$2&"2")')
  assert.equal(wb.Sheets.JUMLAH.X10.v, 60)   // FEB: menetas gabung PTK (tanpa pecahan)
  assert.equal(wb.Sheets.JUMLAH.S10.v, 'PTK: Menetas gabung LPP+SFC: 60')
  assert.equal(wb.Sheets.JUMLAH.U7.v, 'Bilangan Penyu')
  assert.equal(wb.Sheets.JUMLAH.B9.f, 'SUM(JAN!C39)')        // formula template dikekalkan
})

test('pilihan awal satu pulau & tahun rekod lama: nilai ikut pulau itu sahaja', async () => {
  const ptk = (await build('PTK', 2026)).wb
  assert.equal(ptk.Sheets.JAN.V2.v, 'Pulau Talang-Talang Kechil')
  assert.equal(ptk.Sheets.JAN.C12.v, 0)
  assert.equal(ptk.Sheets.JAN.J12.v, 70)
  assert.equal(ptk.Sheets.JAN.T12.v, 'Nota PTK')
  const lama = (await build('PTB', 1990)).wb
  assert.equal(lama.Sheets.JUMLAH.A1.v, 'JUMLAH KESELURUHAN PULAU TALANG-TALANG BESAR TAHUN 1990')
  assert.deepEqual(['U14', 'V14', 'W14', 'X14', 'Y14'].map((r) => lama.Sheets.JUMLAH[r].v), [10, 1250, 1200, 900, 300])   // JUN 1990
  assert.equal(lama.Sheets.JUMLAH.U21.v, 10)
})

test('patchCells: sel tiada dalam template disisip ikut susunan lajur', () => {
  const xml = '<worksheet><sheetData><row r="1"><c r="A1"/><c r="C1"/></row><row r="3"><c r="A3"/></row></sheetData></worksheet>'
  const out = patchCells(xml, new Map([['B1', 5], ['C1', 'x & y'], ['B2', { f: 'A1+1', v: 6 }]]))
  assert.equal(out, '<worksheet><sheetData><row r="1"><c r="A1"/><c r="B1"><v>5</v></c><c r="C1" t="inlineStr"><is><t xml:space="preserve">x &amp; y</t></is></c></row>' +
    '<row r="2"><c r="B2"><f>A1+1</f><v>6</v></c></row><row r="3"><c r="A3"/></row></sheetData></worksheet>')
})
