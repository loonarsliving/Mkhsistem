-- ============================================================================
-- MK Connect — 0043: Fix ambiguous column references in kpi_ranking
--
-- Same bug class again (0029/0040/0042): kpi_ranking's RETURNS TABLE
-- declares employee_id/full_name/branch_name/division_name/assigned/
-- completed/rejected as output columns (implicit plpgsql variables), which
-- collided with the bare references of the same names in the final
-- `select ... from ranked` -- caught live via jwt-impersonation testing
-- ("column reference employee_id is ambiguous"). Fixed by qualifying every
-- final-select reference with the `ranked.` CTE alias, exactly like the
-- crm_sales_ranking fix in 0029.
-- ============================================================================

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
    row_number() over (order by (case when ranked.assigned = 0 then 0 else ranked.completed::numeric / ranked.assigned end) desc, ranked.completed desc),
    ranked.employee_id, ranked.full_name, ranked.branch_name, ranked.division_name, ranked.assigned, ranked.completed, ranked.rejected,
    case when ranked.assigned = 0 then 0 else round(ranked.completed::numeric / ranked.assigned * 100, 1) end
  from ranked
  order by (case when ranked.assigned = 0 then 0 else ranked.completed::numeric / ranked.assigned end) desc, ranked.completed desc;
end;
$$;
