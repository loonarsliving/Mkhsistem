-- ============================================================================
-- MK Connect — 0203: siteplan grid layout (replaces image+hotspot placement)
--
-- Owner's call: the real siteplan drawing is an isometric/perspective
-- illustration, so percentage-based x/y hotspots (0202's
-- loonars_unit_positions) drift and are hard to place accurately. Switching
-- to a simple grid-of-boxes layout instead: each unit gets a row_label (e.g.
-- "Atas"/"Bawah") and a sort_order within that row, rendered as colored
-- status boxes grouped by row -- no background image needed.
--
-- loonars_siteplan_layouts / loonars_unit_positions and the storage bucket
-- from 0202 are left in place (unused by the new grid viewer, not dropped --
-- cheap to keep in case an image-map mode is wanted again later for a
-- different project).
-- ============================================================================

alter table public.loonars_units
  add column row_label text,
  add column sort_order integer not null default 0;

comment on column public.loonars_units.row_label is
  'Which named row this unit is grouped under in the grid siteplan view (e.g. "Atas", "Bawah"). Null = unassigned, shown in an "Belum dikelompokkan" bucket in the admin editor.';
comment on column public.loonars_units.sort_order is
  'Left-to-right display order within row_label. Ties broken by blok.';
