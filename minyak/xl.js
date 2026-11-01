// Gaya & alat Excel dikongsi oleh ⬇ Excel (app.js) dan 📋 Laporan Audit
// (audit.js). Rujukan rupa: docs/Contoh_Format_Audit_Minyak.xlsx.

let excelReady = null
// ExcelJS (warna, sempadan, penapis) hanya dimuat bila perlu, dari vendor/.
export function loadExcelJS() {
  return excelReady ||= new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = '../vendor/exceljs-4.4.0/exceljs.min.js'
    s.onload = () => res(window.ExcelJS)
    s.onerror = () => { excelReady = null; rej(new Error('Gagal muat pembina Excel.')) }
    document.head.appendChild(s)
  })
}

const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } }
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
export const XL = {
  font: { name: 'Arial', size: 10 }, bold: { name: 'Arial', size: 10, bold: true },
  title: { name: 'Arial', size: 14, bold: true }, h2: { name: 'Arial', size: 11, bold: true },
  note: { name: 'Arial', size: 9, italic: true, color: { argb: 'FF666666' } },
  head: fill('FF1F4E5A'), headFont: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
  zebra: fill('FFF5F8F9'), total: fill('FFE2EFDA'), ok: fill('FFE2EFDA'), warn: fill('FFFCE4D6'), input: fill('FFFFF2CC'),
  border: { top: thin, left: thin, bottom: thin, right: thin },
  RM: '#,##0.00;(#,##0.00);"-"', D: 'dd/mm/yyyy', DT: 'dd/mm/yyyy hh:mm', L: '#,##0.000',
}

export function xlHeader(ws, rowNo, labels) {
  const r = ws.getRow(rowNo); r.values = labels; r.height = 30
  r.eachCell((c) => { c.font = XL.headFont; c.fill = XL.head; c.border = XL.border; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true } })
}
export function xlTitle(ws, title, sub) {
  ws.getCell('A1').value = title; ws.getCell('A1').font = XL.title
  ws.getCell('A2').value = sub; ws.getCell('A2').font = XL.note
}
export function xlPage(ws, headRow) {
  ws.views = [{ state: 'frozen', ySplit: headRow || 0, showGridLines: false }]
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, ...(headRow ? { printTitlesRow: `${headRow}:${headRow}` } : {}) }
}
export function xlWidths(ws, widths) { widths.forEach((w, i) => { ws.getColumn(i + 1).width = w }) }
// Gaya satu baris jadual (sel 1..n): fon, sempadan, jalur.
export function xlRowStyle(row, n, k) {
  for (let c = 1; c <= n; c++) { const x = row.getCell(c); x.font = XL.font; x.border = XL.border; if (k % 2) x.fill = XL.zebra }
}

// Tarikh/masa sebagai nombor siri Excel (bukan objek Date) supaya tidak anjak
// mengikut zon waktu peranti. Masa ikut waktu tempatan peranti (MYT).
const EPOCH = Date.UTC(1899, 11, 30)
export const serialDate = (s) => { const [y, m, d] = s.split('-').map(Number); return (Date.UTC(y, m - 1, d) - EPOCH) / 864e5 }
export const serialDateTime = (iso) => {
  const t = new Date(iso)
  return (Date.UTC(t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()) - EPOCH) / 864e5
}

export async function downloadWorkbook(wb, filename) {
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}
