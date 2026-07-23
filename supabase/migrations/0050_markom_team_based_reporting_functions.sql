-- ============================================================================
-- MK Connect — 0050: Markom KPI reporting functions, team-based.
-- kpi_employee_stats + kpi_branch_stats collapse into ONE kpi_team_stats,
-- since a "team" now IS the branch's roster for a division -- there's no
-- more per-employee breakdown to report separately. kpi_ranking and
-- kpi_national_stats move from employee-grain to branch/team-grain.
-- ============================================================================

drop function if exists public.kpi_employee_stats(uuid, smallint, smallint);
drop function if exists public.kpi_branch_stats(uuid, smallint, smallint, uuid);
drop function if exists public.kpi_national_stats(smallint, smallint, uuid);
drop function if exists public.kpi_ranking(text, smallint, smallint, smallint, uuid, uuid);

-- ----------------------------------------------------------------------------
-- The one dashboard function for a team's own checklist board -- used both
-- by team members ("my team's board") and the Branch Manager ("the team I
-- review"), since it's literally the same data either way now.
-- ----------------------------------------------------------------------------
create or replace function public.kpi_team_stats(
  p_branch_id uuid default null,
  p_month smallint default null,
  p_year smallint default null,
  p_division_id uuid default null
)
returns table (
  branch_id uuid,
  branch_name text,
  division_id uuid,
  period_month smallint,
  period_year smallint,
  current_week smallint,
  team_members jsonb,
  weekly_total bigint,
  weekly_completed bigint,
  weekly_remaining bigint,
  weekly_achievement_percent numeric,
  monthly_total bigint,
  monthly_completed bigint,
  monthly_remaining bigint,
  monthly_achievement_percent numeric,
  overdue_count bigint,
  waiting_review_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_division_id uuid := coalesce(p_division_id, (select id from public.divisions where name = 'Marketing & Komunikasi'));
  v_branch_id uuid;
  v_branch_name text;
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
  v_current_week smallint := least(ceil(extract(day from current_date)::numeric / 7)::smallint, 5);
  v_team_members jsonb;
  v_weekly_total bigint;
  v_weekly_completed bigint;
  v_monthly_total bigint;
  v_monthly_completed bigint;
  v_overdue bigint;
  v_waiting bigint;
begin
  if p_branch_id is not null then
    v_branch_id := p_branch_id;
  else
    select e.branch_id into v_branch_id from public.employees e where e.id = v_caller;
  end if;

  if v_branch_id is null then
    raise exception 'Branch not found';
  end if;

  if not (
    public.app_has_permission('kpi_task.view_all')
    or (public.app_has_permission('kpi_task.view_branch') and v_branch_id = public.app_current_branch_id())
    or (
      public.app_has_permission('kpi_task.view_own')
      and exists (select 1 from public.employees e where e.id = v_caller and e.branch_id = v_branch_id and e.division_id = v_division_id)
    )
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select b.name into v_branch_name from public.branches b where b.id = v_branch_id;

  select coalesce(jsonb_agg(jsonb_build_object('employee_id', e.id, 'full_name', e.full_name) order by e.full_name), '[]'::jsonb)
    into v_team_members
    from public.employees e
    where e.branch_id = v_branch_id and e.division_id = v_division_id
      and e.deleted_at is null and e.employment_status = 'active';

  select count(*), count(*) filter (where t.status = 'completed')
    into v_weekly_total, v_weekly_completed
    from public.kpi_tasks t
    where t.branch_id = v_branch_id and t.division_id = v_division_id and t.deleted_at is null
      and t.period_year = v_year and t.period_month = v_month and t.period_week = v_current_week;

  select count(*), count(*) filter (where t.status = 'completed')
    into v_monthly_total, v_monthly_completed
    from public.kpi_tasks t
    where t.branch_id = v_branch_id and t.division_id = v_division_id and t.deleted_at is null
      and t.period_year = v_year and t.period_month = v_month;

  select count(*) into v_overdue from public.kpi_tasks t
    where t.branch_id = v_branch_id and t.division_id = v_division_id and t.deleted_at is null
      and t.status = 'pending' and t.due_date is not null and t.due_date < current_date;

  select count(*) into v_waiting from public.kpi_tasks t
    where t.branch_id = v_branch_id and t.division_id = v_division_id and t.deleted_at is null
      and t.status = 'pending';

  return query select
    v_branch_id, v_branch_name, v_division_id, v_month, v_year, v_current_week,
    v_team_members,
    v_weekly_total, v_weekly_completed, v_weekly_total - v_weekly_completed,
    case when v_weekly_total = 0 then 0 else round(v_weekly_completed::numeric / v_weekly_total * 100, 1) end,
    v_monthly_total, v_monthly_completed, v_monthly_total - v_monthly_completed,
    case when v_monthly_total = 0 then 0 else round(v_monthly_completed::numeric / v_monthly_total * 100, 1) end,
    v_overdue, v_waiting;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ranking: one row per TEAM (branch), ordered strictly by Achievement %.
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
  branch_id uuid,
  branch_name text,
  team_members jsonb,
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
  with team_branches as (
    select distinct e.branch_id
    from public.employees e
    where e.deleted_at is null and e.employment_status = 'active' and e.division_id = v_division_id
      and (p_branch_id is null or e.branch_id = p_branch_id)
  ),
  team_roster as (
    select e.branch_id, jsonb_agg(jsonb_build_object('employee_id', e.id, 'full_name', e.full_name) order by e.full_name) as members
    from public.employees e
    where e.deleted_at is null and e.employment_status = 'active' and e.division_id = v_division_id
    group by e.branch_id
  ),
  ranked as (
    select
      tb.branch_id as branch_id, b.name as branch_name,
      coalesce(tr.members, '[]'::jsonb) as members,
      count(t.id) filter (where p_scope = 'monthly' or t.period_week = v_week) as assigned,
      count(t.id) filter (where (p_scope = 'monthly' or t.period_week = v_week) and t.status = 'completed') as completed,
      count(t.id) filter (where (p_scope = 'monthly' or t.period_week = v_week) and t.status = 'rejected') as rejected
    from team_branches tb
    join public.branches b on b.id = tb.branch_id
    left join team_roster tr on tr.branch_id = tb.branch_id
    left join public.kpi_tasks t on t.branch_id = tb.branch_id and t.division_id = v_division_id and t.deleted_at is null
      and t.period_year = v_year and t.period_month = v_month
    group by tb.branch_id, b.name, tr.members
  )
  select
    row_number() over (order by (case when ranked.assigned = 0 then 0 else ranked.completed::numeric / ranked.assigned end) desc, ranked.completed desc),
    ranked.branch_id, ranked.branch_name, ranked.members, ranked.assigned, ranked.completed, ranked.rejected,
    case when ranked.assigned = 0 then 0 else round(ranked.completed::numeric / ranked.assigned * 100, 1) end
  from ranked
  order by (case when ranked.assigned = 0 then 0 else ranked.completed::numeric / ranked.assigned end) desc, ranked.completed desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- Director dashboard: company-wide rollup + team ranking (no per-person
-- ranking anymore -- "the dashboard should no longer display employees
-- separately").
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
  team_count bigint,
  monthly_total bigint,
  monthly_completed bigint,
  monthly_achievement_percent numeric,
  overdue_count bigint,
  branch_ranking jsonb
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
  with team_branches as (
    select distinct e.branch_id
    from public.employees e
    where e.deleted_at is null and e.employment_status = 'active' and e.division_id = v_division_id
  ),
  per_branch as (
    select
      tb.branch_id as branch_id,
      count(t.id) filter (where t.period_year = v_year and t.period_month = v_month) as monthly_total,
      count(t.id) filter (where t.period_year = v_year and t.period_month = v_month and t.status = 'completed') as monthly_completed,
      count(t.id) filter (where t.status = 'pending' and t.due_date is not null and t.due_date < current_date) as overdue
    from team_branches tb
    left join public.kpi_tasks t on t.branch_id = tb.branch_id and t.division_id = v_division_id and t.deleted_at is null
    group by tb.branch_id
  ),
  per_branch_named as (
    select pb.branch_id as branch_id, b.name as branch_name, pb.monthly_total, pb.monthly_completed, pb.overdue
    from per_branch pb join public.branches b on b.id = pb.branch_id
  )
  select
    v_month, v_year, v_current_week,
    (select count(*) from team_branches),
    coalesce((select sum(pbn.monthly_total) from per_branch_named pbn), 0)::bigint,
    coalesce((select sum(pbn.monthly_completed) from per_branch_named pbn), 0)::bigint,
    case when coalesce((select sum(pbn.monthly_total) from per_branch_named pbn), 0) = 0 then 0
      else round(coalesce((select sum(pbn.monthly_completed) from per_branch_named pbn), 0)::numeric / (select sum(pbn.monthly_total) from per_branch_named pbn) * 100, 1) end,
    coalesce((select sum(pbn.overdue) from per_branch_named pbn), 0)::bigint,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'branch_id', pbn.branch_id, 'branch_name', pbn.branch_name,
        'assigned', pbn.monthly_total, 'completed', pbn.monthly_completed,
        'achievement_percent', case when pbn.monthly_total = 0 then 0 else round(pbn.monthly_completed::numeric / pbn.monthly_total * 100, 1) end
      ) order by (case when pbn.monthly_total = 0 then 0 else pbn.monthly_completed::numeric / pbn.monthly_total end) desc)
      from per_branch_named pbn),
      '[]'::jsonb
    );
end;
$$;
