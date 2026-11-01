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

- **💾 Backup Data**: satu fail ZIP mengandungi semua jadual + senarai akaun
  login (emel, ID, peranan; **tanpa kata laluan**) dalam Excel (untuk dibaca)
  dan JSON (untuk dipulihkan). Tanda **Termasuk fail** untuk masukkan semua
  resit Minyak & video latar (folder `fail/`). Portal ingatkan jika backup
  terakhir lebih 30 hari. Simpan sekurang-kurangnya satu backup bulanan
  **dengan fail** di luar Supabase (Google Drive pejabat). Cara pulih: lihat
  **Pindah ke Supabase atau GitHub baharu**.
- **🐞 Log Ralat**: ralat JavaScript dari peranti staf (30 terkini).
- **👥 Urus Staf**: senarai semua akaun login (status MFA, log masuk
  terakhir); daftar akaun baharu, tukar nama/pulau/peranan, nyahaktif &
  aktifkan semula (akaun disekat dalam Supabase Auth, rekod lama kekal),
  **Reset MFA** (hilang telefon). Admin tidak boleh turunkan atau nyahaktif
  diri sendiri; setiap perubahan direkod dalam `staff_audit`.

### Keselamatan

- **MFA admin**: akaun admin perlu kod 6 digit dari app Authenticator
  (Google/Microsoft Authenticator, percuma) selepas kata laluan. Kali pertama,
  app tunjuk kod QR untuk didaftarkan. Tetapan: `MFA_WAJIB_ADMIN` dalam
  `shared/auth.js`. **Hilang telefon:** admin lain → Portal → 👥 Urus Staf →
  pengguna itu → **Reset MFA**; pengguna imbas kod QR baharu semasa log masuk. Sebab itu, sekurang-kurangnya 2 admin.
- **Fungsi database**: fungsi `SECURITY DEFINER` (berjalan dengan kuasa penuh)
  mesti menyemak sendiri siapa pemanggil, ada `set search_path`, dan ditutup
  daripada `anon` jika tidak diperlukan sebelum log masuk. Ujian Database
  gagal jika fungsi baharu terlepas (`tests/sql/fungsi.sql`).
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
| `shared/backup.js` | Senarai jadual dalam Backup Data (ujian gagal jika ada jadual tertinggal) |
| `alat/pulih-backup.mjs` | Pulih ZIP backup ke projek Supabase (lihat **Pindah**) |
| `penyu/` | Penyu Tracker (`index.html`, `manifest.json`) |
| `minyak/` | Minyak Tracker (`index.html`, `app.js`, `setel.js`, `style.css`, `manifest.json`, `icons/`) |
| `tests/`, `.github/workflows/ujian.yml` | Ujian automatik (lihat **Ujian automatik**) |
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
6. `migration-urus-staf.sql` — 👥 Urus Staf dalam Portal
7. `migration-urus-staf-fix-ban.sql` — pembaikan nyahaktif (log masuk ralat "Database error querying schema")
8. `migration-keselamatan-fungsi.sql` — statistik Penyu hanya untuk pengguna
   log masuk (staff: pulau sendiri), fungsi ditutup daripada pengguna belum
   log masuk, `search_path` tetap

Fail `schema.sql`, `migration-*.sql` dan `fix-*.sql` yang lain ialah
**sejarah** perubahan. Ia tidak lengkap (beberapa jadual & fungsi dahulu
dicipta terus dalam Supabase) — jangan guna untuk bina database baru.
Lihat **Snapshot struktur database** di bawah.

Kemudian:

1. Authentication → Add User → Create new user (emel + kata laluan
   sementara, tandakan **Auto Confirm User**).
2. Portal → Pentadbiran → **👥 Urus Staf** → tekan akaun "Belum didaftar" →
   isi nama, pulau, peranan → **Daftar Staf**. (Admin pertama sahaja perlu
   didaftar melalui Supabase → Table Editor → `staff_profiles`.)
3. Authentication → URL Configuration → **Redirect URLs** → tambah
   `https://revvedupmedia.github.io/trackpenyu/login.html` (pautan reset
   kata laluan kembali ke halaman ini).
4. Authentication → Attack Protection (atau Providers → Email) → hidupkan
   **Prevent use of leaked passwords**: kata laluan baharu yang pernah bocor di
   internet (semakan HaveIBeenPwned) ditolak. Kata laluan sedia ada tidak
   terjejas. (Ciri ini mungkin memerlukan pelan Supabase Pro.)

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

## Pindah ke Supabase atau GitHub baharu

Semua alamat dalam app adalah relatif, dan alamat Supabase hanya ada di **satu
tempat**: `SUPABASE_URL` & `SUPABASE_ANON_KEY` dalam `shared/auth.js`. Buat
latihan pindah sekali setahun ke projek Supabase percuma yang baharu supaya
langkah ini kekal teruji.

### GitHub (repo ke akaun/organisasi lain)

1. Repo → Settings → **Transfer ownership** → akaun organisasi baharu. Semua
   kod, sejarah, PR dan Actions ikut sekali (GitHub juga ubah hala alamat lama).
   Atau: cipta repo baharu dan `git push --mirror`.
2. Settings → Pages → Branch `main`, `/ (root)` (sama seperti **Deploy**).
3. Settings → Rules → cipta semula ruleset **Lindungi main** (wajib PR +
   3 ujian lulus) jika tidak ikut.
4. Alamat laman berubah (cth `https://<org>.github.io/trackpenyu/`). Kemas kini
   Supabase → Authentication → URL Configuration: **Site URL** & **Redirect
   URLs** (`.../login.html`). Domain sendiri (cth `portal.lpp.gov.my`): tambah
   fail `CNAME` dan tetapkan dalam Settings → Pages.

Tiada perubahan kod diperlukan. Laman juga boleh dihoskan di mana-mana
pelayan fail statik (Netlify, Cloudflare Pages, pelayan sendiri): salin semua
fail apa adanya.

### Supabase (projek baharu)

**Cara A (disyorkan, selagi projek lama masih boleh dibuka):** Supabase →
projek lama → Database → Backups, atau `supabase db dump` (Supabase CLI)
untuk skema `public` + `auth`. Ini membawa kata laluan & MFA sekali; ikut
panduan rasmi Supabase "Migrating within Supabase", kemudian langkah 5–7 di
bawah.

**Cara B (dari ZIP Backup Data — juga jika projek lama sudah tiada):**

1. Cipta projek Supabase baharu.
2. SQL Editor: bina struktur ikut **Setup → 1. Supabase** (snapshot terkini +
   migration selepasnya, termasuk MFA langkah 2 jika digunakan).
3. Extract ZIP backup ke satu folder, kemudian di komputer yang ada Node.js
   18+ dan salinan repo ini:
   ```bash
   node alat/pulih-backup.mjs ~/Backup_PortalLPP_2026-11-01 --url-baharu https://<projek-baharu>.supabase.co > pulih.sql
   ```
   Run `pulih.sql` dalam SQL Editor (fail besar: guna `psql` dengan
   connection string dari Project Settings → Database). Ia memaparkan
   bilangan baris dipulihkan bagi setiap jadual. Selamat diulang.
   Akaun login dicipta semula dengan **ID asal**, jadi semua entri kekal
   terikat pada staf yang betul. Akaun nyahaktif kekal disekat.
4. Fail resit & video latar (backup dengan **Termasuk fail**): Storage →
   pastikan bucket `minyak-receipts` (private) & `app-assets` (public) wujud
   (snapshot menciptanya), kemudian:
   ```bash
   SUPABASE_URL=https://<projek-baharu>.supabase.co SUPABASE_SERVICE_KEY=<service_role key> \
     node alat/pulih-backup.mjs ~/Backup_PortalLPP_2026-11-01 --muat-naik-fail
   ```
   Kunci `service_role` (Project Settings → API) memintas semua kawalan
   akses: guna di komputer sendiri sahaja, jangan simpan dalam repo atau
   hantar melalui chat/emel.
5. `shared/auth.js`: tukar `SUPABASE_URL` & `SUPABASE_ANON_KEY` ke projek
   baharu, naikkan `APP_VERSION`, buka PR seperti biasa.
6. Authentication → URL Configuration: Site URL & Redirect URLs (seperti di
   atas). Authentication → Providers → Email: tetapan sama seperti projek
   lama (SMTP sendiri jika ada).
7. Beritahu semua staf: log masuk → **Lupa kata laluan** (Cara B tidak
   membawa kata laluan). Admin akan diminta imbas kod QR Authenticator
   baharu. Semak Portal → 💾 Backup Data berjalan, dan buat backup pertama.

Yang **tidak** dibawa oleh Cara B: kata laluan, faktor MFA, sesi aktif, log
Supabase Auth. Semua data app, log audit dan fail dibawa.

## Ujian automatik

GitHub menjalankan semua ujian pada setiap push ke `main` (tab **Actions** →
**Ujian**). Merah = ada yang rosak; laman tetap dideploy, jadi semak dan baiki.

| Ujian | Apa yang disemak | Jalan secara lokal |
|---|---|---|
| **Database** (`tests/sql/`) | Bina dari snapshot + migration dalam PostgreSQL sebenar; semakan RLS (staf/kerani/admin/tanpa log masuk), audit, MFA langkah 2, Urus Staf; **setiap jadual ada dalam backup**; backup → `alat/pulih-backup.mjs` → database baharu sama dengan asal; pusingan penuh `export-schema.sql` | `PGHOST=... PGUSER=... bash tests/sql/run.sh` |
| **Pelayar** (`tests/e2e/`) | Landing, login, MFA, log keluar automatik, log ralat, backup, Penyu (semua skrin, library), Minyak (Tahun, penapis, Excel, Semakan Data, pendua, resit dikecilkan, Import Setel) | `cd tests && npm ci && npx playwright test` |
| **Unit** (`tests/unit/`) | Pembaca resit Setel (teks sebenar tanpa data peribadi); alat pulih (SQL & muat naik fail) | `cd tests && npm run unit` |
| **CSS Penyu** | `penyu/tailwind.css` sepadan dengan kelas dalam kod | `bash tests/check-tailwind.sh` |

Ujian pelayar guna Supabase palsu (`tests/fixtures/fake-supabase.mjs`) supaya
tiada data sebenar disentuh; peraturan akses diuji berasingan dalam PostgreSQL.

## Tambah app baharu

1. Cipta folder, cth `inventori/index.html`.
2. Tambah app dalam `APPS` di `shared/auth.js` (nama, ikon, peranan).
3. Di atas skrip app: `const { user, profile } = await requireApp('inventori')`.
4. Jadual baharu dalam Supabase mesti ada RLS yang semak peranan (rujuk
   `can_use_minyak()` dalam `migration-minyak.sql`).
5. Tambah setiap jadual baharu ke `shared/backup.js` (ujian Database gagal
   jika terlupa) dan sebaris data contoh dalam `tests/sql/data-contoh.sql`.

## Had semasa

- Akaun login baharu masih dicipta dalam Supabase → Authentication (Urus
  Staf mendaftar profil selepas itu).
- Jangan commit fail backup database atau fail import data ke repo. Fail
  tersebut ada emel dan password hash pengguna. `.gitignore` menghalang
  `Backup_PortalLPP_*`, `backup-*.json` dan `pulih.sql`.
