-- Import resit PDF Setel dalam Minyak Tracker.
-- Run SELEPAS migration-minyak.sql.
--
-- receipt_ref = nombor invois Setel (Tax invoice number). Unik, supaya resit
-- yang sama tidak boleh dimasukkan dua kali walaupun diimport serentak oleh
-- dua orang. Entri manual (tanpa resit Setel) biarkan kosong.

alter table minyak_entries add column if not exists receipt_ref text;

create unique index if not exists uq_minyak_entries_receipt_ref
  on minyak_entries (receipt_ref) where receipt_ref is not null;
