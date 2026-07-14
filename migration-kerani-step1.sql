-- LANGKAH 1 daripada 2 — RUN FAIL INI DULU, SENDIRIAN.
-- (Postgres tidak benarkan nilai enum baru digunakan dalam transaksi
-- yang sama ia dicipta, jadi langkah 2 mesti run berasingan selepas ini.)

alter type staff_role add value if not exists 'kerani';
