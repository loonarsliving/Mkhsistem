-- ============================================================================
-- MK Connect — 0263: Loonars 2 unit prices locked in (owner-supplied)
--
-- Owner's explicit price list for the two Loonars 2 villa types (0261 left
-- harga/tipe NULL deliberately, since the price list wasn't in this
-- repository yet -- it now is):
--   * BANYU-01..10 = 1 bedroom, Rp 420.000.000
--   * AVARA-01..10 = 2 kamar,   Rp 520.000.000
--
-- Scoped strictly to project LNR2 so this can never touch another project's
-- units even if a future project happens to reuse the "AVARA"/"BANYU" row
-- names. tipe is set alongside harga so the admin table
-- (siteplan-admin-panel.tsx) and the purchase/detail views show the villa
-- type, not just a bare price.
--
-- "Kunci" (lock) here means the price is now a real, owner-confirmed figure
-- rather than the earlier placeholder NULL -- not a DB-level restriction on
-- future edits. A siteplan.manage holder can still revise it later (e.g. a
-- price increase) through the existing /siteplan/admin unit form; nothing in
-- this migration removes that capability.
-- ============================================================================

update public.loonars_units u
set harga = 420000000, tipe = '1 Bedroom'
from public.loonars_projects p
where u.project_id = p.id
  and p.kode = 'LNR2'
  and u.blok like 'BANYU-%';

update public.loonars_units u
set harga = 520000000, tipe = '2 Kamar'
from public.loonars_projects p
where u.project_id = p.id
  and p.kode = 'LNR2'
  and u.blok like 'AVARA-%';

do $$
declare
  v_unpriced integer;
begin
  select count(*) into v_unpriced
  from public.loonars_units u
  join public.loonars_projects p on p.id = u.project_id
  where p.kode = 'LNR2' and (u.harga is null or u.tipe is null);

  if v_unpriced <> 0 then
    raise exception 'Expected every LNR2 unit to be priced after this migration, found % still unpriced', v_unpriced;
  end if;
end $$;
