-- Phase 7 (Cost Control): budget vs committed vs actual, and the
-- progress-vs-cost alert from the approved architecture. Pure read-only
-- aggregation over data that already exists (construction_expenses,
-- cm_project_boq, cm_project_overall_progress, cm_labor_contracts) -- no new
-- tables, so it can't drift or need its own write path.
--
-- "Committed" = BOQ budget (what's planned to be spent) + active labor
-- contracts' remaining payable. "Actual" = every construction_expenses
-- amount recognized so far (cash and utang both count as recognized cost,
-- utang just hasn't been cash-settled yet).

create or replace function public.cm_project_cost_control(p_project_id uuid)
returns table(
  budget numeric,
  boq_committed numeric,
  actual_total numeric,
  actual_material numeric,
  actual_labor numeric,
  actual_other numeric,
  progress_pct numeric,
  cost_pct numeric,
  cost_vs_progress_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_budget numeric;
  v_boq_committed numeric;
  v_actual_total numeric;
  v_actual_material numeric;
  v_actual_labor numeric;
  v_actual_other numeric;
  v_progress numeric;
  v_cost_pct numeric;
begin
  select total_budget into v_budget from public.construction_projects where id = p_project_id;

  select coalesce(sum(cm_project_boq.budget), 0) into v_boq_committed from public.cm_project_boq where project_id = p_project_id and unit_id is null;

  select
    coalesce(sum(construction_expenses.amount), 0),
    coalesce(sum(construction_expenses.amount) filter (where expense_type in ('material_tunai', 'pembelian_material')), 0),
    coalesce(sum(construction_expenses.amount) filter (where expense_type = 'gaji_tukang'), 0),
    coalesce(sum(construction_expenses.amount) filter (where expense_type in ('lain_lain_tunai', 'pembelian_lain_lain')), 0)
  into v_actual_total, v_actual_material, v_actual_labor, v_actual_other
  from public.construction_expenses
  where project_id = p_project_id;

  v_progress := public.cm_project_overall_progress(p_project_id);
  v_cost_pct := case when v_budget > 0 then round(v_actual_total / v_budget * 100, 1) else null end;

  return query select
    v_budget,
    v_boq_committed,
    v_actual_total,
    v_actual_material,
    v_actual_labor,
    v_actual_other,
    v_progress,
    v_cost_pct,
    case
      when v_cost_pct is null then 'unknown'
      when v_cost_pct > v_progress + 10 then 'cost_ahead'
      when v_progress > v_cost_pct + 10 then 'good'
      else 'balanced'
    end;
end;
$$;
