// Baca resit PDF dari app Setel (PETRONAS) dan keluarkan maklumat entri minyak.
// pdf.js disimpan dalam repo (vendor/) dengan versi tetap supaya tidak
// bergantung pada CDN luar. Kalau Setel ubah format resit, parseSetelText()
// akan pulangkan ralat (bukan data salah) dan PDF itu ditanda "tak dapat dibaca".
import * as pdfjs from '../vendor/pdfjs-4.10.38/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs-4.10.38/pdf.worker.min.mjs', import.meta.url).href;

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const money = (s) => Number(String(s).replace(/,/g, ''));
const RM = /RM\s*([\d,]+\.\d{2})/;

// Teks halaman, satu baris setiap baris dalam PDF.
export async function pdfText(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = '';
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    for (const it of tc.items) text += it.str + (it.hasEOL ? '\n' : '');
    text += '\n';
  }
  await doc.destroy();
  return text;
}

// => { ok:true, data, warnings[] } atau { ok:false, error }
export function parseSetelText(text) {
  const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!/setel/i.test(text)) return { ok: false, error: 'Bukan resit Setel.' };

  const ref = (text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
  if (!ref) return { ok: false, error: 'Nombor invois tidak dijumpai.' };

  const dm = text.match(/(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!dm) return { ok: false, error: 'Tarikh tidak dijumpai.' };
  const date = `${dm[3]}-${String(MONTHS[dm[2].slice(0, 3).toLowerCase()]).padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  const time = `${dm[4]}:${dm[5]} ${dm[6].toUpperCase()}`;

  const iTop = lines.findIndex(l => /^TOTAL AMOUNT$/i.test(l));
  const topM = iTop >= 0 && (lines[iTop + 1] || '').match(RM);
  const botLine = lines.find(l => /^Total\s+RM/i.test(l));
  const botM = botLine && botLine.match(RM);
  if (!topM && !botM) return { ok: false, error: 'Jumlah bayaran tidak dijumpai.' };
  const amount = money((topM || botM)[1]);

  const iItem = lines.findIndex(l => /\(Pump\b|with Pro-Drive/i.test(l));
  const item = iItem >= 0 ? lines[iItem] : '';
  const itemName = item.replace(/^PETRONAS\s+/i, '').replace(/\s*with Pro-Drive.*$/i, '').replace(/\s*\(Pump.*$/i, '').trim();
  const fuel = /DIESEL/i.test(item) ? 'diesel' : /PRIMAX\s*95|RON\s*95|BUDI\s*95/i.test(item) ? 'ron95' : null;

  const lm = iItem >= 0 && (lines[iItem + 1] || '').match(/([\d.]+)\s*L\s*x\s*RM\s*([\d.]+)/i);
  const liters = lm ? lm[1] : null;
  const pricePerL = lm ? Number(lm[2]) : null;
  const grossM = iItem >= 0 && (lines[iItem + 2] || '').match(RM);
  const gross = grossM ? money(grossM[1]) : null;

  const iSub = lines.findIndex(l => /subsidy/i.test(l));
  let subsidy = null;
  if (iSub >= 0) {
    const sl = lines.slice(iSub + 1, iSub + 4).find(l => /-\s*RM/i.test(l));
    if (sl) subsidy = money(sl.match(RM)[1]);
  }

  const iBot = botLine ? lines.indexOf(botLine) : -1;
  const station = lines.slice(iBot + 1).find(l => /^PETRONAS\s/i.test(l) && l !== item) || '';

  const warnings = [];
  if (topM && botM && money(topM[1]) !== money(botM[1])) warnings.push(`Jumlah atas (RM${topM[1]}) tak sama dengan jumlah bawah (RM${botM[1]}).`);
  if (!fuel) warnings.push(`Jenis minyak tidak dikenali ("${itemName || '?'}"). Sila pilih.`);
  if (liters && pricePerL && gross != null && Math.abs(Number(liters) * pricePerL - gross) > 0.05)
    warnings.push(`Liter × harga (${liters} × RM${pricePerL}) tak sama dengan RM${gross.toFixed(2)}.`);
  if (gross != null && Math.abs((gross - (subsidy || 0)) - amount) > 0.01)
    warnings.push(`Harga pam${subsidy ? ' tolak subsidi' : ''} tak sama dengan jumlah dibayar.`);

  const notes = [liters && `${liters} L`, station, subsidy && `Subsidi BUDI RM${subsidy.toFixed(2)}`].filter(Boolean).join(' · ');
  return { ok: true, warnings, data: { ref: ref.toLowerCase(), date, time, fuel, amount, liters, pricePerL, gross, subsidy, station, itemName, notes } };
}

export async function readSetelPdf(file) {
  try {
    return parseSetelText(await pdfText(file));
  } catch (err) {
    return { ok: false, error: 'PDF tidak dapat dibaca' + (err?.message ? ` (${err.message})` : '') + '.' };
  }
}
