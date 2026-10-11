-- ============================================================================
-- MK Connect — 0281: Loonars 2 siteplan correction -- AVARA/BANYU resized to
-- 6 units each @ Rp420jt, new LUNARA type (2 kamar, Rp600jt, 5 units)
--
-- Owner's correction: AVARA and BANYU keep their names but each should only
-- have 6 units total, both priced Rp420jt (AVARA was wrongly set up as a
-- "2 Kamar" @ Rp520jt type with 10 units; BANYU was already 1 Bedroom @
-- Rp420jt but also had 10 units). The "2 Kamar" designation moves to a new
-- type, LUNARA, Rp600jt, 5 units, matching the siteplan photo's "Villa 2
-- Kamar (5 unit)" block.
--
-- BANYU-10 is a REAL sold unit (verified DP, fee already paid out) and is
-- never deleted: per the owner, it's renumbered into the 6-unit range as
-- BANYU-06.
--
-- Applied to production 2026-10-11 as plain UPDATEs: five of the excess,
-- never-purchased rows (old BANYU-06..09, AVARA-07) were repurposed in place
-- as LUNARA-01..05 instead of deleted and re-inserted. The remaining three
-- excess rows (AVARA-08..10) are deleted in step 6.
--
-- harga is protected by 0264's price-lock trigger (no role bypass, by
-- design): unlocked just long enough to apply the corrected prices, then
-- re-locked, per 0264's own rule that a genuine price change belongs in a
-- numbered migration, never an app-layer edit.
-- ============================================================================

-- 1. Unlock the rows whose harga changes.
update public.loonars_units set price_locked = false
where project_id = (select id from public.loonars_projects where kode = 'LNR2')
  and blok in ('BANYU-06', 'BANYU-07', 'BANYU-08', 'BANYU-09', 'AVARA-07',
               'AVARA-01', 'AVARA-02', 'AVARA-03', 'AVARA-04', 'AVARA-05', 'AVARA-06');

-- 2. Repurpose five excess rows as LUNARA. Old BANYU-06 is renamed first,
--    which frees the BANYU-06 label for step 3 (unique (project_id, blok)).
update public.loonars_units u
set blok = v.new_blok, tipe = '2 Kamar', row_label = 'LUNARA', sort_order = v.so, harga = 600000000, status = 'tersedia'
from (values
  ('BANYU-06', 'LUNARA-01', 1),
  ('BANYU-07', 'LUNARA-02', 2),
  ('BANYU-08', 'LUNARA-03', 3),
  ('BANYU-09', 'LUNARA-04', 4),
  ('AVARA-07', 'LUNARA-05', 5)
) as v(old_blok, new_blok, so)
where u.project_id = (select id from public.loonars_projects where kode = 'LNR2')
  and u.blok = v.old_blok;

-- 3. Renumber the sold unit into the 6-unit range.
update public.loonars_units set blok = 'BANYU-06', sort_order = 6
where project_id = (select id from public.loonars_projects where kode = 'LNR2')
  and blok = 'BANYU-10';

-- 4. AVARA-01..06: 520jt "2 Kamar" -> 420jt "1 Bedroom".
update public.loonars_units set harga = 420000000, tipe = '1 Bedroom'
where project_id = (select id from public.loonars_projects where kode = 'LNR2')
  and blok in ('AVARA-01', 'AVARA-02', 'AVARA-03', 'AVARA-04', 'AVARA-05', 'AVARA-06');

-- 5. Re-lock every Loonars 2 unit price.
update public.loonars_units set price_locked = true
where project_id = (select id from public.loonars_projects where kode = 'LNR2');

-- 6. Remove the last three excess, never-purchased units.
delete from public.loonars_units
where project_id = (select id from public.loonars_projects where kode = 'LNR2')
  and blok in ('AVARA-08', 'AVARA-09', 'AVARA-10')
  and status = 'tersedia';
