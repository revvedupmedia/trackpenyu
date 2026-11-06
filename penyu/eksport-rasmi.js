// Eksport Excel format rasmi (JAN–DIS + JUMLAH) dengan pilihan TAHUN & PULAU
// di dalam fail itu sendiri (sheet JAN, sel V1 & V2). Semua rekod (semua
// pulau, semua tahun) disimpan dalam sheet tersembunyi DATA; sel sheet bulan
// ialah formula SUMIFS / INDEX-MATCH yang membaca DATA ikut pilihan, jadi
// tukar dropdown = seluruh fail bertukar. Hanya fungsi yang disokong Excel,
// LibreOffice dan Google Sheets digunakan (tiada XLOOKUP/FILTER/TEXTJOIN).
//
// Fail ditulis TERUS ke dalam XML template (bukan melalui library hamparan)
// supaya warna, border, lebar lajur & formula JUMLAH template kekal.
//
// Angka sama dengan Dashboard (fungsi database penyu_month_stats):
// - telur buruk setiap entri = angka direkod, atau diram − menetas jika menetas
//   direkod, atau 0;
// - rekod Menetas Bulanan ikut RAM menggantikan jumlah menetas/buruk harian
//   (baris 39);
// - rekod Menetas Gabung LPP+SFC & rekod bulanan lama (1990–2025, tiada pecahan
//   RAM/tag) dicampur ke baris JUMLAH (41) setiap bulan dan blok "TANPA
//   PECAHAN" di sheet JUMLAH (lajur U–Y).

export const PULAU = [
  { code: 'ALL', name: 'Semua Pulau' },
  { code: 'PSB', name: 'Pulau Satang Besar' },
  { code: 'PTK', name: 'Pulau Talang-Talang Kechil' },
  { code: 'PTB', name: 'Pulau Talang-Talang Besar' },
]
export const MONTH_SHEETS = ['JAN', 'FEB', 'MAC', 'APRIL', 'MEI', 'JUN', 'JULAI', 'OGOS', 'SEPT', 'OKTO', 'NOV', 'DIS']
const ISL_CODES = ['PTB', 'PTK', 'PSB']

// Sel pilihan (sheet JAN) dan sel bantuan (sheet DATA)
const SEL_TAHUN = 'JAN!$V$1'
const SEL_PULAU = 'JAN!$V$2'
const PREFIX = 'DATA!$AH$2'   // "<kod pulau>|<tahun>|"

// Sheet DATA: jadual harian (A–K) & jadual bulanan (N–AB) bersebelahan
const D = { key: 'A', bp_b: 'B', bp_t: 'C', td_b: 'D', td_t: 'E', tm_b: 'F', tm_t: 'G', bu_b: 'H', bu_t: 'I', dk: 'J', cat: 'K' }
const ADJ_COLS = ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R']          // lajur sheet bulan, baris 39
const M = { key: 'N', adj: ['O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V'], penyu: 'W', dikutip: 'X', diram: 'Y', menetas: 'Z', buruk: 'AA', note: 'AB' }
const NP_FIELDS = ['penyu', 'dikutip', 'diram', 'menetas', 'buruk']

// Lajur sheet bulan → [RAM, medan DATA]
const DAY_COLS = {
  C: ['LPP', 'bp_b'], D: ['LPP', 'bp_t'], E: ['SFC', 'bp_b'], F: ['SFC', 'bp_t'],
  G: ['LPP', 'td_b'], H: ['LPP', 'td_t'], I: ['SFC', 'td_b'], J: ['SFC', 'td_t'],
  K: ['LPP', 'tm_b'], L: ['LPP', 'tm_t'], M: ['SFC', 'tm_b'], N: ['SFC', 'tm_t'],
  O: ['LPP', 'bu_b'], P: ['LPP', 'bu_t'], Q: ['SFC', 'bu_b'], R: ['SFC', 'bu_t'],
}
const HIDE_ZERO = new Set(['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'S'])  // macam borang asal: 0 = sel kosong

// ---------------------------------------------------------------------------
// 1. Kira data (tanpa DOM / Supabase): rekod mentah → jadual DATA
// ---------------------------------------------------------------------------
const n0 = (v) => Number(v) || 0
const burukOf = (td, tm, tb) => tb != null ? n0(tb) : tm != null ? Math.max(0, n0(td) - n0(tm)) : 0
const ymd = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return { y, m, d } }
const blankDay = () => ({ bp_b: 0, bp_t: 0, td_b: 0, td_t: 0, tm_b: 0, tm_t: 0, bu_b: 0, bu_t: 0 })
const blankMonth = () => ({ adj: [0, 0, 0, 0, 0, 0, 0, 0], penyu: 0, dikutip: 0, diram: 0, menetas: 0, buruk: 0, notes: [] })

export function computeRasmiData({ daily = [], nests = [], hatch = [], legacy = [] }) {
  const days = new Map()     // "PTB|2026|1|5|LPP" → angka;  "PTB|2026|1|5|DAY" → { dk, cat[] }
  const months = new Map()   // "PTB|2026|1" → pelarasan & rekod tanpa pecahan
  const day = (k) => { if (!days.has(k)) days.set(k, k.endsWith('|DAY') ? { dk: 0, cat: [] } : blankDay()); return days.get(k) }
  const month = (k) => { if (!months.has(k)) months.set(k, blankMonth()); return months.get(k) }
  const sums = new Map()     // jumlah harian sebulan setiap pulau+RAM (untuk pelarasan)
  const sum = (k) => { if (!sums.has(k)) sums.set(k, blankDay()); return sums.get(k) }
  const ramOf = (r) => (r === 'SFC' ? 'SFC' : 'LPP')

  const add = (isl, date, ram, v, dk, cat) => {
    const { y, m, d } = ymd(date)
    if (!y || !m || !d) return
    const b = day(`${isl}|${y}|${m}|${d}|${ram}`), s = sum(`${isl}|${y}|${m}|${ram}`)
    for (const f in v) { b[f] += v[f]; s[f] += v[f] }
    if (dk || cat) {
      const x = day(`${isl}|${y}|${m}|${d}|DAY`)
      x.dk += n0(dk)
      if (cat) x.cat.push(String(cat))
    }
  }
  daily.forEach((r) => add(r.island, r.tarikh, ramOf(r.ram), {
    bp_b: n0(r.bilangan_penyu_bertag), bp_t: n0(r.bilangan_penyu_takbertag),
    td_b: n0(r.jumlah_telur_diram_bertag), td_t: n0(r.jumlah_telur_diram_takbertag),
    tm_b: n0(r.telur_menetas_bertag), tm_t: n0(r.telur_menetas_takbertag),
    bu_b: burukOf(r.jumlah_telur_diram_bertag, r.telur_menetas_bertag, r.telur_buruk_bertag),
    bu_t: burukOf(r.jumlah_telur_diram_takbertag, r.telur_menetas_takbertag, r.telur_buruk_takbertag),
  }, r.jumlah_telur_dikeluarkan, r.catatan))
  nests.forEach((r) => {
    const s = r.bertag ? 'b' : 't'
    add(r.island, r.tarikh_dijumpai, ramOf(r.ram), {
      [`bp_${s}`]: 1, [`td_${s}`]: n0(r.jumlah_telur_diram), [`tm_${s}`]: n0(r.telur_menetas),
      [`bu_${s}`]: burukOf(r.jumlah_telur_diram, r.telur_menetas, r.telur_buruk),
    }, r.jumlah_dikeluarkan, r.catatan)
  })

  // Menetas Bulanan ikut RAM: ganti jumlah harian menetas & buruk (baris 39)
  const eff = (isl, y, m, ram) => {   // jumlah berkesan baris 39 bagi satu RAM
    const s = sums.get(`${isl}|${y}|${m}|${ram}`) || blankDay()
    const a = months.get(`${isl}|${y}|${m}`)?.adj || []
    const o = ram === 'LPP' ? 0 : 2
    return { tm: s.tm_b + s.tm_t + n0(a[o]) + n0(a[o + 1]), bu: s.bu_b + s.bu_t + n0(a[o + 4]) + n0(a[o + 5]), td: s.td_b + s.td_t }
  }
  hatch.filter((h) => h.ram === 'LPP' || h.ram === 'SFC').forEach((h) => {
    const s = sums.get(`${h.island}|${h.year}|${h.month}|${h.ram}`) || blankDay()
    const mo = month(`${h.island}|${h.year}|${h.month}`)
    const o = h.ram === 'LPP' ? 0 : 2   // K,L (LPP) / M,N (SFC); buruk +4
    mo.adj[o] = n0(h.menetas_bertag) - s.tm_b
    mo.adj[o + 1] = n0(h.menetas_takbertag) - s.tm_t
    mo.adj[o + 4] = n0(h.buruk_bertag) - s.bu_b
    mo.adj[o + 5] = n0(h.buruk_takbertag) - s.bu_t
    if (h.catatan) mo.notes.push(`Menetas ${h.ram}: ${h.catatan}`)
  })
  // Menetas Gabung LPP+SFC: menetas sebulan; buruk = diram bulan − menetas
  hatch.filter((h) => h.ram === 'ALL').forEach((h) => {
    const L = eff(h.island, h.year, h.month, 'LPP'), S = eff(h.island, h.year, h.month, 'SFC')
    const m = n0(h.menetas_bertag) + n0(h.menetas_takbertag)
    const mo = month(`${h.island}|${h.year}|${h.month}`)
    mo.menetas += m - (L.tm + S.tm)
    mo.buruk += Math.max(0, L.td + S.td - m) - (L.bu + S.bu)
    mo.notes.push(`Menetas gabung LPP+SFC: ${m.toLocaleString('en-US')}${h.catatan ? ' · ' + h.catatan : ''}`)
  })
  // Rekod bulanan lama (tiada pecahan RAM/tag)
  legacy.forEach((r) => {
    const mo = month(`${r.island}|${r.year}|${r.month}`)
    mo.penyu += n0(r.bilangan_penyu)
    mo.diram += n0(r.jumlah_telur)
    mo.dikutip += r.telur_dikutip != null ? n0(r.telur_dikutip) : n0(r.jumlah_telur)
    mo.menetas += n0(r.telur_menetas)
    mo.buruk += n0(r.telur_buruk)
    mo.notes.push(`Rekod bulanan lama${r.catatan ? ': ' + r.catatan : ''}`)
  })

  // "Semua Pulau" = jumlah tiga pulau (catatan diberi kod pulau)
  const rest = (k) => k.slice(k.indexOf('|') + 1)
  for (const [k, v] of [...days]) {
    const isl = k.slice(0, 3), all = day(`ALL|${rest(k)}`)
    if (k.endsWith('|DAY')) { all.dk += v.dk; v.cat.forEach((c) => all.cat.push(`${isl}: ${c}`)) } else for (const f in v) all[f] += v[f]
  }
  for (const [k, v] of [...months]) {
    if (k.startsWith('ALL|')) continue
    const isl = k.slice(0, 3), all = month(`ALL|${rest(k)}`)
    v.adj.forEach((a, i) => { all.adj[i] += a })
    NP_FIELDS.forEach((f) => { all[f] += v[f] })
    v.notes.forEach((t) => all.notes.push(`${isl}: ${t}`))
  }
  return { days, months }
}

// ---------------------------------------------------------------------------
// 2. Bantuan XML
// ---------------------------------------------------------------------------
const xmlEsc = (s) => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')   // aksara yang tidak sah dalam XML
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const colNum = (c) => c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
const colName = (n) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
const splitRef = (ref) => { const m = ref.match(/^([A-Z]+)(\d+)$/); return [m[1], Number(m[2])] }

// spec: number | string | null | { f, v, s } (f = formula tanpa "=", v = nilai cache, s = gaya)
function cellXml(ref, s, spec) {
  if (spec && typeof spec === 'object') {
    const st = spec.s ?? s
    const sa = st != null ? ` s="${st}"` : ''
    if (spec.f == null) return cellXml(ref, st, spec.v)
    const f = `<f>${xmlEsc(spec.f)}</f>`
    if (typeof spec.v === 'string') return `<c r="${ref}"${sa} t="str">${f}<v>${xmlEsc(spec.v)}</v></c>`
    if (typeof spec.v === 'number' && Number.isFinite(spec.v)) return `<c r="${ref}"${sa}>${f}<v>${spec.v}</v></c>`
    return `<c r="${ref}"${sa}>${f}</c>`
  }
  const sa = s != null ? ` s="${s}"` : ''
  if (spec === null || spec === undefined || spec === '') return `<c r="${ref}"${sa}/>`
  if (typeof spec === 'number') return `<c r="${ref}"${sa}><v>${spec}</v></c>`
  return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(spec)}</t></is></c>`
}

// Ganti / tambah sel dalam satu sheet XML. Gaya asal sel dikekalkan kecuali spec.s.
export function patchCells(xml, updates) {
  const pending = new Map(updates)
  xml = xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)(\/>|>[\s\S]*?<\/c>)/g, (m, ref, attrs) => {
    if (!pending.has(ref)) return m
    const spec = pending.get(ref); pending.delete(ref)
    return cellXml(ref, (attrs.match(/\ss="(\d+)"/) || [])[1], spec)
  })
  if (!pending.size) return xml
  // Sel yang tiada dalam template: sisip dalam baris ikut susunan lajur
  const byRow = new Map()
  for (const [ref, spec] of pending) { const [c, r] = splitRef(ref); if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push([colNum(c), cellXml(ref, null, spec)]) }
  for (const [r, cells] of byRow) {
    const re = new RegExp(`(<row r="${r}"[^>]*?)(/>|>([\\s\\S]*?)</row>)`)
    const m = xml.match(re)
    if (m) {
      const parts = (m[3] || '').match(/<c r="[A-Z]+\d+"[^>]*?(\/>|>[\s\S]*?<\/c>)/g) || []
      const all = [...parts.map((p) => [colNum(splitRef(p.match(/r="([A-Z]+\d+)"/)[1])[0]), p]), ...cells].sort((a, b) => a[0] - b[0])
      xml = xml.replace(re, `${m[1]}>${all.map((x) => x[1]).join('')}</row>`)
    } else {
      const rows = [...xml.matchAll(/<row r="(\d+)"/g)].map((x) => Number(x[1]))
      const next = rows.find((x) => x > r)
      const rowXml = `<row r="${r}">${cells.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join('')}</row>`
      xml = next ? xml.replace(`<row r="${next}"`, `${rowXml}<row r="${next}"`) : xml.replace('</sheetData>', `${rowXml}</sheetData>`)
    }
  }
  return xml
}

function addMerges(xml, refs) {
  const tags = refs.map((r) => `<mergeCell ref="${r}"/>`).join('')
  if (/<mergeCells\b/.test(xml)) {
    return xml.replace(/<mergeCells count="(\d+)">/, (m, n) => `<mergeCells count="${Number(n) + refs.length}">`).replace('</mergeCells>', tags + '</mergeCells>')
  }
  return xml.replace('</sheetData>', `</sheetData><mergeCells count="${refs.length}">${tags}</mergeCells>`)
}

// Lebar lajur: pecahkan julat <col min max> supaya satu lajur boleh diubah
function setColWidth(xml, col, width) {
  const n = colNum(col)
  return xml.replace(/<cols>([\s\S]*?)<\/cols>/, (all, inner) => {
    const cols = inner.match(/<col\b[^>]*\/>/g) || []
    const out = []
    let done = false
    for (const c of cols) {
      const min = Number(c.match(/min="(\d+)"/)[1]), max = Number(c.match(/max="(\d+)"/)[1])
      if (n < min || n > max) { out.push(c); continue }
      const at = (a, b) => c.replace(/min="\d+"/, `min="${a}"`).replace(/max="\d+"/, `max="${b}"`)
      if (min < n) out.push(at(min, n - 1))
      out.push(at(n, n).replace(/width="[^"]*"/, `width="${width}"`))
      if (n < max) out.push(at(n + 1, max))
      done = true
    }
    if (!done) out.push(`<col min="${n}" max="${n}" width="${width}" customWidth="1"/>`)
    out.sort((a, b) => Number(a.match(/min="(\d+)"/)[1]) - Number(b.match(/min="(\d+)"/)[1]))
    return `<cols>${out.join('')}</cols>`
  })
}

// Gaya baharu dalam styles.xml (fon/isian/border/xf ditambah di hujung senarai)
function styleBook(stylesXml) {
  let xml = stylesXml
  // Tambah satu item ke senarai (fonts/fills/borders/cellXfs); indeks = kiraan asal
  const append = (list, item) => {
    const re = new RegExp(`<${list}\\b([^>]*?)count="(\\d+)"([^>]*?)(/>|>([\\s\\S]*?)</${list}>)`)
    const m = xml.match(re)
    if (!m) throw new Error(`styles.xml: tiada <${list}>`)
    const idx = Number(m[2])
    xml = xml.replace(re, `<${list}${m[1]}count="${idx + 1}"${m[3]}>${m[5] || ''}${item}</${list}>`)
    return idx
  }
  const xfs = () => xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)[1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)
  let fmtId = null
  const cache = new Map()
  return {
    // klon gaya sel sedia ada dengan format "0 dipapar kosong"
    hideZero(s) {
      const key = `hz${s}`
      if (cache.has(key)) return cache.get(key)
      if (fmtId == null) {
        fmtId = 164
        const tag = `<numFmt numFmtId="${fmtId}" formatCode="0;-0;;@"/>`
        xml = /<numFmts\b[^>]*\/>/.test(xml) ? xml.replace(/<numFmts\b[^>]*\/>/, `<numFmts count="1">${tag}</numFmts>`)
          : /<numFmts count="(\d+)">/.test(xml) ? xml.replace(/<numFmts count="(\d+)">/, (m, c) => `<numFmts count="${Number(c) + 1}">${tag}`)
            : xml.replace(/<fonts\b/, `<numFmts count="1">${tag}</numFmts><fonts`)
      }
      const base = xfs()[Number(s)] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      const xf = base.replace(/numFmtId="\d+"/, `numFmtId="${fmtId}"`).replace(/<xf\b/, (t) => /applyNumberFormat/.test(base) ? t : '<xf applyNumberFormat="1"')
      const id = append('cellXfs', xf.replace(/applyNumberFormat="\d"/, 'applyNumberFormat="1"'))
      cache.set(key, id)
      return id
    },
    // gaya baharu: { bold, italic, size, color, fill, border, h }
    add(key, o) {
      if (cache.has(key)) return cache.get(key)
      const font = append('fonts', `<font>${o.bold ? '<b val="1"/>' : ''}${o.italic ? '<i val="1"/>' : ''}<sz val="${o.size || 10}"/><color rgb="${o.color || 'FF000000'}"/><name val="Arial"/><family val="2"/></font>`)
      const fill = o.fill ? append('fills', `<fill><patternFill patternType="solid"><fgColor rgb="${o.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0
      const side = (t) => `<${t} style="medium"><color rgb="FF000000"/></${t}>`
      const border = o.border ? append('borders', `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`) : 0
      const id = append('cellXfs', `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${o.h || 'left'}" vertical="center" wrapText="${o.wrap ? 1 : 0}"/></xf>`)
      cache.set(key, id)
      return id
    },
    xml: () => xml,
  }
}

// ---------------------------------------------------------------------------
// 3. Bina workbook
// ---------------------------------------------------------------------------
// JSZip: kelas JSZip; templateBuf: ArrayBuffer/Buffer template-*.xlsx
// raw: { daily, nests, hatch, legacy }; opts: { years: [..], island: 'ALL'|'PTB'|..., year }
export async function buildRasmiWorkbook(JSZip, templateBuf, raw, opts) {
  const { days, months } = computeRasmiData(raw)
  const years = [...new Set(opts.years.map(Number))].sort((a, b) => b - a)   // terkini dahulu
  const pulau = PULAU.find((p) => p.code === opts.island) || PULAU[0]
  const year = Number(opts.year) || years[0]
  const zip = await JSZip.loadAsync(templateBuf)

  // Peta nama sheet → fail XML
  const wbXml = await zip.file('xl/workbook.xml').async('string')
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const relTarget = {}
  for (const tag of relsXml.match(/<Relationship\b[^>]*>/g) || []) {
    const id = (tag.match(/Id="([^"]+)"/) || [])[1], tgt = (tag.match(/Target="([^"]+)"/) || [])[1]
    if (id && tgt) relTarget[id] = tgt.replace(/^\//, '').replace(/^(?!xl\/)/, 'xl/')
  }
  const sheetFile = {}
  for (const tag of wbXml.match(/<sheet\b[^>]*>/g) || []) {
    const name = (tag.match(/name="([^"]+)"/) || [])[1], rid = (tag.match(/r:id="([^"]+)"/) || [])[1]
    if (name && rid) sheetFile[name] = relTarget[rid]
  }
  const sumName = Object.keys(sheetFile).find((n) => /^JUMLAH/i.test(n))
  if (!sumName || MONTH_SHEETS.some((n) => !sheetFile[n])) throw new Error('Template tidak lengkap (JAN–DIS + JUMLAH)')

  const styles = styleBook(await zip.file('xl/styles.xml').async('string'))
  const S = {
    label: styles.add('label', { bold: true, size: 12, h: 'right' }),
    input: styles.add('input', { bold: true, size: 12, fill: 'FFFFF2CC', border: true, h: 'center' }),
    note: styles.add('note', { italic: true, size: 9, color: 'FF555555' }),
  }

  // --- Sheet DATA (tersembunyi) ---
  const dayKeys = [...days.keys()].sort()
  const monKeys = [...months.keys()].sort()
  const nD = Math.max(2, dayKeys.length + 1), nM = Math.max(2, monKeys.length + 1)
  const rng = (c, n) => `DATA!$${c}$2:$${c}$${n}`
  const rows = new Map()
  const put = (r, c, spec) => { if (!rows.has(r)) rows.set(r, []); rows.get(r).push([colNum(c), cellXml(`${c}${r}`, null, spec)]) }
  ;['Kunci (pulau|tahun|bulan|hari|RAM)', 'Penyu bertag', 'Penyu tak bertag', 'Diram bertag', 'Diram tak bertag', 'Menetas bertag', 'Menetas tak bertag', 'Buruk bertag', 'Buruk tak bertag', 'Dikeluarkan', 'Catatan']
    .forEach((h, i) => put(1, colName(i + 1), h))
  ;['Kunci (pulau|tahun|bulan)', 'Pelarasan K39', 'L39', 'M39', 'N39', 'O39', 'P39', 'Q39', 'R39', 'Penyu (tanpa pecahan)', 'Telur dikutip', 'Telur diram', 'Telur menetas', 'Telur buruk', 'Catatan bulan']
    .forEach((h, i) => put(1, colName(colNum('N') + i), h))
  dayKeys.forEach((k, i) => {
    const r = i + 2, v = days.get(k)
    put(r, D.key, k)
    if (k.endsWith('|DAY')) { if (v.dk) put(r, D.dk, v.dk); if (v.cat.length) put(r, D.cat, v.cat.join('; ')) } else {
      ;['bp_b', 'bp_t', 'td_b', 'td_t', 'tm_b', 'tm_t', 'bu_b', 'bu_t'].forEach((f) => { if (v[f]) put(r, D[f], v[f]) })
    }
  })
  monKeys.forEach((k, i) => {
    const r = i + 2, v = months.get(k)
    put(r, M.key, k)
    v.adj.forEach((a, j) => { if (a) put(r, M.adj[j], a) })
    NP_FIELDS.forEach((f) => { if (v[f]) put(r, M[f], v[f]) })
    if (v.notes.length) put(r, M.note, v.notes.join(' | '))
  })
  put(1, 'AD', 'Senarai tahun'); years.forEach((y, i) => put(i + 2, 'AD', y))
  put(1, 'AE', 'Senarai pulau'); put(1, 'AF', 'Kod')
  PULAU.forEach((p, i) => { put(i + 2, 'AE', p.name); put(i + 2, 'AF', p.code) })
  put(1, 'AG', 'Kod dipilih'); put(1, 'AH', { f: `IFERROR(INDEX($AF$2:$AF$${PULAU.length + 1},MATCH(${SEL_PULAU},$AE$2:$AE$${PULAU.length + 1},0)),"ALL")`, v: pulau.code })
  put(2, 'AG', 'Awalan kunci'); put(2, 'AH', { f: `$AH$1&"|"&${SEL_TAHUN}&"|"`, v: `${pulau.code}|${year}|` })
  const dataXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    [...rows.keys()].sort((a, b) => a - b).map((r) => `<row r="${r}">${rows.get(r).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join('')}</row>`).join('') +
    '</sheetData></worksheet>'

  // Nilai cache untuk pilihan awal (supaya pratonton/telefon terus nampak angka)
  const pre = `${pulau.code}|${year}|`
  const dv = (mi, d, ram, f) => { const v = days.get(`${pre}${mi + 1}|${d}|${ram}`); return v ? n0(v[f]) : 0 }
  const mv = (mi) => months.get(`${pre}${mi + 1}`) || blankMonth()
  const dayKey = (mi, r, ram) => `${PREFIX}&"${mi + 1}|"&$A${r}&"|${ram}"`

  // --- Sheet bulan JAN–DIS ---
  for (let mi = 0; mi < 12; mi++) {
    const path = sheetFile[MONTH_SHEETS[mi]]
    let xml = await zip.file(path).async('string')
    const up = new Map()
    const a2 = (xml.match(/<c r="A2"[^>]*>[\s\S]*?<t[^>]*>([^<]*)<\/t>/) || [])[1] || `BULAN ${MONTH_SHEETS[mi]}`
    const bulan = a2.replace(/&amp;/g, '&').replace(/\s*\d{4}\s*$/, '').trim()
    up.set('A1', { f: `"REKOD PENDARATAN PENYU DAN KUTIPAN TELUR DI "&UPPER(${SEL_PULAU})`, v: `REKOD PENDARATAN PENYU DAN KUTIPAN TELUR DI ${pulau.name.toUpperCase()}` })
    up.set('A2', { f: `"${bulan} "&${SEL_TAHUN}`, v: `${bulan} ${year}` })
    const styleOf = (ref) => (xml.match(new RegExp(`<c r="${ref}"[^>]*?\\ss="(\\d+)"`)) || [])[1]
    for (let d = 1; d <= 31; d++) {
      const r = 7 + d
      for (const [col, [ram, f]] of Object.entries(DAY_COLS)) {
        const s = HIDE_ZERO.has(col) ? styles.hideZero(styleOf(`${col}${r}`) ?? 25) : undefined
        up.set(`${col}${r}`, { f: `SUMIFS(${rng(D[f], nD)},${rng(D.key, nD)},${dayKey(mi, r, ram)})`, v: dv(mi, d, ram, f), s })
      }
      const dayRec = days.get(`${pre}${mi + 1}|${d}|DAY`)
      up.set(`S${r}`, { f: `SUMIFS(${rng(D.dk, nD)},${rng(D.key, nD)},${dayKey(mi, r, 'DAY')})`, v: dayRec ? dayRec.dk : 0, s: styles.hideZero(styleOf(`S${r}`) ?? 25) })
      up.set(`T${r}`, { f: `IFERROR(INDEX(${rng(D.cat, nD)},MATCH(${dayKey(mi, r, 'DAY')},${rng(D.key, nD)},0))&"","")`, v: dayRec ? dayRec.cat.join('; ') : '' })
    }
    // Baris 39 (menetas & buruk): tambah pelarasan Menetas Bulanan ikut RAM
    ADJ_COLS.forEach((col, j) => {
      const daysum = Array.from({ length: 31 }, (_, i) => { const [ram, f] = DAY_COLS[col]; return dv(mi, i + 1, ram, f) }).reduce((a, b) => a + b, 0)
      up.set(`${col}39`, { f: `SUM(${col}8:${col}38)+SUMIFS(${rng(M.adj[j], nM)},${rng(M.key, nM)},${PREFIX}&"${mi + 1}")`, v: daysum + n0(mv(mi).adj[j]) })
    })
    // Baris 41 (JUMLAH gabungan): tambah rekod tanpa pecahan (rekod lama / menetas gabung)
    ;[['C', 'E', 'penyu'], ['G', 'I', 'diram'], ['K', 'M', 'menetas'], ['O', 'Q', 'buruk']].forEach(([a, b, f]) => {
      up.set(`${a}41`, { f: `SUM(${a}40,${b}40)+SUMIFS(${rng(M[f], nM)},${rng(M.key, nM)},${PREFIX}&"${mi + 1}")` })
    })
    if (mi === 0) {
      up.set('U1', { v: 'TAHUN:', s: S.label }); up.set('V1', { v: year, s: S.input })
      up.set('U2', { v: 'PULAU:', s: S.label }); up.set('V2', { v: pulau.name, s: S.input })
      up.set('U3', { v: 'Tukar tahun & pulau di sini; semua sheet ikut.', s: S.note })
    } else {
      up.set('U1', { v: 'Tukar tahun & pulau di sheet JAN (sel V1 & V2).', s: S.note })
    }
    xml = patchCells(xml, up)
    if (mi === 0) {
      xml = setColWidth(xml, 'U', 10)
      xml = setColWidth(xml, 'V', 30)
      const dvXml = `<dataValidations count="2">` +
        `<dataValidation type="list" allowBlank="0" showInputMessage="1" showErrorMessage="1" errorTitle="Tahun" error="Pilih tahun daripada senarai." promptTitle="Tahun" prompt="Pilih tahun" sqref="V1"><formula1>${rng('AD', years.length + 1)}</formula1></dataValidation>` +
        `<dataValidation type="list" allowBlank="0" showInputMessage="1" showErrorMessage="1" errorTitle="Pulau" error="Pilih pulau daripada senarai." promptTitle="Pulau" prompt="Pilih pulau" sqref="V2"><formula1>"${PULAU.map((p) => p.name).join(',')}"</formula1></dataValidation>` +
        `</dataValidations>`
      xml = xml.replace(/<dataValidations\b[\s\S]*?<\/dataValidations>/, '')
      xml = /<\/mergeCells>/.test(xml) ? xml.replace('</mergeCells>', '</mergeCells>' + dvXml) : xml.replace('</sheetData>', '</sheetData>' + dvXml)
    }
    zip.file(path, xml)
  }

  // --- Sheet JUMLAH ---
  {
    const path = sheetFile[sumName]
    let xml = await zip.file(path).async('string')
    const up = new Map()
    up.set('A1', { f: `"JUMLAH KESELURUHAN "&UPPER(${SEL_PULAU})&" TAHUN "&${SEL_TAHUN}`, v: `JUMLAH KESELURUHAN ${pulau.name.toUpperCase()} TAHUN ${year}` })
    up.set('U1', { v: 'Tukar tahun & pulau di sheet JAN (sel V1 & V2).', s: S.note })
    const st = (ref, dflt) => Number((xml.match(new RegExp(`<c r="${ref}"[^>]*?\\ss="(\\d+)"`)) || [])[1] ?? dflt)
    const sHead = st('S7', 128), sSub = st('R7', 127), sData = st('B9', 83), sTot = st('B21', 86)
    up.set('U6', { v: 'TANPA PECAHAN LPP/SFC & TAG (rekod bulanan lama / menetas gabung)', s: sHead })
    ;['V6', 'W6', 'X6', 'Y6'].forEach((r) => up.set(r, { v: null, s: sHead }))
    const heads = { U: ['Bilangan Penyu', 'penyu'], V: ['Jumlah Telur Dikutip', 'dikutip'], W: ['Jumlah Telur Diram', 'diram'], X: ['Telur Menetas', 'menetas'], Y: ['Jumlah Telur Buruk', 'buruk'] }
    for (const [c, [label, f]] of Object.entries(heads)) {
      up.set(`${c}7`, { v: label, s: sSub }); up.set(`${c}8`, { v: null, s: sSub })
      let tot = 0
      for (let mi = 0; mi < 12; mi++) {
        const v = n0(mv(mi)[f]); tot += v
        up.set(`${c}${9 + mi}`, { f: `SUMIFS(${rng(M[f], nM)},${rng(M.key, nM)},${PREFIX}&"${mi + 1}")`, v, s: sData })
      }
      up.set(`${c}21`, { f: `SUM(${c}9:${c}20)`, v: tot, s: sTot })
    }
    for (let mi = 0; mi < 12; mi++) {
      const r = 9 + mi
      up.set(`S${r}`, { f: `IFERROR(INDEX(${rng(M.note, nM)},MATCH(${PREFIX}&"${mi + 1}",${rng(M.key, nM)},0))&"","")`, v: mv(mi).notes.join(' | ') })
    }
    xml = patchCells(xml, up)
    xml = addMerges(xml, ['U6:Y6', 'U7:U8', 'V7:V8', 'W7:W8', 'X7:X8', 'Y7:Y8'])
    ;['U', 'V', 'W', 'X', 'Y'].forEach((c) => { xml = setColWidth(xml, c, 14) })
    zip.file(path, xml)
  }

  // --- workbook.xml: nama JUMLAH, sheet DATA tersembunyi, kawasan cetak ---
  const ids = [...wbXml.matchAll(/sheetId="(\d+)"/g)].map((m) => Number(m[1]))
  const dataPath = 'xl/worksheets/sheetData.xml'
  zip.file(dataPath, dataXml)
  let rels = relsXml.replace('</Relationships>', '<Relationship Id="rIdPenyuData" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheetData.xml"/></Relationships>')
  zip.file('xl/_rels/workbook.xml.rels', rels)
  let ct = await zip.file('[Content_Types].xml').async('string')
  ct = ct.replace('</Types>', '<Override PartName="/xl/worksheets/sheetData.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
  zip.file('[Content_Types].xml', ct)
  const sheetOrder = (wbXml.match(/<sheet\b[^>]*>/g) || []).map((t) => (t.match(/name="([^"]+)"/) || [])[1])
  const printAreas = MONTH_SHEETS.map((n) => `<definedName name="_xlnm.Print_Area" localSheetId="${sheetOrder.indexOf(n)}">${n}!$A$1:$T$41</definedName>`).join('')
  let wb = wbXml
    .replace(`name="${sumName}"`, 'name="JUMLAH"')
    .replace('</sheets>', `<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="DATA" sheetId="${Math.max(0, ...ids) + 1}" state="hidden" r:id="rIdPenyuData"/></sheets>`)
  wb = /<definedNames\s*\/>/.test(wb) ? wb.replace(/<definedNames\s*\/>/, `<definedNames>${printAreas}</definedNames>`)
    : /<definedNames>/.test(wb) ? wb.replace('<definedNames>', `<definedNames>${printAreas}`)
      : wb.replace('</sheets>', `</sheets><definedNames>${printAreas}</definedNames>`)
  // Paksa kira semula semua formula bila dibuka
  wb = /fullCalcOnLoad/.test(wb) ? wb : /<calcPr\b/.test(wb) ? wb.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"') : wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>')
  zip.file('xl/workbook.xml', wb)
  zip.file('xl/styles.xml', styles.xml())
  if (zip.file('xl/calcChain.xml')) zip.remove('xl/calcChain.xml')
  return zip
}
