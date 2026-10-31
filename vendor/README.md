# vendor/ — library pihak ketiga

Semua library JavaScript/CSS disimpan dalam repo ini dengan **versi tetap**.
App tidak memuat kod dari CDN luar, supaya:

- versi tidak berubah sendiri tanpa diuji,
- app tetap jalan walaupun CDN ditutup atau down,
- kod jahat dari CDN yang digodam tidak boleh masuk.

Satu-satunya sumber luar yang tinggal ialah Google Fonts (jika gagal, browser
guna font sistem; app tetap berfungsi).

| Folder | Versi | Diguna oleh | Sumber asal | Lesen |
|---|---|---|---|---|
| `supabase-js-2.117.3/` | 2.117.3 | `shared/auth.js` (semua halaman) | npm `@supabase/supabase-js`, dibundle jadi satu fail ESM dengan esbuild | MIT |
| `chartjs-4.4.4/` | 4.4.4 | Penyu (graf) | npm `chart.js` → `dist/chart.umd.js` | MIT |
| `sheetjs-0.20.3/` | 0.20.3 | Penyu (baca Excel) | `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` → `dist/xlsx.full.min.js` | Apache-2.0 |
| `jszip-3.10.1/` | 3.10.1 | Penyu (export Excel ikut template) | npm `jszip` → `dist/jszip.min.js` | MIT |
| `pptxgenjs-3.12.0/` | 3.12.0 | Penyu (export PowerPoint) | npm `pptxgenjs` → `dist/pptxgen.bundle.js` | MIT |
| `pdfjs-4.10.38/` | 4.10.38 | Minyak (baca resit Setel) | npm `pdfjs-dist` → `legacy/build/` | Apache-2.0 |
| `tailwind-3.4.19/` | 3.4.19 | Penyu (`penyu/tailwind.css`) | npm `tailwindcss` (CLI) | MIT |

SheetJS 0.18.5 (versi npm terakhir) ada kelemahan keselamatan
CVE-2023-30533 dan CVE-2024-22363; 0.20.3 dari cdn.sheetjs.com membaikinya.
Sebelum ditukar, 0.20.3 diuji membaca ketiga-tiga template Excel dengan hasil
sama persis seperti 0.18.5.

## Kemas kini library

1. Muat turun versi baharu dari sumber dalam jadual di atas.
2. Letak dalam folder baharu bernama `<nama>-<versi>/` bersama fail LICENSE.
3. Tukar laluan dalam kod yang menggunakannya (cari nama folder lama).
4. Uji semua halaman yang berkaitan, kemudian padam folder lama.

Contoh supabase-js:

```bash
mkdir /tmp/sb && cd /tmp/sb && npm init -y
npm i @supabase/supabase-js@<versi> esbuild
echo "export * from '@supabase/supabase-js'" > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --minify --platform=browser \
  --target=es2020 --legal-comments=eof --outfile=supabase-js.min.mjs
```

## Bina semula `penyu/tailwind.css`

Penyu guna kelas Tailwind. CSS dibina dari kelas yang ada dalam
`penyu/index.html`. **Selepas menambah kelas Tailwind baharu**, bina semula:

```bash
mkdir /tmp/tw && cd /tmp/tw && npm init -y && npm i tailwindcss@3.4.19
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > in.css
echo "module.exports={content:['<repo>/penyu/index.html']}" > tailwind.config.js
npx tailwindcss -c tailwind.config.js -i in.css -o <repo>/penyu/tailwind.css --minify
```

Tulis nama kelas penuh dalam kod (cth `'text-emerald-300'`), jangan cantum
(`'text-' + warna`), supaya pembina CSS dapat menjumpainya.
