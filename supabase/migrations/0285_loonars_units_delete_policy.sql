-- ============================================================================
-- MK Connect — 0285: loonars_units gets a DELETE policy (guarded)
--
-- Real bug: 0202 gave loonars_units RLS policies for select/insert/update
-- but never delete, so the "Hapus unit" button in /siteplan/admin never
-- deleted anything -- PostgREST returns success with 0 rows affected when
-- RLS filters every row out, so the app reported success while the unit
-- stayed (found when the owner tried to remove AVARA-08..10 during 0284).
--
-- Guarded, not just siteplan.manage: every child table (purchases, fee
-- requests, booking receipts, akad schedules, positions) is ON DELETE
-- CASCADE, so an unguarded delete of a sold unit would silently wipe its
-- whole financial history. Only a unit that is still 'tersedia' and has
-- never had a purchase row (of any status) can be deleted.
-- ============================================================================

create policy loonars_units_delete on public.loonars_units
  for delete to authenticated
  using (
    public.app_has_permission('siteplan.manage')
    and status = 'tersedia'
    and not exists (
      select 1 from public.loonars_unit_purchases p where p.unit_id = loonars_units.id
    )
  );
