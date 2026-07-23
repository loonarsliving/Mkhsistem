-- ============================================================================
-- MK Connect — 0038: Markom KPI reporting functions
-- All dashboard/ranking numbers are computed here, server-side, so the UI
-- never re-derives Achievement % itself ("no manual calculation"). Every
-- function does its own permission check and defaults its period to the
-- current month/year/week-of-month when not given one.
--
-- p_division_id defaults to "Marketing & Komunikasi" everywhere but is a
-- real parameter, not a hardcoded filter -- a future department (HR,
-- Engineering, Procurement, Finance, ...) reuses these exact three
-- functions for its own dashboard/ranking by just passing its own
-- division_id, no schema or function rewrite needed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Per-employee dashboard stats (Markom employee's own "My Checklist").
-- ----------------------------------------------------------------------------
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

  select count(*) into v_today_tasks from public.kpi_tasks
    where assigned_to = v_employee_id and deleted_at is null and due_date = current_date;

  select
    count(*),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'rejected'),
    count(*) filter (where status = 'pending')
    into v_w_assigned, v_w_completed, v_w_rejected, v_w_pending
    from public.kpi_tasks
    where assigned_to = v_employee_id and deleted_at is null
      and period_year = v_year and period_month = v_month and period_week = v_current_week;

  select
    count(*),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'rejected'),
    count(*) filter (where status = 'pending')
    into v_m_assigned, v_m_completed, v_m_rejected, v_m_pending
    from public.kpi_tasks
    where assigned_to = v_employee_id and deleted_at is null
      and period_year = v_year and period_month = v_month;

  select count(*) into v_overdue from public.kpi_tasks
    where assigned_to = v_employee_id and deleted_at is null and status = 'pending'
      and due_date is not null and due_date < current_date;

  return query select
    v_employee_id, v_month, v_year, v_current_week, v_today_tasks,
    v_w_assigned, v_w_completed, v_w_rejected, v_w_pending,
    case when v_w_assigned = 0 then 0 else round(v_w_completed::numeric / v_w_assigned * 100, 1) end,
    v_m_assigned, v_m_completed, v_m_rejected, v_m_pending,
    case when v_m_assigned = 0 then 0 else round(v_m_completed::numeric / v_m_assigned * 100, 1) end,
    v_overdue;
end;
$$;

-- ----------------------------------------------------------------------------
-- Branch Manager dashboard: branch-wide rollup + per-employee performance.
-- ----------------------------------------------------------------------------
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
    coalesce(sum(pe.monthly_assigned), 0),
    coalesce(sum(pe.monthly_completed), 0),
    case when coalesce(sum(pe.monthly_assigned), 0) = 0 then 0
      else round(coalesce(sum(pe.monthly_completed), 0)::numeric / sum(pe.monthly_assigned) * 100, 1) end,
    coalesce(sum(pe.overdue), 0),
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

-- ----------------------------------------------------------------------------
-- Ranking: ordered strictly by Achievement % (never by raw task count).
-- Generic over division/scope so any department can call it for its own
-- ranking (falls back to Markom when p_division_id is omitted).
-- ----------------------------------------------------------------------------
create or replace function public.kpi_ranking(
  p_scope text default 'monthly',
  p_month smallint default null,
  p_year smallint default null,
  p_week smallint default null,
  p_branch_id uuid default null,
  p_division_id uuid default null
)
returns table (
  rank bigint,
  employee_id uuid,
  full_name text,
  branch_name text,
  division_name text,
  assigned bigint,
  completed bigint,
  rejected bigint,
  achievement_percent numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
  v_week smallint := coalesce(p_week, least(ceil(extract(day from current_date)::numeric / 7)::smallint, 5));
  v_division_id uuid := coalesce(p_division_id, (select id from public.divisions where name = 'Marketing & Komunikasi'));
begin
  if p_scope not in ('weekly', 'monthly') then
    raise exception 'Invalid scope';
  end if;

  if not (
    public.app_has_permission('kpi_task.view_all')
    or (public.app_has_permission('kpi_task.view_branch') and coalesce(p_branch_id, public.app_current_branch_id()) = public.app_current_branch_id())
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  return query
  with ranked as (
    select
      e.id as employee_id, e.full_name, b.name as branch_name, d.name as division_name,
      count(t.id) filter (where p_scope = 'monthly' or t.period_week = v_week) as assigned,
      count(t.id) filter (where (p_scope = 'monthly' or t.period_week = v_week) and t.status = 'completed') as completed,
      count(t.id) filter (where (p_scope = 'monthly' or t.period_week = v_week) and t.status = 'rejected') as rejected
    from public.employees e
    join public.branches b on b.id = e.branch_id
    join public.divisions d on d.id = e.division_id
    left join public.kpi_tasks t on t.assigned_to = e.id and t.deleted_at is null
      and t.period_year = v_year and t.period_month = v_month
    where e.deleted_at is null and e.employment_status = 'active' and e.division_id = v_division_id
      and (p_branch_id is null or e.branch_id = p_branch_id)
    group by e.id, e.full_name, b.name, d.name
  )
  select
    row_number() over (order by (case when assigned = 0 then 0 else completed::numeric / assigned end) desc, completed desc),
    employee_id, full_name, branch_name, division_name, assigned, completed, rejected,
    case when assigned = 0 then 0 else round(completed::numeric / assigned * 100, 1) end
  from ranked
  order by (case when assigned = 0 then 0 else completed::numeric / assigned end) desc, completed desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- Director dashboard: company-wide rollup + branch ranking + employee ranking.
-- ----------------------------------------------------------------------------
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
    coalesce((select sum(monthly_assigned) from per_employee), 0),
    coalesce((select sum(monthly_completed) from per_employee), 0),
    case when coalesce((select sum(monthly_assigned) from per_employee), 0) = 0 then 0
      else round(coalesce((select sum(monthly_completed) from per_employee), 0)::numeric / (select sum(monthly_assigned) from per_employee) * 100, 1) end,
    coalesce((select sum(overdue) from per_employee), 0),
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
