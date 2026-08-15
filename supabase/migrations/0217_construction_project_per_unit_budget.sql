-- Owner's ask: instead of one lump total budget, a new project should be
-- set up as "anggaran per unit x jumlah unit" -- total_budget is derived,
-- and each unit becomes a real cm_units row with its own construction
-- budget (matches the approved architecture's UNIT CONSTRUCTION PLAN
-- concept). Followed by a BOQ input step (cm_add_project_boq_line, manual
-- entry alongside the existing template-seed path).

drop function public.construction_create_project(uuid, text, numeric);

create or replace function public.construction_create_project(p_branch_id uuid, p_name text, p_budget_per_unit numeric, p_total_units int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_default_template uuid;
  v_total_budget numeric;
  v_i int;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'Nama proyek wajib diisi';
  end if;
  if p_budget_per_unit <= 0 then
    raise exception 'Anggaran per unit harus lebih dari 0';
  end if;
  if p_total_units <= 0 then
    raise exception 'Jumlah unit harus lebih dari 0';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'Cabang tidak ditemukan';
  end if;
  if exists (select 1 from public.construction_projects where branch_id = p_branch_id and status = 'active') then
    raise exception 'Cabang ini sudah punya proyek pembangunan yang aktif';
  end if;

  v_total_budget := p_budget_per_unit * p_total_units;

  insert into public.construction_projects (branch_id, name, total_budget, status, created_by)
  values (p_branch_id, trim(p_name), v_total_budget, 'active', auth.uid())
  returning id into v_id;

  for v_i in 1..p_total_units loop
    insert into public.cm_units (project_id, code, construction_budget, status)
    values (v_id, 'U' || lpad(v_i::text, 2, '0'), p_budget_per_unit, 'planning');
  end loop;

  select id into v_default_template from public.cm_wbs_templates where is_default = true limit 1;
  if v_default_template is not null then
    insert into public.cm_project_wbs (project_id, unit_id, code, name, weight, sort_order)
    select v_id, null, code, name, weight, sort_order
    from public.cm_wbs_template_items
    where template_id = v_default_template;
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_add_project_boq_line(): manual BOQ line entry for the BOQ input form
-- (per project, or per unit_id) -- complements cm_seed_project_boq's
-- template-based path with direct entry, since a real project's BOQ won't
-- always match a canned template exactly.
-- ----------------------------------------------------------------------------
create or replace function public.cm_add_project_boq_line(
  p_project_id uuid, p_category text, p_description text, p_quantity numeric, p_unit text, p_unit_price numeric,
  p_material_id uuid default null, p_project_wbs_id uuid default null, p_unit_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_category not in ('material', 'labor', 'equipment', 'other') then
    raise exception 'Kategori BOQ tidak valid';
  end if;
  if p_description is null or trim(p_description) = '' then
    raise exception 'Deskripsi wajib diisi';
  end if;
  if p_quantity <= 0 then
    raise exception 'Quantity harus lebih dari 0';
  end if;
  if p_unit_price < 0 then
    raise exception 'Harga tidak boleh negatif';
  end if;
  if not exists (select 1 from public.construction_projects where id = p_project_id) then
    raise exception 'Proyek tidak ditemukan';
  end if;

  insert into public.cm_project_boq (project_id, unit_id, project_wbs_id, category, material_id, description, quantity, unit, unit_price)
  values (p_project_id, p_unit_id, p_project_wbs_id, p_category, p_material_id, trim(p_description), p_quantity, p_unit, p_unit_price)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.cm_delete_project_boq_line(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  delete from public.cm_project_boq where id = p_line_id;
  if not found then
    raise exception 'Baris BOQ tidak ditemukan';
  end if;
end;
$$;
