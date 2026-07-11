-- ============================================================================
-- MK Connect — 0040: Fix ambiguous column references in kpi_employee_stats
--
-- Same bug class as 0029 (crm_sales_ranking): a plpgsql RETURNS TABLE
-- implicitly declares each output column as a variable in the function's
-- top-level namespace. kpi_employee_stats returns period_month/period_year
-- columns, which collided with the bare period_year/period_month/
-- period_week references in its two inline `from public.kpi_tasks` queries
-- -- caught live via jwt-impersonation testing ("column reference
-- period_year is ambiguous"). Fixed by qualifying every kpi_tasks column
-- reference with the table alias.
-- ============================================================================

create or replace function public.kpi_employee_stats(
  p_employee_id uuid default null,
  p_month smallint default null,
  p_year smallint default null
)
returns table (
  employee_id uuid,
  period_month smallint,
  period_year smallint,
  current_week smallint,
  today_tasks bigint,
  weekly_assigned bigint,
  weekly_completed bigint,
  weekly_rejected bigint,
  weekly_pending bigint,
  weekly_achievement_percent numeric,
  monthly_assigned bigint,
  monthly_completed bigint,
  monthly_rejected bigint,
  monthly_pending bigint,
  monthly_achievement_percent numeric,
  overdue_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_employee_id uuid := coalesce(p_employee_id, v_caller);
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
  v_current_week smallint := least(ceil(extract(day from current_date)::numeric / 7)::smallint, 5);
  v_today_tasks bigint;
  v_w_assigned bigint; v_w_completed bigint; v_w_rejected bigint; v_w_pending bigint;
  v_m_assigned bigint; v_m_completed bigint; v_m_rejected bigint; v_m_pending bigint;
  v_overdue bigint;
begin
  if v_employee_id <> v_caller then
    if not (
      public.app_has_permission('kpi_task.view_all')
      or (
        public.app_has_permission('kpi_task.view_branch')
        and exists (select 1 from public.employees e where e.id = v_employee_id and e.branch_id = public.app_current_branch_id())
      )
    ) then
      raise exception 'Insufficient permission' using errcode = '42501';
    end if;
  end if;

  select count(*) into v_today_tasks from public.kpi_tasks t
    where t.assigned_to = v_employee_id and t.deleted_at is null and t.due_date = current_date;

  select
    count(*),
    count(*) filter (where t.status = 'completed'),
    count(*) filter (where t.status = 'rejected'),
    count(*) filter (where t.status = 'pending')
    into v_w_assigned, v_w_completed, v_w_rejected, v_w_pending
    from public.kpi_tasks t
    where t.assigned_to = v_employee_id and t.deleted_at is null
      and t.period_year = v_year and t.period_month = v_month and t.period_week = v_current_week;

  select
    count(*),
    count(*) filter (where t.status = 'completed'),
    count(*) filter (where t.status = 'rejected'),
    count(*) filter (where t.status = 'pending')
    into v_m_assigned, v_m_completed, v_m_rejected, v_m_pending
    from public.kpi_tasks t
    where t.assigned_to = v_employee_id and t.deleted_at is null
      and t.period_year = v_year and t.period_month = v_month;

  select count(*) into v_overdue from public.kpi_tasks t
    where t.assigned_to = v_employee_id and t.deleted_at is null and t.status = 'pending'
      and t.due_date is not null and t.due_date < current_date;

  return query select
    v_employee_id, v_month, v_year, v_current_week, v_today_tasks,
    v_w_assigned, v_w_completed, v_w_rejected, v_w_pending,
    case when v_w_assigned = 0 then 0 else round(v_w_completed::numeric / v_w_assigned * 100, 1) end,
    v_m_assigned, v_m_completed, v_m_rejected, v_m_pending,
    case when v_m_assigned = 0 then 0 else round(v_m_completed::numeric / v_m_assigned * 100, 1) end,
    v_overdue;
end;
$$;
