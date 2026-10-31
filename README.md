# Portal LPP

Portal aplikasi staf Lembaga Pengurusan Penyu. Staf log masuk sekali, kemudian
pilih app yang dibenarkan untuk peranan mereka.

```
Landing (index.html) → Log masuk (login.html) → Portal (portal.html) → Penyu Tracker / Minyak Tracker / ...
```

Setiap halaman ialah fail HTML sendiri. Tiada npm dan tiada build step.
Library disimpan dalam repo (`vendor/`, versi tetap), data disimpan dalam **satu** projek Supabase, dan
laman di-host di GitHub Pages. Deploy dengan push ke GitHub sahaja.

## Aplikasi & akses

| App | Folder | Peranan yang boleh guna |
|---|---|---|
| Penyu Tracker | `penyu/` | `staff`, `kerani`, `admin` |
| Minyak Tracker | `minyak/` | `kerani`, `admin` |

Senarai ini ditetapkan dalam `shared/auth.js` (`APPS`). Portal hanya
memaparkan app yang dibenarkan. Sekatan data sebenar dibuat oleh **RLS dalam
Supabase**, jadi staf yang buka `/minyak/` terus tetap tidak dapat apa-apa data.
Staf yang hanya ada satu app akan terus dibawa ke app tersebut selepas log masuk.

### Penyu Tracker

Rekod pendaratan penyu dan kutipan telur untuk tiga pulau: **PTB**, **PTK**
dan **PSB**.

- **Peranan:**
  - `staff`: lihat dan masukkan data pulau yang ditugaskan dalam profil sahaja
  - `admin`: semua pulau, tukar sasaran, tab Admin
  - `kerani`: lihat-sahaja semua pulau dan boleh eksport, tapi tak boleh
    tambah, ubah atau padam data
- Admin dan kerani pilih pulau selepas masuk app. Ketik lencana pulau di bar
  bawah untuk tukar pulau.
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
  amaran tarikh tak wujud, dan undo ikut batch.
- **Export Excel** ikut template setiap pulau (`assets/template-*.xlsx`).
- **Mod Pembentangan**: slaid interaktif dengan animasi penyu dan label
  angka pada graf. Boleh dieksport ke **PowerPoint** (PptxGenJS).
- **Admin**: sasaran tahunan dan bulanan ikut pulau, sejarah login staf.

### Minyak Tracker

Rekod mileage dan minyak (Diesel & RON95 bot) bersama resit.

- Dashboard gauge (pecahan Diesel vs RON95), jumlah mileage, jumlah belum claim.
- Tambah entri: odometer mula/akhir (jarak dikira automatik), amount, resit
  (gambar/PDF), tanda perlu claim.
- Paparan **Bulan / Tahun**: paparan Tahun tunjuk ringkasan setiap bulan.
- **Import resit Setel (PDF)**: pilih banyak PDF sekali gus; app baca tarikh,
  jenis minyak, jumlah dibayar, liter, stesen dan subsidi BUDI. Semua dipapar
  untuk disemak dahulu (anti-pendua ikut nombor invois, amaran "mungkin pendua"
  jika entri tarikh/jenis/jumlah sama sudah ada, tanda "Perlu claim"), kemudian
  sahkan dengan kiraan undur 5 saat. Pembaca: `minyak/setel.js`.
- **Pencegahan ralat** semasa simpan: amaran jika entri tarikh/jenis/jumlah sama
  sudah ada (perlu tekan Simpan sekali lagi untuk sahkan), resit yang sama
  (cap jari SHA-256) tidak boleh digunakan dua kali, tarikh masa depan ditolak.
- **🩺 Semakan Data**: imbas semua entri untuk resit sama, kemungkinan pendua,
  odometer tidak sah, tarikh masa depan, jumlah luar biasa (>3× biasa), claim
  tertunggak >30 hari, resit lama belum dipindah, entri tanpa resit/pemilik.
  Lencana pada butang tunjuk bilangan isu. Ada "Bandingkan resit", "Bukan
  pendua", dan senarai entri dipadam untuk dipulihkan.
- **Padam boleh dipulihkan**: entri ditanda `deleted_at`, resit disimpan.
- Sejarah ikut bulan, butiran entri, tandakan dah claim.
- Kerani boleh ubah/padam entri sendiri; admin boleh ubah/padam semua.
- Resit disimpan dalam bucket **private** `minyak-receipts` dan dibuka guna
  pautan sementara (1 jam).
- **⬇ Excel**: eksport rekod tempoh semasa (bulan/tahun & penapis) dengan
  sheet Ringkasan ikut bulan dan sheet Rekod, sedia untuk proses claim.
- Gambar resit dari kamera dikecilkan sebelum upload (sisi panjang 2000px,
  JPEG 85%; ~3–5 MB → ~150–500 KB, teks kekal jelas). PDF tidak diubah.
- **Admin** (butang ⚙️): video latar, **📜 Log Perubahan** (siapa tambah,
  ubah, padam atau pulihkan entri), dan **Pindah Resit Lama**.

### Portal: Pentadbiran (admin sahaja)

- **💾 Backup Data**: satu fail ZIP mengandungi semua jadual dalam Excel
  (untuk dibaca) dan JSON (salinan lengkap). Portal ingatkan jika backup
  terakhir lebih 30 hari. Gambar resit tidak termasuk.
- **🐞 Log Ralat**: ralat JavaScript dari peranti staf (30 terkini).

### Keselamatan

- **MFA admin**: akaun admin perlu kod 6 digit dari app Authenticator
  (Google/Microsoft Authenticator, percuma) selepas kata laluan. Kali pertama,
  app tunjuk kod QR untuk didaftarkan. Tetapan: `MFA_WAJIB_ADMIN` dalam
  `shared/auth.js`. **Hilang telefon:** admin lain buang faktor MFA akaun itu di
  Supabase → Authentication → Users → (pengguna) → MFA, kemudian pengguna
  daftar semula semasa log masuk. Sebab itu, sekurang-kurangnya 2 admin.
- **Log keluar automatik** selepas 30 minit tanpa aktiviti (amaran 1 minit
  sebelum). Tetapan: `IDLE_MINUTES` dalam `shared/auth.js`.
- Nombor versi app: `APP_VERSION` dalam `shared/auth.js` (naikkan setiap deploy).

## Struktur fail

| Fail | Fungsi |
|---|---|
| `index.html` | Landing page |
| `login.html` | Log masuk, lupa kata laluan, tetapkan kata laluan baharu |
| `portal.html` | Pilih app selepas log masuk |
| `shared/auth.js` | Klien Supabase, senarai app & peranan, semakan akses |
| `shared/portal.css` | Gaya landing, login dan portal |
| `penyu/` | Penyu Tracker (`index.html`, `manifest.json`) |
| `minyak/` | Minyak Tracker (`index.html`, `app.js`, `setel.js`, `style.css`, `manifest.json`, `icons/`) |
| `vendor/` | Semua library pihak ketiga, versi tetap (lihat `vendor/README.md` untuk versi & cara kemas kini) |
| `penyu/tailwind.css` | CSS Tailwind statik untuk Penyu (bina semula selepas tambah kelas baharu) |
| `sw.js` | Satu service worker untuk seluruh laman (network-first) |
| `manifest.json` | PWA portal (setiap app juga ada manifest sendiri) |
| `schema.sql`, `migration-*.sql`, `fix-*.sql` | Struktur database Supabase |
| `assets/` | Logo, ikon, video latar, template Excel |

## Setup (sekali sahaja)

### 1. Supabase

**Bina database baru (cara disyorkan):** dalam Supabase → SQL Editor, run
**`schema-snapshot-2026-10-31.sql`** (atau snapshot terkini), kemudian
migration yang lebih baru daripada snapshot itu:

1. `schema-snapshot-2026-10-31.sql` — struktur lengkap database sebenar
2. `migration-fix-audit-dan-akses.sql`
3. `migration-minyak-audit.sql` — Log Perubahan Minyak
4. `migration-log-ralat.sql` — Log Ralat
5. `migration-mfa-admin-wajib.sql` — **hanya selepas semua admin sudah
   sediakan app Authenticator**: database sendiri hanya beri kuasa admin
   kepada sesi yang lepasi MFA

Fail `schema.sql`, `migration-*.sql` dan `fix-*.sql` yang lain ialah
**sejarah** perubahan. Ia tidak lengkap (beberapa jadual & fungsi dahulu
dicipta terus dalam Supabase) — jangan guna untuk bina database baru.
Lihat **Snapshot struktur database** di bawah.

Kemudian:

1. Authentication → Add User → cipta akaun login.
2. Table Editor → `staff_profiles` → tambah baris dengan `id` pengguna
   tersebut, nama, pulau, dan `role` (`staff`, `admin` atau `kerani`).
3. Authentication → URL Configuration → **Redirect URLs** → tambah
   `https://revvedupmedia.github.io/trackpenyu/login.html` (pautan reset
   kata laluan kembali ke halaman ini).

URL dan anon key Supabase ada dalam `shared/auth.js`.

### 2. Deploy ke GitHub Pages

Repo → Settings → Pages → Source → **Deploy from a branch** → Branch
`main`, folder `/ (root)` → Save.

Laman live dalam ~1 minit:

- Landing: `https://revvedupmedia.github.io/trackpenyu/`
- Penyu Tracker: `https://revvedupmedia.github.io/trackpenyu/penyu/`
- Minyak Tracker: `https://revvedupmedia.github.io/trackpenyu/minyak/`

### 3. Kemas kini

Edit fail (di GitHub web editor atau secara lokal), kemudian:

```bash
git add .
git commit -m "kemas kini"
git push
```

Tiada build. Push dan terus live. Kalau ada perubahan database, tambah
fail `migration-*.sql` baharu dan run dalam Supabase SQL Editor.

## Snapshot struktur database

Fail migration lama dalam repo **tidak lengkap**: jadual `app_settings`,
`import_log`, `import_undo`, `monthly_hatch`, fungsi
`delete_entries_with_backup()`, `undo_import()`, `penyu_month_stats()`, serta
versi terkini `get_dashboard_totals()` & `get_multi_year_monthly()` dicipta
terus dalam Supabase. Snapshot 2026-10-31 mengandungi semuanya.

`export-schema.sql` membaca struktur database sebenar (baca sahaja) dan
menghasilkan satu skrip lengkap: enum, jadual, kekangan, indeks, fungsi,
trigger, RLS, polisi, bucket storage dan kebenaran. Tiada data.

1. Supabase → SQL Editor → tampal `export-schema.sql` → Run.
2. Salin sel `schema_sql` (atau Export → CSV) dan simpan dalam repo sebagai
   `schema-snapshot-<tarikh>.sql`.
3. Ulang selepas setiap perubahan database. Setiap perubahan baharu tetap
   ditulis sebagai fail `migration-*.sql` dalam repo dahulu, bukan terus
   dalam SQL Editor.

Untuk bina semula di database kosong (Supabase atau PostgreSQL lain), run
snapshot terkini. PostgreSQL bukan Supabase perlu sediakan dahulu peranan
`anon`/`authenticated`/`service_role`, skema `auth` (`auth.users`, `auth.uid()`) dan
skema `storage`.

## Tambah app baharu

1. Cipta folder, cth `inventori/index.html`.
2. Tambah app dalam `APPS` di `shared/auth.js` (nama, ikon, peranan).
3. Di atas skrip app: `const { user, profile } = await requireApp('inventori')`.
4. Jadual baharu dalam Supabase mesti ada RLS yang semak peranan (rujuk
   `can_use_minyak()` dalam `migration-minyak.sql`).

## Had semasa

- Pengurusan staf (tambah akaun, tukar pulau atau peranan) masih dibuat
  melalui dashboard Supabase, bukan dalam app.
- Jangan commit fail backup database atau fail import data ke repo. Fail
  tersebut ada emel dan password hash pengguna.
