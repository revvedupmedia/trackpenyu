// Senarai jadual yang dimasukkan dalam Backup Data (Portal) dan dipulihkan oleh
// alat/pulih-backup.mjs. Susunan = susunan pulih (staff_profiles dahulu).
// Ujian tests/sql/run.sh GAGAL jika database ada jadual yang tiada di sini:
// tambah setiap jadual baharu ke senarai ini.
export const BACKUP_TABLES = [
  'staff_profiles',
  'daily_entries',
  'nest_records',
  'monthly_summaries',
  'monthly_hatch',
  'monthly_targets',
  'targets',
  'minyak_entries',
  'minyak_settings',
  'app_settings',
  'notification_rules',
  'import_log',
  'import_undo',
  'login_log',
  'daily_entries_audit',
  'nest_records_audit',
  'minyak_entries_audit',
  'staff_audit',
  'client_errors',
]

// Format fail backup. Naikkan jika bentuk JSON berubah (alat pulih menyemaknya).
export const BACKUP_FORMAT = 2
