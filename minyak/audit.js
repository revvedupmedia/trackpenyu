// 📋 Laporan Audit Minyak (admin sahaja; Log Perubahan hanya boleh dibaca admin).
// Format: docs/Contoh_Format_Audit_Minyak.xlsx. Semua jumlah ditulis sebagai
// formula Excel beserta nilainya, supaya juruaudit boleh menyemak semula.
import { XL, xlHeader, xlTitle, xlPage, xlWidths, xlRowStyle, serialDate, serialDateTime } from './xl.js?v=20'

export const CHECKS = [
  ['Mungkin pendua', 'Tarikh, jenis dan jumlah sama dengan entri lain'],
  ['Resit sama digunakan semula', 'Cap jari SHA-256 resit sama dengan entri lain'],
  ['Tiada resit', 'Entri tanpa gambar/PDF resit'],
  ['Jumlah luar biasa', 'Lebih 3× median jumlah bagi jenis minyak yang sama'],
  ['RM/liter luar biasa', 'Harga seliter berbeza lebih 30% daripada median jenis yang sama'],
  ['Tarikh masa depan', 'Tarikh beli selepas tarikh direkod'],
  ['Direkod lewat', 'Direkod lebih 7 hari selepas tarikh beli'],
  ['Claim tertunggak', 'Perlu claim, masih belum claim lebih 30 hari'],
  ['Diubah selepas direkod', 'Medan entri diubah oleh pengguna (lihat Log Perubahan)'],
  ['Dipadam / dipulihkan', 'Lihat sheet Entri Dipadam'],
]
// Perubahan aliran kerja biasa (tanda claim, padam/pulih, "bukan pendua")
// tidak dikira "diubah selepas direkod".
const EDIT_FIELDS = { entry_date: 'Tarikh', fuel_type: 'Jenis', amount: 'Jumlah (RM)', liters: 'Liter', station: 'Stesen', notes: 'Nota',
  needs_claim: 'Perlu claim', receipt_path: 'Resit', odometer_start: 'Odo mula', odometer_end: 'Odo akhir' }
const LOG_FIELDS = { ...EDIT_FIELDS, claim_status: 'Status claim', dup_ok: 'Bukan pendua' }
const FUEL = { diesel: 'Diesel', ron95: 'RON95 (Boat)' }
const MONTHS = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember']
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const localDate = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const dmy = (s) => s ? s.slice(0, 10).split('-').reverse().join('/') : ''
const rm = (n) => 'RM' + Number(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ref = (id) => String(id || '').slice(0, 8).toUpperCase()
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
const hasReceipt = (e) => !!(e.receipt_path || e.receipt_url)
const claimLbl = (e) => e.needs_claim ? (e.claim_status === 'claimed' ? 'Dah Claim' : 'Belum Claim') : ''
const val = (k, v) => v == null || v === '' ? '—' : k === 'fuel_type' ? FUEL[v] || v : k === 'entry_date' ? dmy(v) : typeof v === 'boolean' ? (v ? 'Ya' : 'Tidak')
  : k === 'claim_status' ? ({ claimed: 'Dah Claim', pending: 'Belum Claim', not_applicable: 'Tidak perlu' }[v] || v) : String(v)

async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

// ---------- 1. Ambil data ----------
export async function collectAuditData(sb, from, to) {
  const startIso = new Date(`${from}T00:00:00`).toISOString()
  const endD = new Date(`${to}T00:00:00`); endD.setDate(endD.getDate() + 1)
  const endIso = endD.toISOString()
  const [inPeriod, deletedAll, log, profiles] = await Promise.all([
    fetchAll(() => sb.from('minyak_entries').select('*').gte('entry_date', from).lte('entry_date', to).order('entry_date').order('id')),
    fetchAll(() => sb.from('minyak_entries').select('*').not('deleted_at', 'is', null).order('deleted_at').order('id')),
    fetchAll(() => sb.from('minyak_entries_audit').select('*').gte('changed_at', startIso).lte('changed_at', endIso).order('changed_at').order('id')),
    sb.from('staff_profiles').select('id,full_name').then((r) => r.data || []),
  ])
  const names = new Map(profiles.map((p) => [p.id, p.full_name])), emails = new Map()
  for (const e of [...inPeriod, ...deletedAll]) if (e.user_id && e.user_email) emails.set(e.user_id, e.user_email)
  const people = new Map([...new Set([...names.keys(), ...emails.keys()])].map((id) => {
    const n = names.get(id), m = emails.get(id)
    return [id, n && m ? `${n} (${m})` : n || m]
  }))
  const inside = (iso) => iso && iso >= startIso && iso < endIso
  return {
    from, to,
    entries: inPeriod.filter((e) => !e.deleted_at),
    deleted: [...new Map([...inPeriod, ...deletedAll].filter((e) => e.deleted_at && (inside(e.deleted_at) || (e.entry_date >= from && e.entry_date <= to))).map((e) => [e.id, e])).values()],
    log: log.filter((a) => a.changed_at < endIso),
    people,
  }
}

// ---------- 2. Analisis: log, pengecualian, bendera ----------
export function analyse(data, today = localDate(new Date().toISOString())) {
  const { entries: E, log } = data
  const who = (id) => id ? (data.people.get(id) || ref(id)) : 'Sistem (migration)'
  // Log Perubahan: satu baris setiap medan yang berubah.
  const logRows = [], edited = new Map(), restored = new Map()
  for (const a of log) {
    const b = a.before || {}, f = a.after || {}
    const base = { at: a.changed_at, by: who(a.changed_by), ref: ref(a.entry_id), entry: a.entry_id }
    const sumry = (r) => r ? `${FUEL[r.fuel_type] || ''} ${rm(r.amount || 0)} · ${dmy(r.entry_date)}` : ''
    if (a.action === 'insert') logRows.push({ ...base, action: 'Tambah', field: '—', before: '', after: sumry(f) })
    else if (a.action === 'delete') logRows.push({ ...base, action: 'Padam kekal', field: '—', before: sumry(b), after: '' })
    else if (!b.deleted_at && f.deleted_at) logRows.push({ ...base, action: 'Padam', field: '—', before: sumry(b), after: '' })
    else if (b.deleted_at && !f.deleted_at) { logRows.push({ ...base, action: 'Pulih', field: '—', before: '', after: sumry(f) }); restored.set(a.entry_id, { at: a.changed_at, by: base.by, padamAt: b.deleted_at, padamBy: who(b.deleted_by), row: f }) }
    else for (const k of Object.keys(LOG_FIELDS)) {
      if (JSON.stringify(b[k] ?? null) === JSON.stringify(f[k] ?? null)) continue
      logRows.push({ ...base, action: 'Ubah', field: LOG_FIELDS[k], before: val(k, b[k]), after: val(k, f[k]) })
      if (a.changed_by && EDIT_FIELDS[k]) (edited.get(a.entry_id) || edited.set(a.entry_id, []).get(a.entry_id)).push(`${EDIT_FIELDS[k]} ${val(k, b[k])} → ${val(k, f[k])} oleh ${base.by} (${dmy(localDate(a.changed_at))})`)
    }
  }
  // Pengecualian
  const exc = [], flags = new Map()
  const flag = (e, check, detail) => { exc.push({ check, e, detail }); (flags.get(e.id) || flags.set(e.id, []).get(e.id)).push(check) }
  const group = (key) => { const m = new Map(); E.forEach((e) => { const k = key(e); if (k != null) (m.get(k) || m.set(k, []).get(k)).push(e) }); return m }
  for (const g of group((e) => `${e.entry_date}|${e.fuel_type}|${Number(e.amount).toFixed(2)}`).values()) if (g.length > 1)
    g.forEach((e) => flag(e, 'Mungkin pendua', `Tarikh, jenis dan jumlah sama dengan ${g.filter((x) => x !== e).map((x) => ref(x.id)).join(', ')}.${e.dup_ok ? ' Ditanda "Bukan pendua" oleh pengguna.' : ''}`))
  for (const g of group((e) => e.receipt_hash || null).values()) if (g.length > 1)
    g.forEach((e) => flag(e, 'Resit sama digunakan semula', `Fail resit sama dengan ${g.filter((x) => x !== e).map((x) => ref(x.id)).join(', ')}.`))
  E.filter((e) => !hasReceipt(e)).forEach((e) => flag(e, 'Tiada resit', 'Tiada gambar/PDF resit dilampirkan.'))
  for (const f of ['diesel', 'ron95']) {
    const xs = E.filter((e) => e.fuel_type === f)
    const med = median(xs.map((e) => Number(e.amount)))
    if (xs.length >= 5) xs.filter((e) => Number(e.amount) > med * 3).forEach((e) => flag(e, 'Jumlah luar biasa', `${rm(e.amount)} berbanding median ${FUEL[f]} ${rm(med)} (${(Number(e.amount) / med).toFixed(1)}×).`))
    const wl = xs.filter((e) => Number(e.liters) > 0), medL = median(wl.map((e) => Number(e.amount) / Number(e.liters)))
    if (wl.length >= 5) wl.forEach((e) => { const p = Number(e.amount) / Number(e.liters); if (Math.abs(p - medL) / medL > 0.3) flag(e, 'RM/liter luar biasa', `${rm(p)}/liter berbanding median ${FUEL[f]} ${rm(medL)}/liter (${Number(e.liters)} L untuk ${rm(e.amount)}).`) })
  }
  E.forEach((e) => {
    const rec = e.created_at ? localDate(e.created_at) : null
    if (rec && e.entry_date > rec) flag(e, 'Tarikh masa depan', `Tarikh beli ${dmy(e.entry_date)} selepas direkod ${dmy(rec)}.`)
    if (rec && daysBetween(e.entry_date, rec) > 7) flag(e, 'Direkod lewat', `Dibeli ${dmy(e.entry_date)}, direkod ${dmy(rec)} (${daysBetween(e.entry_date, rec)} hari).`)
    if (e.needs_claim && e.claim_status === 'pending' && daysBetween(e.entry_date, today) > 30) flag(e, 'Claim tertunggak', `Perlu claim sejak ${dmy(e.entry_date)}, masih Belum Claim (${daysBetween(e.entry_date, today)} hari).`)
    if (edited.has(e.id)) flag(e, 'Diubah selepas direkod', edited.get(e.id).join('; '))
  })
  // Entri dipadam (masih dipadam) + entri yang dipulihkan dalam tempoh.
  const delRows = data.deleted.map((e) => ({ e, at: e.deleted_at, by: who(e.deleted_by), status: 'Masih dipadam' }))
  for (const [id, r] of restored) {
    delRows.push({ e: { id, ...r.row }, at: r.padamAt, by: r.padamBy, status: `Dipulihkan ${dmy(localDate(r.at))} oleh ${r.by}` })
    const live = E.find((x) => x.id === id)
    if (live) flag(live, 'Dipadam / dipulihkan', `Dipadam ${r.padamAt ? dmy(localDate(r.padamAt)) : '?'}, dipulihkan ${dmy(localDate(r.at))} oleh ${r.by}.`)
  }
  delRows.forEach((d) => { if (d.status === 'Masih dipadam') exc.push({ check: 'Dipadam / dipulihkan', e: d.e, detail: `Dipadam ${dmy(localDate(d.at))} oleh ${d.by}. Tidak dikira dalam jumlah.` }) })
  const order = new Map(CHECKS.map(([c], i) => [c, i]))
  exc.sort((a, b) => order.get(a.check) - order.get(b.check) || a.e.entry_date.localeCompare(b.e.entry_date))
  return { logRows, exc, flags, delRows, who }
}

// ---------- 3. Bina workbook ----------
export function buildAuditWorkbook(ExcelJS, data, meta) {
  const A = analyse(data, meta.today)
  const E = [...data.entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || String(a.created_at).localeCompare(String(b.created_at)))
  const wb = new ExcelJS.Workbook(); wb.creator = 'Minyak Tracker'; wb.created = new Date()
  wb.calcProperties = { fullCalcOnLoad: true }
  const sumAmt = (xs) => xs.reduce((s, e) => s + Number(e.amount), 0)
  const F = 6, L = F + E.length - 1, R = (c) => `Rekod!$${c}$${F}:$${c}$${L}`
  const tempoh = `${dmy(data.from)} – ${dmy(data.to)}`

  // ---- Ringkasan Audit (sheet pertama; diisi selepas sheet lain) ----
  const ws0 = wb.addWorksheet('Ringkasan Audit')

  // ---- Rekod ----
  const ws1 = wb.addWorksheet('Rekod')
  xlTitle(ws1, `Rekod entri minyak (aktif) — ${tempoh}`, 'Satu baris setiap entri. Baris berwarna = ada isu (lihat lajur Bendera dan sheet Pengecualian).')
  ws1.getCell('A3').value = 'RM / Liter dan Lewat (hari) dikira oleh formula.'; ws1.getCell('A3').font = XL.note
  xlHeader(ws1, 5, ['No.', 'ID Rujukan', 'Tarikh Beli', 'Jenis', 'Liter', 'RM / Liter', 'Jumlah (RM)', 'Stesen', 'No. Invois Setel', 'Resit',
    'Cap Jari Resit', 'Perlu Claim', 'Status Claim', 'Tarikh Claim', 'Dimasukkan oleh', 'Masa Direkod', 'Lewat (hari)', 'Bendera', 'Nota'])
  E.forEach((e, k) => {
    const i = F + k, lit = Number(e.liters) > 0 ? Number(e.liters) : null, fl = A.flags.get(e.id) || []
    const rec = e.created_at ? serialDateTime(e.created_at) : null, d = serialDate(e.entry_date)
    const r = ws1.getRow(i)
    r.values = [k + 1, ref(e.id), d, FUEL[e.fuel_type] || e.fuel_type, lit,
      lit ? { formula: `IF(N(E${i})>0,G${i}/E${i},"")`, result: Number(e.amount) / lit } : null, Number(e.amount), e.station || '', e.receipt_ref || '',
      hasReceipt(e) ? 'Ada' : 'Tiada', e.receipt_hash ? e.receipt_hash.slice(0, 8) : '', e.needs_claim ? 'Ya' : 'Tidak', claimLbl(e),
      e.claimed_at ? serialDate(localDate(e.claimed_at)) : null, e.user_email || A.who(e.user_id), rec,
      rec != null ? { formula: `INT(P${i})-C${i}`, result: Math.floor(rec) - d } : null, [...new Set(fl)].join('; '), e.notes || '']
    for (let c = 1; c <= 19; c++) { const x = r.getCell(c); x.font = XL.font; x.border = XL.border; if (fl.length) x.fill = XL.warn; else if (k % 2) x.fill = XL.zebra }
    r.getCell(3).numFmt = XL.D; r.getCell(14).numFmt = XL.D; r.getCell(16).numFmt = XL.DT
    r.getCell(5).numFmt = XL.L; r.getCell(6).numFmt = '0.000'; r.getCell(7).numFmt = XL.RM; r.getCell(17).numFmt = '0'
    r.getCell(18).alignment = { wrapText: true, vertical: 'top' }; r.getCell(19).alignment = { wrapText: true, vertical: 'top' }
  })
  const t1 = ws1.getRow(L + 1)
  t1.getCell(1).value = 'JUMLAH'
  t1.getCell(5).value = { formula: `SUM(E${F}:E${L})`, result: E.reduce((s, e) => s + (Number(e.liters) || 0), 0) }
  t1.getCell(7).value = { formula: `SUM(G${F}:G${L})`, result: sumAmt(E) }
  for (let c = 1; c <= 19; c++) { const x = t1.getCell(c); x.font = XL.bold; x.fill = XL.total; x.border = XL.border }
  t1.getCell(5).numFmt = XL.L; t1.getCell(7).numFmt = XL.RM
  xlWidths(ws1, [5, 11, 12, 13, 10, 10, 12, 22, 20, 7, 12, 10, 13, 12, 26, 16, 9, 34, 30])
  ws1.autoFilter = { from: { row: 5, column: 1 }, to: { row: L, column: 19 } }
  xlPage(ws1, 5)
  ws1.getCell('B5').note = 'ID entri (8 aksara pertama). Sama dengan ID dalam Pengecualian, Log Perubahan dan Entri Dipadam.'
  ws1.getCell('K5').note = '8 aksara pertama cap jari SHA-256 fail resit. Jika resit ditukar, cap jari berubah.'

  // ---- Bulanan ----
  const ws2 = wb.addWorksheet('Bulanan')
  xlTitle(ws2, `Ringkasan bulanan — ${tempoh}`, 'Semua nilai dikira daripada sheet Rekod.')
  xlHeader(ws2, 5, ['Bulan', 'Tahun', 'No. Bulan', 'Bil. Entri', 'Diesel (RM)', 'RON95 (RM)', 'Jumlah (RM)', 'Liter', 'Belum Claim (RM)'])
  const ym = [...new Set(E.map((e) => e.entry_date.slice(0, 7)))].sort()
  ym.forEach((key, k) => {
    const i = 6 + k, [yy, mm] = key.split('-').map(Number), xs = E.filter((e) => e.entry_date.startsWith(key))
    const sel = `(YEAR(${R('C')})=B${i})*(MONTH(${R('C')})=C${i})`
    const r = ws2.getRow(i)
    r.values = [MONTHS[mm - 1], yy, mm,
      { formula: `SUMPRODUCT(${sel})`, result: xs.length },
      { formula: `SUMPRODUCT(${sel}*(${R('D')}="Diesel")*${R('G')})`, result: sumAmt(xs.filter((e) => e.fuel_type === 'diesel')) },
      { formula: `SUMPRODUCT(${sel}*(${R('D')}="RON95 (Boat)")*${R('G')})`, result: sumAmt(xs.filter((e) => e.fuel_type === 'ron95')) },
      { formula: `E${i}+F${i}`, result: sumAmt(xs) },
      { formula: `SUMPRODUCT(${sel}*N(+${R('E')}))`, result: xs.reduce((s, e) => s + (Number(e.liters) || 0), 0) },
      { formula: `SUMPRODUCT(${sel}*(${R('M')}="Belum Claim")*${R('G')})`, result: sumAmt(xs.filter((e) => claimLbl(e) === 'Belum Claim')) }]
    xlRowStyle(r, 9, k); [5, 6, 7, 9].forEach((c) => { r.getCell(c).numFmt = XL.RM }); r.getCell(8).numFmt = XL.L
  })
  const bt = 6 + ym.length, bL = bt - 1, tb = ws2.getRow(bt)
  tb.getCell(1).value = 'JUMLAH'
  // Nilai JUMLAH dikira dari data (bukan dibaca semula dari sel: ExcelJS
  // memulangkan undefined untuk keputusan 0, yang menjadi NaN dan merosakkan fail).
  const totals = { 4: E.length, 5: sumAmt(E.filter((e) => e.fuel_type === 'diesel')), 6: sumAmt(E.filter((e) => e.fuel_type === 'ron95')),
    7: sumAmt(E), 8: E.reduce((s, e) => s + (Number(e.liters) || 0), 0), 9: sumAmt(E.filter((e) => claimLbl(e) === 'Belum Claim')) }
  ;[['D', 4], ['E', 5], ['F', 6], ['G', 7], ['H', 8], ['I', 9]].forEach(([c, n]) => {
    tb.getCell(n).value = { formula: `SUM(${c}6:${c}${bL})`, result: totals[n] }
  })
  for (let c = 1; c <= 9; c++) { const x = tb.getCell(c); x.font = XL.bold; x.fill = XL.total; x.border = XL.border; if ([5, 6, 7, 9].includes(c)) x.numFmt = XL.RM }
  tb.getCell(8).numFmt = XL.L
  ws2.getCell(`A${bt + 2}`).value = 'Semakan silang: Jumlah di sini mesti sama dengan Ringkasan Audit → Jumlah keseluruhan.'; ws2.getCell(`A${bt + 2}`).font = XL.note
  ws2.getCell(`A${bt + 3}`).value = 'Beza (mesti 0):'; ws2.getCell(`A${bt + 3}`).font = XL.bold
  xlWidths(ws2, [12, 8, 9, 10, 13, 13, 13, 11, 15]); xlPage(ws2, 5)

  // ---- Pengecualian ----
  const ws3 = wb.addWorksheet('Pengecualian')
  xlTitle(ws3, `Senarai pengecualian (isu untuk disemak) — ${tempoh}`, 'Dijana oleh pemeriksaan automatik (sama seperti 🩺 Semakan Data). Lajur kuning diisi oleh penyemak.')
  xlHeader(ws3, 5, ['No.', 'Pemeriksaan', 'ID Rujukan', 'Tarikh Beli', 'Jumlah (RM)', 'Butiran', 'Ulasan Penyemak', 'Status'])
  A.exc.forEach((x, k) => {
    const r = ws3.getRow(6 + k)
    r.values = [k + 1, x.check, ref(x.e.id), x.e.entry_date ? serialDate(x.e.entry_date) : null, Number(x.e.amount) || 0, x.detail, null, null]
    for (let c = 1; c <= 8; c++) { const y = r.getCell(c); y.font = XL.font; y.border = XL.border; y.alignment = { vertical: 'top', wrapText: c === 6 || c === 7 }; if (c >= 7) y.fill = XL.input }
    r.getCell(4).numFmt = XL.D; r.getCell(5).numFmt = XL.RM
  })
  if (!A.exc.length) { ws3.getCell('A6').value = 'Tiada pengecualian dalam tempoh ini.'; ws3.getCell('A6').font = XL.note }
  xlWidths(ws3, [5, 26, 11, 12, 12, 60, 34, 14]); xlPage(ws3, 5)
  const eL = Math.max(6, 5 + A.exc.length)

  // ---- Log Perubahan ----
  const ws4 = wb.addWorksheet('Log Perubahan')
  xlTitle(ws4, `Log perubahan (jejak audit) — ${tempoh}`, 'Direkod automatik oleh database (trigger); pengguna tidak boleh mengubah atau memadam log ini.')
  xlHeader(ws4, 5, ['Masa', 'Tindakan', 'Oleh', 'ID Rujukan', 'Medan', 'Sebelum', 'Selepas'])
  A.logRows.forEach((x, k) => {
    const r = ws4.getRow(6 + k)
    r.values = [serialDateTime(x.at), x.action, x.by, x.ref, x.field, x.before, x.after]
    xlRowStyle(r, 7, k); r.getCell(1).numFmt = XL.DT
  })
  if (!A.logRows.length) { ws4.getCell('A6').value = 'Tiada perubahan direkod dalam tempoh ini.'; ws4.getCell('A6').font = XL.note }
  xlWidths(ws4, [17, 12, 26, 11, 14, 28, 28]); xlPage(ws4, 5)
  const uL = Math.max(6, 5 + A.logRows.length)

  // ---- Entri Dipadam ----
  const ws5 = wb.addWorksheet('Entri Dipadam')
  xlTitle(ws5, `Entri dipadam — ${tempoh}`, 'Entri tidak dipadam terus: ditanda dipadam, resit disimpan, dan boleh dipulihkan. Tidak dikira dalam jumlah.')
  xlHeader(ws5, 5, ['ID Rujukan', 'Tarikh Beli', 'Jenis', 'Jumlah (RM)', 'Dipadam pada', 'Dipadam oleh', 'Status sekarang'])
  A.delRows.forEach((d, k) => {
    const r = ws5.getRow(6 + k)
    r.values = [ref(d.e.id), d.e.entry_date ? serialDate(d.e.entry_date) : null, FUEL[d.e.fuel_type] || '', Number(d.e.amount) || 0, d.at ? serialDateTime(d.at) : null, d.by, d.status]
    xlRowStyle(r, 7, k); r.getCell(2).numFmt = XL.D; r.getCell(4).numFmt = XL.RM; r.getCell(5).numFmt = XL.DT
  })
  if (!A.delRows.length) { ws5.getCell('A6').value = 'Tiada entri dipadam dalam tempoh ini.'; ws5.getCell('A6').font = XL.note }
  xlWidths(ws5, [11, 12, 13, 12, 17, 26, 34]); xlPage(ws5, 5)
  const dL = Math.max(6, 5 + A.delRows.length)

  // ---- Ringkasan Audit ----
  xlTitle(ws0, 'Laporan Audit Minyak Tracker', 'Lembaga Pengurusan Penyu · dijana oleh Minyak Tracker')
  const info = [['Tempoh', tempoh], ['Penapis', 'Semua jenis minyak, semua pengguna'], ['Dijana pada', new Date(meta.now || Date.now()).toLocaleString('ms-MY')],
    ['Dijana oleh', meta.user || '-'], ['Sumber data', 'Supabase PenyuTrack — jadual minyak_entries & minyak_entries_audit'], ['Versi app', meta.version || '-']]
  info.forEach(([k, v], n) => { const r = ws0.getRow(4 + n); r.getCell(1).value = k; r.getCell(1).font = XL.bold; r.getCell(2).value = v; r.getCell(2).font = XL.font })
  let r0 = 11
  ws0.getCell(`A${r0}`).value = 'A. Jumlah kawalan'; ws0.getCell(`A${r0}`).font = XL.h2
  xlHeader(ws0, r0 + 1, ['Perkara', 'Nilai', 'Formula / sumber'])
  const withL = E.filter((e) => Number(e.liters) > 0)
  const ctrl = [
    ['Bilangan entri aktif', `COUNTA(${R('B')})`, E.length, '0', 'Kira ID dalam sheet Rekod'],
    ['Jumlah keseluruhan (RM)', `SUM(${R('G')})`, sumAmt(E), XL.RM, 'Jumlah lajur Jumlah (RM)'],
    ['  Diesel (RM)', `SUMIFS(${R('G')},${R('D')},"Diesel")`, sumAmt(E.filter((e) => e.fuel_type === 'diesel')), XL.RM, ''],
    ['  RON95 Boat (RM)', `SUMIFS(${R('G')},${R('D')},"RON95 (Boat)")`, sumAmt(E.filter((e) => e.fuel_type === 'ron95')), XL.RM, ''],
    ['Entri yang ada liter', `COUNTIFS(${R('E')},">0")`, withL.length, '0', 'Liter diisi untuk resit Setel & entri manual yang menyatakannya'],
    ['Jumlah liter', `SUM(${R('E')})`, withL.reduce((s, e) => s + Number(e.liters), 0), XL.L, ''],
    ['Purata RM / liter', `IFERROR(SUMIFS(${R('G')},${R('E')},">0")/SUM(${R('E')}),0)`, withL.length ? sumAmt(withL) / withL.reduce((s, e) => s + Number(e.liters), 0) : 0, '0.000', 'Hanya entri yang ada liter'],
    ['Perlu claim (RM)', `SUMIFS(${R('G')},${R('L')},"Ya")`, sumAmt(E.filter((e) => e.needs_claim)), XL.RM, ''],
    ['  Dah claim (RM)', `SUMIFS(${R('G')},${R('M')},"Dah Claim")`, sumAmt(E.filter((e) => claimLbl(e) === 'Dah Claim')), XL.RM, ''],
    ['  Belum claim (RM)', `SUMIFS(${R('G')},${R('M')},"Belum Claim")`, sumAmt(E.filter((e) => claimLbl(e) === 'Belum Claim')), XL.RM, ''],
    ['Entri tanpa resit', `COUNTIFS(${R('J')},"Tiada")`, E.filter((e) => !hasReceipt(e)).length, '0', ''],
    ['Entri dipadam / dipulihkan', `COUNTA('Entri Dipadam'!$A$6:$A$${dL})`, A.delRows.length, '0', 'Sheet Entri Dipadam'],
    ['Perubahan direkod (log)', `COUNTA('Log Perubahan'!$B$6:$B$${uL})`, A.logRows.length, '0', 'Sheet Log Perubahan'],
  ]
  const totRow = r0 + 3
  ctrl.forEach(([k, f, v, fmt, note], n) => {
    const r = ws0.getRow(r0 + 2 + n)
    r.getCell(1).value = k; r.getCell(2).value = { formula: f, result: v }; r.getCell(2).numFmt = fmt; r.getCell(3).value = note
    ;[1, 2, 3].forEach((c) => { r.getCell(c).border = XL.border; r.getCell(c).font = c === 3 ? XL.note : XL.font })
  })
  r0 = r0 + 2 + ctrl.length + 1
  ws0.getCell(`A${r0}`).value = 'B. Pemeriksaan automatik'; ws0.getCell(`A${r0}`).font = XL.h2
  xlHeader(ws0, r0 + 1, ['Pemeriksaan', 'Bil. isu', 'Penerangan'])
  CHECKS.forEach(([c, desc], n) => {
    const i = r0 + 2 + n, r = ws0.getRow(i)
    r.getCell(1).value = c
    r.getCell(2).value = { formula: `COUNTIFS(Pengecualian!$B$6:$B$${eL},A${i})`, result: A.exc.filter((x) => x.check === c).length }
    r.getCell(3).value = desc
    ;[1, 2, 3].forEach((k) => { r.getCell(k).border = XL.border; r.getCell(k).font = k === 3 ? XL.note : XL.font })
    if (r.getCell(2).value.result) r.getCell(2).fill = XL.warn
  })
  const cEnd = r0 + 1 + CHECKS.length, tr = ws0.getRow(cEnd + 1)
  tr.getCell(1).value = 'Jumlah isu'; tr.getCell(2).value = { formula: `SUM(B${r0 + 2}:B${cEnd})`, result: A.exc.length }
  ;[1, 2, 3].forEach((k) => { tr.getCell(k).font = XL.bold; tr.getCell(k).fill = XL.total; tr.getCell(k).border = XL.border })
  r0 = cEnd + 3
  ws0.getCell(`A${r0}`).value = 'C. Pengesahan'; ws0.getCell(`A${r0}`).font = XL.h2
  ws0.getCell(`A${r0 + 1}`).value = 'Isi bahagian kuning selepas semakan.'; ws0.getCell(`A${r0 + 1}`).font = XL.note
  xlHeader(ws0, r0 + 2, ['Peranan', 'Nama', 'Jawatan', 'Tarikh', 'Tandatangan'])
  ;['Disediakan oleh', 'Disemak oleh', 'Diluluskan oleh'].forEach((role, n) => {
    const r = ws0.getRow(r0 + 3 + n); r.height = 28
    r.getCell(1).value = role
    for (let c = 1; c <= 5; c++) { r.getCell(c).border = XL.border; r.getCell(c).font = c === 1 ? XL.bold : XL.font; if (c > 1) r.getCell(c).fill = XL.input }
  })
  xlWidths(ws0, [34, 18, 52, 14, 22]); xlPage(ws0, 0)
  ws2.getCell(`D${bt + 3}`).value = { formula: `G${bt}-'Ringkasan Audit'!B${totRow}`, result: 0 }
  ws2.getCell(`D${bt + 3}`).numFmt = XL.RM; ws2.getCell(`D${bt + 3}`).font = XL.bold

  // ---- Nota ----
  const ws6 = wb.addWorksheet('Nota')
  xlTitle(ws6, 'Nota, definisi dan had', 'Baca sebelum menggunakan laporan ini.')
  xlHeader(ws6, 4, ['Perkara', 'Penerangan'])
  const notes = [
    ['Sumber', 'Data dibaca terus dari database (Supabase PenyuTrack) semasa laporan dijana. Laporan hanya boleh dijana oleh admin (dengan MFA).'],
    ['Tempoh', `Entri dengan tarikh beli ${tempoh}. Log Perubahan dan entri dipadam: perubahan yang berlaku dalam tempoh yang sama.`],
    ['ID Rujukan', '8 aksara pertama ID unik entri. Gunakan untuk mencari entri yang sama dalam app dan sheet lain.'],
    ['Cap Jari Resit', 'SHA-256 fail resit (8 aksara pertama). Jika fail resit ditukar, cap jari berubah.'],
    ['Liter & RM/liter', 'Liter diisi oleh resit Setel atau oleh pengguna. Untuk resit Setel, jumlah ialah amaun dibayar selepas subsidi BUDI.'],
    ['Tarikh Claim', 'Direkod oleh database bila status ditukar ke Dah Claim; tidak boleh diubah dari app. Claim sebelum 01/11/2026 tiada tarikh.'],
    ['Lewat (hari)', 'Tarikh direkod − tarikh beli. Lebih 7 hari ditanda "Direkod lewat".'],
    ['Pemeriksaan', CHECKS.map(([c, d]) => `${c}: ${d}`).join(' · ')],
    ['Diubah selepas direkod', 'Hanya perubahan pada tarikh, jenis, jumlah, liter, stesen, nota, resit atau perlu claim oleh pengguna. Tanda claim, padam/pulih dan perubahan "Sistem (migration)" tidak dikira.'],
    ['Log Perubahan', 'Direkod oleh trigger database dan bermula 01/11/2026. Perubahan sebelum tarikh itu tiada dalam log. "Sistem (migration)" = kemas kini struktur/data oleh pentadbir sistem.'],
    ['Had: odometer', 'Odometer tidak dilaporkan; jarak/kilometer kereta akan direkod dalam modul berasingan.'],
  ]
  notes.forEach(([k, v], n) => {
    const r = ws6.getRow(5 + n); r.getCell(1).value = k; r.getCell(2).value = v
    r.getCell(1).font = XL.bold; r.getCell(2).font = XL.font; r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    ;[1, 2].forEach((c) => { r.getCell(c).border = XL.border })
  })
  xlWidths(ws6, [24, 110]); xlPage(ws6, 4)
  // Pengawal: nombor tidak sah (NaN/Infinity) membuat Excel melaporkan fail rosak.
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => {
    const v = c.value, n = v && typeof v === 'object' && 'formula' in v ? v.result : v
    if (typeof n === 'number' && !Number.isFinite(n)) throw new Error(`Nilai tidak sah di ${ws.name}!${c.address}`)
  })))
  return { wb, summary: { entries: E.length, issues: A.exc.length, log: A.logRows.length, deleted: A.delRows.length } }
}
