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
