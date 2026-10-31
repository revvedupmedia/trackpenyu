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
- Sejarah ikut bulan, butiran entri, tandakan dah claim.
- Kerani boleh ubah/padam entri sendiri; admin boleh ubah/padam semua.
- Resit disimpan dalam bucket **private** `minyak-receipts` dan dibuka guna
  pautan sementara (1 jam).
- **Admin** (butang ⚙️): video latar, dan **Pindah Resit Lama** dari folder
  backup storage atau terus dari projek Supabase lama.

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
16. `migration-minyak.sql`
17. `migration-minyak-setel.sql`

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
