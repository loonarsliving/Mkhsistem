-- ============================================================================
-- MK Connect — 0047: crm_monthly_trend
--
-- The only genuinely new reporting RPC needed for the CRM Dashboard rework
-- -- everything else (Total Prospects/Closing/Conversion, Collection,
-- Achievement, Lead Source Performance, Branch Performance, Branch/Sales
-- drill-down figures) is already covered by crm_national_stats /
-- crm_branch_stats / crm_sales_stats / crm_conversion_analytics /
-- crm_sales_ranking, reused as-is.
--
-- Returns one row per month for the last p_months_back months (oldest
-- first, so charts render left-to-right chronologically), scoped to a
-- branch, a single Sales, or company-wide when both are omitted. Same
-- permission model as crm_conversion_analytics: view_all, or view_branch
-- scoped to the caller's own branch, or the caller viewing their own
-- p_sales_id.
-- ============================================================================

create or replace function public.crm_monthly_trend(
  p_months_back smallint default 6,
  p_branch_id uuid default null,
  p_sales_id uuid default null
)
returns table (
  period_month smallint,
  period_year smallint,
  target_units integer,
  closing_units bigint,
  achievement_percent numeric,
  collection numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if p_sales_id is not null then
    if p_sales_id <> v_caller and not (
      public.app_has_permission('sales_target.view_all')
      or (
        public.app_has_permission('sales_target.view_branch')
        and exists (select 1 from public.employees e where e.id = p_sales_id and e.branch_id = public.app_current_branch_id())
      )
    ) then
      raise exception 'Insufficient permission' using errcode = '42501';
    end if;
  else
    if not (
      public.app_has_permission('crm_analytics.view_all')
      or (public.app_has_permission('crm_analytics.view_branch') and coalesce(p_branch_id, public.app_current_branch_id()) = public.app_current_branch_id())
    ) then
      raise exception 'Insufficient permission' using errcode = '42501';
    end if;
  end if;

  return query
  with months as (
    select
      extract(month from d)::smallint as period_month,
      extract(year from d)::smallint as period_year
    from generate_series(
      date_trunc('month', current_date) - ((greatest(p_months_back, 1) - 1)::text || ' months')::interval,
      date_trunc('month', current_date),
      interval '1 month'
    ) as d
  )
  select
    m.period_month,
    m.period_year,
    coalesce((
      select sum(st.target_units)::integer
      from public.sales_targets st
      join public.employees e on e.id = st.sales_id
      join public.divisions dv on dv.id = e.division_id and dv.name = 'Marketing & Sales'
      where st.period_month = m.period_month and st.period_year = m.period_year
        and (p_sales_id is null or st.sales_id = p_sales_id)
        and (p_branch_id is null or e.branch_id = p_branch_id)
    ), 0),
    coalesce((
      select count(*)
      from public.prospects p
      where p.status = 'closing' and p.closed_at is not null
        and extract(month from p.closed_at) = m.period_month and extract(year from p.closed_at) = m.period_year
        and (p_sales_id is null or p.sales_id = p_sales_id)
        and (p_branch_id is null or p.branch_id = p_branch_id)
    ), 0)::bigint,
    case
      when coalesce((
        select sum(st.target_units)
        from public.sales_targets st
        join public.employees e on e.id = st.sales_id
        join public.divisions dv on dv.id = e.division_id and dv.name = 'Marketing & Sales'
        where st.period_month = m.period_month and st.period_year = m.period_year
          and (p_sales_id is null or st.sales_id = p_sales_id)
          and (p_branch_id is null or e.branch_id = p_branch_id)
      ), 0) = 0 then 0
      else round(
        coalesce((
          select count(*) from public.prospects p
          where p.status = 'closing' and p.closed_at is not null
            and extract(month from p.closed_at) = m.period_month and extract(year from p.closed_at) = m.period_year
            and (p_sales_id is null or p.sales_id = p_sales_id)
            and (p_branch_id is null or p.branch_id = p_branch_id)
        ), 0)::numeric
        / (
          select sum(st.target_units)
          from public.sales_targets st
          join public.employees e on e.id = st.sales_id
          join public.divisions dv on dv.id = e.division_id and dv.name = 'Marketing & Sales'
          where st.period_month = m.period_month and st.period_year = m.period_year
            and (p_sales_id is null or st.sales_id = p_sales_id)
            and (p_branch_id is null or e.branch_id = p_branch_id)
        ) * 100, 1)
    end,
    coalesce((
      select sum(pp.amount)
      from public.prospect_payments pp
      join public.prospects p on p.id = pp.prospect_id
      where pp.status = 'approved'
        and extract(month from pp.approved_at) = m.period_month and extract(year from pp.approved_at) = m.period_year
        and (p_sales_id is null or p.sales_id = p_sales_id)
        and (p_branch_id is null or p.branch_id = p_branch_id)
    ), 0)
  from months m
  order by m.period_year, m.period_month;
end;
$$;
