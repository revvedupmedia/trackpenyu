-- Adds DELETE permissions — previously missing entirely, meaning RLS
-- silently blocked every delete attempt (RLS denies by default when no
-- policy matches the command). Staff can delete only their own entries;
-- admin can delete any.

create policy "delete own daily entries" on daily_entries
  for delete using (created_by = auth.uid() or is_admin());

create policy "delete own nest records" on nest_records
  for delete using (created_by = auth.uid() or is_admin());
