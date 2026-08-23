-- ============================================================================
-- MK Connect — 0246: fix BOQ-to-WBS linking on template seeding (punch
-- list item #2 from "Peta Celah Stok Kontraktor").
--
-- Root cause confirmed by reading the code, not guessed: cm_add_project_boq_line
-- (manual entry, 0217) already accepts p_project_wbs_id and always has -- the
-- app layer just never sent it (fixed in the same commit as this migration,
-- see AddBoqLineInput). The real gap is cm_seed_project_boq (0210, the
-- template-based path): cm_boq_template_items never carried a WBS reference,
-- so every template-seeded BOQ line -- including Kendari's original "Rumah
-- Tinggal Standar" seed -- landed with project_wbs_id always NULL. That
-- silently zeroes cm_material_requirement()'s required_quantity for every
-- such line, which in turn silently defeats the "wajib alasan jika minta
-- jauh di atas saran" guard already live in cm_submit_purchase_request
-- (0212) -- v_suggested there is always 0 when required_quantity is always
-- 0. This migration fixes future template seeds; it does NOT touch
-- Kendari's existing BOQ rows, since guessing which WBS item each one
-- belongs to after the fact is exactly the kind of unverified assumption
-- that shouldn't go into a migration -- those stay NULL until someone
-- reviews and assigns them by hand through the (now available) BOQ form.
-- ============================================================================

alter table public.cm_boq_template_items
  add column wbs_code text;

comment on column public.cm_boq_template_items.wbs_code is
  'Optional. Matched against cm_project_wbs.code (same project/unit) at seed time to auto-link project_wbs_id -- see cm_seed_project_boq below. NULL means the seeded line stays unlinked, same as before this migration.';

create or replace function public.cm_seed_project_boq(p_project_id uuid, p_template_id uuid, p_unit_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if not exists (select 1 from public.construction_projects where id = p_project_id) then
    raise exception 'Proyek tidak ditemukan';
  end if;
  if not exists (select 1 from public.cm_boq_template_items where template_id = p_template_id) then
    raise exception 'Template BOQ kosong atau tidak ditemukan';
  end if;
  if exists (select 1 from public.cm_project_boq where project_id = p_project_id and unit_id is not distinct from p_unit_id) then
    raise exception 'BOQ untuk proyek/unit ini sudah pernah dibuat';
  end if;

  insert into public.cm_project_boq (project_id, unit_id, project_wbs_id, category, material_id, description, quantity, unit, unit_price, sort_order)
  select
    p_project_id,
    p_unit_id,
    (select w.id from public.cm_project_wbs w where w.project_id = p_project_id and w.unit_id is not distinct from p_unit_id and w.code = ti.wbs_code limit 1),
    ti.category, ti.material_id, ti.description, ti.quantity, ti.unit, ti.unit_price, ti.sort_order
  from public.cm_boq_template_items ti
  where ti.template_id = p_template_id;
end;
$$;
