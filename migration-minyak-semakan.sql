-- Semakan Data & pencegahan pendua untuk Minyak Tracker.
-- Run SELEPAS migration-minyak-setel.sql.
--
-- deleted_at / deleted_by : padam boleh dipulihkan (entri tidak hilang terus).
-- dup_ok                  : entri sudah disemak manusia dan disahkan BUKAN pendua
--                           walaupun tarikh, jenis dan jumlah sama dengan entri lain.
-- receipt_hash            : cap jari (SHA-256) fail resit. Resit yang sama
--                           tidak boleh digunakan untuk dua entri.

alter table minyak_entries add column if not exists deleted_at timestamptz;
alter table minyak_entries add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table minyak_entries add column if not exists dup_ok boolean not null default false;
alter table minyak_entries add column if not exists receipt_hash text;

create index if not exists idx_minyak_entries_live on minyak_entries (entry_date) where deleted_at is null;
create index if not exists idx_minyak_entries_receipt_hash on minyak_entries (receipt_hash) where receipt_hash is not null;

-- Nombor invois Setel unik hanya antara entri yang belum dipadam, supaya resit
-- boleh diimport semula selepas entri lama dipadam.
drop index if exists uq_minyak_entries_receipt_ref;
create unique index if not exists uq_minyak_entries_receipt_ref
  on minyak_entries (receipt_ref) where receipt_ref is not null and deleted_at is null;
