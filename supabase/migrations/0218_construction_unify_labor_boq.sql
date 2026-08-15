-- Owner's correction: "gaji tukang" is never a flat BOQ line item in this
-- business -- it's always borongan (contract), paid weekly according to
-- WBS weight and progress. The manual "Tenaga Kerja" BOQ line and the
-- Kontrak Borongan flow were two disconnected things; they need to be one.
--
-- Fix: cm_project_cost_control now derives labor commitment from active
-- cm_labor_contracts (contract_value), not from freeform cm_project_boq
-- 'labor' rows -- the BOQ input form (frontend) stops offering "labor" as a
-- pickable category, steering that budget through Kontrak Borongan instead.
-- actual_labor was already correct (sourced from construction_expenses,
-- which cm_approve_labor_payment posts to) -- only the *committed* side
-- needed fixing.

-- Changing RETURNS TABLE's column list requires dropping the old function
-- first (Postgres refuses in place -- different from the arg-overload issue
-- hit earlier, this is the return-type equivalent of the same lesson).
drop function public.cm_project_cost_control(uuid);

create function public.cm_project_cost_control(p_project_id uuid)
returns table(
  budget numeric,
  boq_committed numeric,
  labor_committed numeric,
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
  v_labor_committed numeric;
  v_actual_total numeric;
  v_actual_material numeric;
  v_actual_labor numeric;
  v_actual_other numeric;
  v_progress numeric;
  v_cost_pct numeric;
begin
  select total_budget into v_budget from public.construction_projects where id = p_project_id;

  select coalesce(sum(cm_project_boq.budget), 0) into v_boq_committed
  from public.cm_project_boq
  where project_id = p_project_id and unit_id is null and category != 'labor';

  select coalesce(sum(cm_labor_contracts.contract_value), 0) into v_labor_committed
  from public.cm_labor_contracts
  where project_id = p_project_id and status = 'active';

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
    v_labor_committed,
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
