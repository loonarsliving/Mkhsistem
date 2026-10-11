-- ============================================================================
-- MK Connect — 0281: Loonars 2 siteplan correction -- AVARA/BANYU resized to
-- 6 units each @ Rp420jt, new LUNARA type (2 kamar, Rp600jt, 5 units)
--
-- Owner's correction: AVARA and BANYU keep their names but each should only
-- have 6 units total, both priced Rp420jt (AVARA was wrongly set up as a
-- "2 Kamar" @ Rp520jt type with 10 units; BANYU was already 1 Bedroom @
-- Rp420jt but also had 10 units). The "2 Kamar" designation moves to a
-- brand new type, LUNARA, Rp600jt, 5 units (matching the siteplan photo's
-- "Villa 2 Kamar (5 unit)" block).
--
-- BANYU-10 is a REAL sold unit (verified DP, buyer Susanto August Satria,
-- fee already approved and paid out to the marketing rep) -- never deleted.
-- Per the owner's explicit instruction, it's renumbered INTO the 6-unit
-- range instead of sitting outside it: renamed to BANYU-06 (old BANYU-06,
-- which had no purchase, is deleted first to free up that blok label). The
-- 4 excess AVARA units and 3 excess BANYU units (07-09, all still
-- untouched/tersedia, confirmed via loonars_unit_purchases before writing
-- this migration) are deleted outright.
--
-- AVARA's harga is protected by 0264's price-lock trigger (no role bypass,
-- by design) -- unlocked just long enough to apply the corrected price,
-- then re-locked, consistent with 0264's own intent that a genuine price
-- change belongs in its own numbered migration, never an app-layer edit.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Delete the excess, never-purchased units (AVARA-07..10, old BANYU-06..09)
-- ----------------------------------------------------------------------------
delete from public.loonars_units
where project_id = (select id from public.loonars_projects where kode = 'LNR2')
  and blok in ('AVARA-07', 'AVARA-08', 'AVARA-09', 'AVARA-10', 'BANYU-06', 'BANYU-07', 'BANYU-08', 'BANYU-09');

-- ----------------------------------------------------------------------------
-- 2. Renumber the sold unit (BANYU-10) into the 6-unit range as BANYU-06.
--    tipe/blok/sort_order aren't guarded by the price lock -- only harga is.
-- ----------------------------------------------------------------------------
update public.loonars_units
set blok = 'BANYU-06', sort_order = 6
where project_id = (select id from public.loonars_projects where kode = 'LNR2')
  and blok = 'BANYU-10';

-- ----------------------------------------------------------------------------
-- 3. AVARA-01..06: unlock -> correct harga (520jt -> 420jt) + tipe
--    ("2 Kamar" -> "1 Bedroom", matching BANYU now that LUNARA owns the
--    2-kamar designation) -> re-lock.
-- ----------------------------------------------------------------------------
update public.loonars_units
set price_locked = false
where project_id = (select id from public.loonars_projects where kode = 'LNR2')
  and blok like 'AVARA-%';

update public.loonars_units
set harga = 420000000, tipe = '1 Bedroom'
where project_id = (select id from public.loonars_projects where kode = 'LNR2')
  and blok like 'AVARA-%';

update public.loonars_units
set price_locked = true
where project_id = (select id from public.loonars_projects where kode = 'LNR2')
  and blok like 'AVARA-%';

-- ----------------------------------------------------------------------------
-- 4. New LUNARA type: 5 units, 2 Kamar, Rp600jt, matching the siteplan
--    photo's "Villa 2 Kamar (5 unit)" block. Locked from the start, same as
--    every other Loonars 2 unit price (0264).
-- ----------------------------------------------------------------------------
insert into public.loonars_units (project_id, blok, tipe, harga, status, row_label, sort_order, price_locked)
select
  (select id from public.loonars_projects where kode = 'LNR2'),
  'LUNARA-0' || n, '2 Kamar', 600000000, 'tersedia', 'LUNARA', n, true
from generate_series(1, 5) as n;
