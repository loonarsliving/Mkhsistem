-- ============================================================================
-- MK Connect — 0042: Fix ambiguous column references in kpi_national_stats
--
-- Same bug class as 0029/0040 again: kpi_national_stats' RETURNS TABLE
-- declares monthly_assigned/monthly_completed as output columns (implicit
-- plpgsql variables), which collided with the bare monthly_assigned/
-- monthly_completed references inside its `(select sum(monthly_assigned)
-- from per_employee)` subqueries -- caught live via jwt-impersonation
-- testing ("column reference monthly_assigned is ambiguous"). Fixed by
-- aliasing per_employee and qualifying every reference.
-- ============================================================================

create or replace function public.kpi_national_stats(
  p_month smallint default null,
  p_year smallint default null,
  p_division_id uuid default null
)
returns table (
  period_month smallint,
  period_year smallint,
  current_week smallint,
  employee_count bigint,
  monthly_assigned bigint,
  monthly_completed bigint,
  monthly_achievement_percent numeric,
  overdue_count bigint,
  branch_ranking jsonb,
  employee_ranking_weekly jsonb,
  employee_ranking_monthly jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
  v_current_week smallint := least(ceil(extract(day from current_date)::numeric / 7)::smallint, 5);
  v_division_id uuid := coalesce(p_division_id, (select id from public.divisions where name = 'Marketing & Komunikasi'));
begin
  if not public.app_has_permission('kpi_task.view_all') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  return query
  with dept_employees as (
    select e.id, e.full_name, e.branch_id
    from public.employees e
    where e.deleted_at is null and e.employment_status = 'active' and e.division_id = v_division_id
  ),
  per_employee as (
    select
      de.id as employee_id, de.branch_id,
      count(t.id) filter (where t.period_year = v_year and t.period_month = v_month) as monthly_assigned,
      count(t.id) filter (where t.period_year = v_year and t.period_month = v_month and t.status = 'completed') as monthly_completed,
      count(t.id) filter (where t.status = 'pending' and t.due_date is not null and t.due_date < current_date) as overdue
    from dept_employees de
    left join public.kpi_tasks t on t.assigned_to = de.id and t.deleted_at is null
    group by de.id, de.branch_id
  ),
  per_branch as (
    select
      b.id as branch_id, b.name as branch_name,
      coalesce(sum(pe.monthly_assigned), 0) as monthly_assigned,
      coalesce(sum(pe.monthly_completed), 0) as monthly_completed
    from public.branches b
    join per_employee pe on pe.branch_id = b.id
    where b.deleted_at is null
    group by b.id, b.name
  )
  select
    v_month, v_year, v_current_week,
    (select count(*) from dept_employees),
    coalesce((select sum(pe.monthly_assigned) from per_employee pe), 0)::bigint,
    coalesce((select sum(pe.monthly_completed) from per_employee pe), 0)::bigint,
    case when coalesce((select sum(pe.monthly_assigned) from per_employee pe), 0) = 0 then 0
      else round(coalesce((select sum(pe.monthly_completed) from per_employee pe), 0)::numeric / (select sum(pe.monthly_assigned) from per_employee pe) * 100, 1) end,
    coalesce((select sum(pe.overdue) from per_employee pe), 0)::bigint,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'branch_id', pb.branch_id, 'branch_name', pb.branch_name,
        'assigned', pb.monthly_assigned, 'completed', pb.monthly_completed,
        'achievement_percent', case when pb.monthly_assigned = 0 then 0 else round(pb.monthly_completed::numeric / pb.monthly_assigned * 100, 1) end
      ) order by (case when pb.monthly_assigned = 0 then 0 else pb.monthly_completed::numeric / pb.monthly_assigned end) desc)
      from per_branch pb),
      '[]'::jsonb
    ),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'employee_id', r.employee_id, 'full_name', r.full_name, 'branch_name', r.branch_name,
        'assigned', r.assigned, 'completed', r.completed, 'achievement_percent', r.achievement_percent
      ))
      from (select * from public.kpi_ranking('weekly', v_month, v_year, v_current_week, null, v_division_id) limit 5) r),
      '[]'::jsonb
    ),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'employee_id', r.employee_id, 'full_name', r.full_name, 'branch_name', r.branch_name,
        'assigned', r.assigned, 'completed', r.completed, 'achievement_percent', r.achievement_percent
      ))
      from (select * from public.kpi_ranking('monthly', v_month, v_year, null, null, v_division_id) limit 5) r),
      '[]'::jsonb
    );
end;
$$;
