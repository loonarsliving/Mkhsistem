-- ============================================================================
-- MK Connect — 0041: Fix bigint/numeric mismatch in kpi_branch_stats and
-- kpi_national_stats
--
-- Same bug class as 0029 (crm_branch_stats): sum() of a count(*)-derived
-- bigint expression returns numeric in Postgres, not bigint. Both functions
-- declare monthly_assigned/monthly_completed/overdue_count as bigint in
-- RETURNS TABLE but summed them without a cast -- caught live via
-- jwt-impersonation testing ("structure of query does not match function
-- result type... numeric does not match expected type bigint").
-- ============================================================================

create or replace function public.kpi_branch_stats(
  p_branch_id uuid default null,
  p_month smallint default null,
  p_year smallint default null,
  p_division_id uuid default null
)
returns table (
  branch_id uuid,
  period_month smallint,
  period_year smallint,
  current_week smallint,
  employee_count bigint,
  monthly_assigned bigint,
  monthly_completed bigint,
  monthly_achievement_percent numeric,
  overdue_count bigint,
  pending_verification_count bigint,
  employee_performance jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch_id uuid := coalesce(p_branch_id, public.app_current_branch_id());
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
  v_current_week smallint := least(ceil(extract(day from current_date)::numeric / 7)::smallint, 5);
  v_division_id uuid := coalesce(p_division_id, (select id from public.divisions where name = 'Marketing & Komunikasi'));
begin
  if not (
    public.app_has_permission('kpi_task.view_all')
    or (public.app_has_permission('kpi_task.view_branch') and v_branch_id = public.app_current_branch_id())
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  return query
  with dept_employees as (
    select e.id, e.full_name
    from public.employees e
    where e.branch_id = v_branch_id and e.deleted_at is null and e.employment_status = 'active'
      and e.division_id = v_division_id
  ),
  per_employee as (
    select
      de.id as employee_id, de.full_name,
      count(t.id) filter (where t.period_year = v_year and t.period_month = v_month) as monthly_assigned,
      count(t.id) filter (where t.period_year = v_year and t.period_month = v_month and t.status = 'completed') as monthly_completed,
      count(t.id) filter (where t.period_year = v_year and t.period_month = v_month and t.period_week = v_current_week) as weekly_assigned,
      count(t.id) filter (where t.period_year = v_year and t.period_month = v_month and t.period_week = v_current_week and t.status = 'completed') as weekly_completed,
      count(t.id) filter (where t.status = 'pending' and t.due_date is not null and t.due_date < current_date) as overdue
    from dept_employees de
    left join public.kpi_tasks t on t.assigned_to = de.id and t.deleted_at is null
    group by de.id, de.full_name
  )
  select
    v_branch_id, v_month, v_year, v_current_week,
    (select count(*) from dept_employees),
    coalesce(sum(pe.monthly_assigned), 0)::bigint,
    coalesce(sum(pe.monthly_completed), 0)::bigint,
    case when coalesce(sum(pe.monthly_assigned), 0) = 0 then 0
      else round(coalesce(sum(pe.monthly_completed), 0)::numeric / sum(pe.monthly_assigned) * 100, 1) end,
    coalesce(sum(pe.overdue), 0)::bigint,
    (select count(*) from public.kpi_tasks t where t.branch_id = v_branch_id and t.deleted_at is null and t.status = 'pending'
      and exists (select 1 from dept_employees de where de.id = t.assigned_to)),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'employee_id', pe.employee_id, 'full_name', pe.full_name,
        'weekly_assigned', pe.weekly_assigned, 'weekly_completed', pe.weekly_completed,
        'weekly_achievement_percent', case when pe.weekly_assigned = 0 then 0 else round(pe.weekly_completed::numeric / pe.weekly_assigned * 100, 1) end,
        'monthly_assigned', pe.monthly_assigned, 'monthly_completed', pe.monthly_completed,
        'monthly_achievement_percent', case when pe.monthly_assigned = 0 then 0 else round(pe.monthly_completed::numeric / pe.monthly_assigned * 100, 1) end,
        'overdue', pe.overdue
      ) order by (case when pe.monthly_assigned = 0 then 0 else pe.monthly_completed::numeric / pe.monthly_assigned end) desc)
      from per_employee pe),
      '[]'::jsonb
    )
  from per_employee pe;
end;
$$;

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
    coalesce((select sum(monthly_assigned) from per_employee), 0)::bigint,
    coalesce((select sum(monthly_completed) from per_employee), 0)::bigint,
    case when coalesce((select sum(monthly_assigned) from per_employee), 0) = 0 then 0
      else round(coalesce((select sum(monthly_completed) from per_employee), 0)::numeric / (select sum(monthly_assigned) from per_employee) * 100, 1) end,
    coalesce((select sum(overdue) from per_employee), 0)::bigint,
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
