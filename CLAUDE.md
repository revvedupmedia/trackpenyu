# Cara kerja Claude dalam repo ini

Portal LPP (Lembaga Pengurusan Penyu): laman statik di GitHub Pages
(`https://revvedupmedia.github.io/trackpenyu/`) + Supabase projek **PenyuTrack**
(`oatbghgoxedccxdjwalt`). Mesti tahan 10–15 tahun. Baca `README.md` dahulu:
ia menerangkan app, setup, migration, ujian dan cara pindah.

Pemilik bercakap Bahasa Melayu dan bukan pengaturcara: balas dalam Bahasa
Melayu yang ringkas, terangkan kesan kepada staf, bukan butiran teknikal.

## Aliran perubahan

1. Branch baharu dari `main` → commit → PR. Jangan push terus ke `main`.
2. Sebelum push: jalankan ujian berkaitan (lihat README → Ujian automatik).
3. Laporkan keputusan CI, kemudian **tunggu pemilik kata "merge"**. Jangan
   merge sendiri.
4. **Selepas merge, semak laman sebenar sendiri dan terus beritahu pemilik
   bila sudah live** (cth versi `APP_VERSION` di laman atau fail baharu boleh
   dibuka). Pemilik tidak perlu bertanya.
5. Setiap perubahan app: naikkan `APP_VERSION` dalam `shared/auth.js`.
   Kelas Tailwind baharu dalam Penyu: bina semula `penyu/tailwind.css`.

## Keselamatan: wajib dalam SETIAP perubahan

Matlamat pemilik: elak digodam. Tiada sistem 100% kebal; kerja kita ialah
menutup setiap pintu yang boleh ditutup dan tidak pernah melemahkan yang ada.
Sebelum buka PR, semak diff terhadap senarai ini dan nyatakan dalam PR apa
yang disemak:

- **Akses ditentukan oleh database, bukan app.** Jadual baharu: RLS hidup,
  polisi ikut peranan, ujian akses dalam `tests/sql/` (staf/kerani/admin/
  tanpa log masuk). Tiada polisi `using (true)` untuk data sebenar.
- **Fungsi `SECURITY DEFINER`**: semak pemanggil di dalam fungsi, ada
  `set search_path`, tutup daripada `anon` jika tidak perlu
  (`tests/sql/fungsi.sql`).
- **Teks dari pengguna/database** dimasukkan ke HTML hanya melalui `esc()`
  (elak XSS). Jangan `innerHTML` data mentah.
- **Fail sensitif** (resit) dalam bucket persendirian + signed URL sahaja.
- **Rahsia**: hanya kunci awam (publishable/anon) dalam kod. Tiada
  `service_role`, kata laluan atau token dalam repo, log atau chat.
- **Library pihak ketiga**: versi tetap dalam `vendor/`; semak CVE sebelum
  tambah atau naik taraf. Tiada skrip dari CDN luar.
- **Jangan lemahkan**: MFA admin, log keluar automatik, sekatan staf
  dinyahaktif, RLS, ujian sedia ada. Jangan langkau atau matikan ujian.
- **Selepas perubahan database**: jalankan Supabase Security Advisor
  (baca sahaja) dan laporkan sebarang amaran baharu kepada pemilik.
- Perubahan yang menyentuh log masuk, peranan, RLS atau fungsi: jalankan
  semakan keselamatan diff (`/security-review`) sebelum PR.
- Jumpa kelemahan (walaupun di luar tugas semasa): beritahu pemilik segera
  dengan cadangan pembaikan; jangan diamkan.

## Database (Supabase)

- Sentuh projek **PenyuTrack sahaja**. Projek lain dalam akaun (cth
  `minyak-tracker`, `revvedupmedia's Project`) jangan diusik
  (`.claude/hooks/hanya-penyutrack.mjs` menyekatnya).
- **Baca** (semak struktur, polisi, log, advisor) boleh tanpa tanya.
- **Apa-apa yang mengubah** database, Storage atau Auth (SQL tulis, padam,
  cipta/hentikan projek): minta kebenaran pemilik dahulu, setiap kali.
- Perubahan struktur: fail `migration-*.sql` baharu dalam repo + ujian dalam
  `tests/sql/`, melalui PR. Kemas kini senarai migration dalam README dan
  `tests/sql/run.sh`. Jadual baharu: tambah ke `shared/backup.js`.

## Keputusan pemilik (jangan ubah tanpa bertanya)

- Log masuk staf mesti mudah: **MFA untuk admin sahaja**, bukan kerani/staf.
- Notis PDPA dan pelayan sendiri tidak diperlukan.
- Supabase Pro, akaun organisasi LPP dan domain sendiri: menunggu bajet /
  kelulusan lembaga. Akaun sekarang ialah akaun peribadi pemilik.

## Data sebenar

- Jangan commit fail backup, fail import, emel staf atau resit. Ujian guna
  data rekaan sahaja (`tests/fixtures/`, `tests/sql/data-contoh.sql`).
- Jangan minta atau simpan kunci `service_role` / kata laluan dalam repo
  atau chat.
