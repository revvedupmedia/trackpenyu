# Penyu Tracker

Sistem rekod pendaratan penyu dan kutipan telur untuk tiga pulau:
**PTB**, **PTK** dan **PSB**.

Seluruh app ada dalam satu fail `index.html`. Tiada npm dan tiada build step.
Library dimuat dari CDN, dan data disimpan dalam Supabase. Deploy dengan
push ke GitHub sahaja.

## Ciri-ciri

- **Login ikut pulau** dengan tiga peranan:
  - `staff`: lihat dan masukkan data pulau sendiri sahaja
  - `admin`: semua pulau, tukar sasaran, tab Admin
  - `kerani`: lihat-sahaja semua pulau dan boleh eksport, tapi tak boleh
    tambah, ubah atau padam data
- **Entri**: Entri Harian (jumlah sehari ikut RAM LPP/SFC, sama format
  dengan template Excel) dan Entri Individu (satu rekod setiap penyu atau
  sarang). Ada ringkasan sebelum hantar, kawalan anti-pendua, dan semakan
  penyu/telur.
- **Log**: senarai entri yang boleh diedit atau dipadam. Rekod yang
  dipadam disimpan salinannya, dan semua perubahan masuk audit log.
- **Dashboard**: jumlah penyu dan telur, % sasaran tahunan dan bulanan,
  kadar menetas, telur buruk, graf bulanan (Chart.js), perbandingan dengan
  mana-mana tahun, dan paparan tahun lama. Ada pilihan Gabung LPP + SFC.
- **Import Data Lama** (1990–2025) dari Excel: pratonton sebelum import,
  amaran tarikh tak wujud, dan undo ikut batch. Rekod app yang tiada dalam
  fail akan dipadam supaya jumlah tidak berganda.
- **Export Excel** ikut template setiap pulau (`assets/template-*.xlsx`).
- **Mod Pembentangan**: slaid interaktif dengan animasi penyu, 5 jenis
  peralihan dan label angka pada graf. Teks pembentangan diedit di tab
  Admin, dan slaid boleh dieksport ke **PowerPoint** (PptxGenJS).
- **Lupa kata laluan**: reset melalui emel, kemudian skrin untuk set kata
  laluan baharu.
- **Offline**: kalau line putus, entri disimpan dalam browser dan dihantar
  bila online semula. App boleh dipasang ke skrin telefon (PWA melalui
  `manifest.json` dan `sw.js`).
- **Admin**: sasaran tahunan dan bulanan ikut pulau, upload video latar,
  sejarah login staf.
- Mod gelap/cerah, video latar belakang, gambar setiap pulau.

## Struktur fail

| Fail | Fungsi |
|---|---|
| `index.html` | Seluruh app: HTML, CSS (Tailwind CDN) dan JavaScript |
| `manifest.json`, `sw.js` | PWA: ikon app dan cache untuk guna offline |
| `schema.sql` | Struktur asal database Supabase |
| `migration-*.sql` | Perubahan database yang ditambah kemudian |
| `fix-*.sql` | Pembaikan polisi RLS dan storage |
| `assets/` | Logo, ikon, gambar pulau, `background.mp4`, template Excel |

Library CDN: Supabase JS, Tailwind, Chart.js, SheetJS (`xlsx`), PptxGenJS
dan JSZip.

## Setup (sekali sahaja)

### 1. Supabase

Dalam Supabase → SQL Editor, run fail-fail ini **ikut urutan**:

1. `schema.sql`
2. `fix-rls-recursion.sql`
3. `fix-storage-upload.sql`
4. `migration-monthly-and-loginlog.sql`
5. `migration-daily-entries.sql`
6. `migration-dashboard-rpc.sql`
7. `migration-dashboard-per-island.sql`
8. `fix-rls-recursion-2.sql`
9. `migration-targets-per-island.sql`
10. `fix-insert-admin-bypass.sql`
11. `migration-delete-policies.sql`
12. `migration-kerani-step1.sql` (run **sendirian**, kemudian baru langkah 2)
13. `migration-kerani-step2.sql`
14. `migration-legacy-and-undo.sql`
15. `migration-monthly-penyu.sql`

Kemudian:

1. Authentication → Add User → cipta akaun login.
2. Table Editor → `staff_profiles` → tambah baris dengan `id` pengguna
   tersebut, nama, pulau, dan `role` (`staff`, `admin` atau `kerani`).

URL dan anon key Supabase diletakkan di bahagian atas blok
`<script type="module">` dalam `index.html` (`SUPABASE_URL` dan
`SUPABASE_ANON_KEY`).

### 2. Deploy ke GitHub Pages

Repo → Settings → Pages → Source → **Deploy from a branch** → Branch
`main`, folder `/ (root)` → Save.

App akan live dalam ~1 minit di `https://revvedupmedia.github.io/trackpenyu/`.

### 3. Kemas kini

Edit `index.html` (di GitHub web editor atau secara lokal), kemudian:

```bash
git add .
git commit -m "kemas kini"
git push
```

Tiada build. Push dan terus live. Kalau ada perubahan database, tambah
fail `migration-*.sql` baharu dan run dalam Supabase SQL Editor.

## Had semasa

- Pengurusan staf (tambah akaun, tukar pulau atau peranan) masih dibuat
  melalui dashboard Supabase, bukan dalam app.
