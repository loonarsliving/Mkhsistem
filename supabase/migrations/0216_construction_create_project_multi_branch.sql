-- Owner's ask: Construction Management must work for every branch, not
-- just Kendari. The permission-level restriction is removed in
-- lib/rbac/session.ts (construction_finance.* is already granted at the
-- role level to every branch's Kepala Cabang -- it was only being stripped
-- back out for non-Kendari branches, not withheld at the grant level).
--
-- That alone isn't enough though: there was never a way to actually CREATE
-- a construction_projects row for a branch other than Kendari (its one row
-- predates this module and was inserted directly). This adds that missing
-- piece -- Super Admin/Finance can now start a project for any branch, and
-- it's auto-seeded with the same default WBS template Kendari uses, so a
-- newly onboarded branch has the same starting point.

create or replace function public.construction_create_project(p_branch_id uuid, p_name text, p_total_budget numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_default_template uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'Nama proyek wajib diisi';
  end if;
  if p_total_budget <= 0 then
    raise exception 'Anggaran harus lebih dari 0';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'Cabang tidak ditemukan';
  end if;
  if exists (select 1 from public.construction_projects where branch_id = p_branch_id and status = 'active') then
    raise exception 'Cabang ini sudah punya proyek pembangunan yang aktif';
  end if;

  insert into public.construction_projects (branch_id, name, total_budget, status, created_by)
  values (p_branch_id, trim(p_name), p_total_budget, 'active', auth.uid())
  returning id into v_id;

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
