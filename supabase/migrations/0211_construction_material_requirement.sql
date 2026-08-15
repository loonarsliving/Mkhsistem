-- Phase 4 core feature (per the approved architecture): connects
-- WBS -> BOQ -> PROGRESS -> MATERIAL REQUIREMENT. For each material BOQ line
-- linked to a WBS item, required quantity = BOQ quantity x that WBS item's
-- APPROVED progress %. Coverage then nets that against consumed + stock +
-- open PR/PO (Phase 5 adds open PR/PO; for now, "available" = stock only).
--
-- Read-only function, no new tables -- this is pure computation over
-- cm_project_boq + cm_project_wbs + cm_material_stock, so it can't drift out
-- of sync the way a cached/stored requirement column could.

create or replace function public.cm_material_requirement(p_project_id uuid)
returns table(
  material_id uuid,
  material_name text,
  unit_satuan text,
  boq_quantity numeric,
  wbs_name text,
  wbs_progress_pct numeric,
  required_quantity numeric,
  stock_quantity numeric,
  coverage_pct numeric,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.material_id,
    m.name as material_name,
    m.unit_satuan,
    b.quantity as boq_quantity,
    w.name as wbs_name,
    coalesce(w.progress_pct, 0) as wbs_progress_pct,
    round(b.quantity * coalesce(w.progress_pct, 0) / 100, 2) as required_quantity,
    coalesce(s.quantity, 0) as stock_quantity,
    case when b.quantity * coalesce(w.progress_pct, 0) / 100 <= 0 then null
      else round(coalesce(s.quantity, 0) / (b.quantity * coalesce(w.progress_pct, 0) / 100) * 100, 1)
    end as coverage_pct,
    case
      when b.quantity * coalesce(w.progress_pct, 0) / 100 <= 0 then 'belum_perlu'
      when coalesce(s.quantity, 0) / (b.quantity * coalesce(w.progress_pct, 0) / 100) < 0.9 then 'shortage'
      when coalesce(s.quantity, 0) / (b.quantity * coalesce(w.progress_pct, 0) / 100) <= 1.2 then 'normal'
      when coalesce(s.quantity, 0) / (b.quantity * coalesce(w.progress_pct, 0) / 100) <= 1.4 then 'overstock_risk'
      else 'excessive'
    end as status
  from public.cm_project_boq b
  join public.cm_materials m on m.id = b.material_id
  left join public.cm_project_wbs w on w.id = b.project_wbs_id
  left join public.cm_material_stock s on s.project_id = b.project_id and s.material_id = b.material_id
  where b.project_id = p_project_id and b.unit_id is null and b.category = 'material' and b.material_id is not null;
$$;
