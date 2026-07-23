-- ============================================================================
-- MK Connect — 0029: Fix crm_sales_ranking / crm_branch_stats runtime errors
--
-- Root cause (reproduced against the live database, not guessed):
--
-- 1. crm_sales_ranking() (0025) referenced `st.target_units` inside its
--    `ranked` CTE but never joined `public.sales_targets st` into that CTE's
--    FROM clause. Every call raised:
--      ERROR 42P01: missing FROM-clause entry for table "st"
--    crm_national_stats() calls crm_sales_ranking() to build `top_sales`,
--    and the dashboard calls crm_national_stats() for any role with
--    crm_analytics.view_all (Direktur Utama, Direktur Operasional, Finance,
--    Super Admin) — so the dashboard hard-crashed for those roles on every
--    load.
--
-- 2. crm_sales_ranking()'s final `RETURN QUERY select ...` referenced bare
--    column names (sales_id, full_name, branch_name, target_units,
--    closing_units, collection) that collide with the plpgsql function's
--    own implicitly-declared OUT variables (from RETURNS TABLE), which
--    Postgres cannot disambiguate:
--      ERROR 42702: column reference "sales_id" is ambiguous
--    This was masked by bug 1 above (the missing join failed first, before
--    this SELECT was ever reached) -- only surfaced once bug 1 was fixed
--    and the query actually ran. Fixed by qualifying every reference to
--    the `ranked` CTE.
--
-- 3. crm_branch_stats() (0025) declares its `closing_units` return column as
--    bigint, but the query returns coalesce(sum(ps.closing_units), 0) —
--    ps.closing_units is itself a `count(*)` subquery result (bigint), and
--    Postgres's sum(bigint) aggregate returns numeric, not bigint. Every
--    call raised:
--      ERROR 42804: structure of query does not match function result type
--      DETAIL: Returned type numeric does not match expected type bigint
--                in column 5.
--    The dashboard calls crm_branch_stats() for crm_analytics.view_branch
--    (Kepala Cabang) — so it hard-crashed for that role too.
--
-- Both functions pre-date the CRM Project Master change (0028); Project
-- Master added no columns or logic either function touches. They only
-- started being hit once Director/Branch-Manager-tier accounts (the same
-- accounts Project Master is gated to) began loading the dashboard.
--
-- Per instructions, this is a forward-fix migration rather than an edit to
-- 0025 — CREATE OR REPLACE FUNCTION replaces the live function body in
-- place, function signatures are unchanged.
-- ============================================================================

create or replace function public.crm_sales_ranking(
  p_month smallint default null,
  p_year smallint default null,
  p_branch_id uuid default null
)
returns table (
  rank bigint,
  sales_id uuid,
  full_name text,
  branch_name text,
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
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
begin
  if not (
    public.app_has_permission('crm_analytics.view_all')
    or (public.app_has_permission('crm_analytics.view_branch') and coalesce(p_branch_id, public.app_current_branch_id()) = public.app_current_branch_id())
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  return query
  with ranked as (
    select
      e.id as sales_id, e.full_name, b.name as branch_name,
      coalesce(st.target_units, 0) as target_units,
      coalesce((select count(*) from public.prospects p where p.sales_id = e.id and p.status = 'closing'
        and p.closed_at is not null and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year), 0) as closing_units,
      coalesce((select sum(pp.amount) from public.prospect_payments pp join public.prospects p on p.id = pp.prospect_id
        where p.sales_id = e.id and pp.status = 'approved'
          and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year), 0) as collection
    from public.employees e
    join public.roles r on r.id = e.role_id and r.key = 'sales'
    join public.branches b on b.id = e.branch_id
    left join public.sales_targets st on st.sales_id = e.id and st.period_month = v_month and st.period_year = v_year
    where e.deleted_at is null and (p_branch_id is null or e.branch_id = p_branch_id)
  )
  select
    row_number() over (order by (case when ranked.target_units = 0 then 0 else ranked.closing_units::numeric / ranked.target_units end) desc, ranked.closing_units desc),
    ranked.sales_id, ranked.full_name, ranked.branch_name, ranked.target_units, ranked.closing_units,
    case when ranked.target_units = 0 then 0 else round(ranked.closing_units::numeric / ranked.target_units * 100, 1) end,
    ranked.collection
  from ranked
  order by (case when ranked.target_units = 0 then 0 else ranked.closing_units::numeric / ranked.target_units end) desc, ranked.closing_units desc;
end;
$$;

create or replace function public.crm_branch_stats(
  p_branch_id uuid default null,
  p_month smallint default null,
  p_year smallint default null
)
returns table (
  branch_id uuid,
  period_month smallint,
  period_year smallint,
  target_units bigint,
  closing_units bigint,
  achievement_percent numeric,
  collection numeric,
  commission numeric,
  prospects_red bigint,
  prospects_yellow bigint,
  prospects_green bigint,
  prospects_closing bigint,
  sales_performance jsonb
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
begin
  if not (
    public.app_has_permission('crm_analytics.view_all')
    or (public.app_has_permission('crm_analytics.view_branch') and v_branch_id = public.app_current_branch_id())
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  return query
  with branch_sales as (
    select e.id as sales_id, e.full_name
    from public.employees e
    join public.roles r on r.id = e.role_id
    where e.branch_id = v_branch_id and e.deleted_at is null and r.key = 'sales'
  ),
  per_sales as (
    select
      bs.sales_id, bs.full_name,
      coalesce(st.target_units, 0) as target_units,
      coalesce(st.commission_percent, 0) as commission_percent,
      (select count(*) from public.prospects p where p.sales_id = bs.sales_id and p.status = 'closing'
        and p.closed_at is not null and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year) as closing_units,
      (select coalesce(sum(pp.amount), 0) from public.prospect_payments pp join public.prospects p on p.id = pp.prospect_id
        where p.sales_id = bs.sales_id and pp.status = 'approved'
          and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year) as collection,
      (select coalesce(sum(pp.commission_amount), 0) from public.prospect_payments pp join public.prospects p on p.id = pp.prospect_id
        where p.sales_id = bs.sales_id and pp.status = 'approved'
          and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year) as commission
    from branch_sales bs
    left join public.sales_targets st on st.sales_id = bs.sales_id and st.period_month = v_month and st.period_year = v_year
  )
  select
    v_branch_id, v_month, v_year,
    coalesce(sum(ps.target_units), 0),
    coalesce(sum(ps.closing_units), 0)::bigint,
    case when coalesce(sum(ps.target_units), 0) = 0 then 0
      else round(coalesce(sum(ps.closing_units), 0)::numeric / sum(ps.target_units) * 100, 1) end,
    coalesce(sum(ps.collection), 0),
    coalesce(sum(ps.commission), 0),
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'red'),
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'yellow'),
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'green'),
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'closing'),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'sales_id', ps.sales_id, 'full_name', ps.full_name,
        'target_units', ps.target_units, 'closing_units', ps.closing_units,
        'achievement_percent', case when ps.target_units = 0 then 0 else round(ps.closing_units::numeric / ps.target_units * 100, 1) end,
        'collection', ps.collection, 'commission', ps.commission
      ) order by (case when ps.target_units = 0 then 0 else ps.closing_units::numeric / ps.target_units end) desc)
      from per_sales ps),
      '[]'::jsonb
    )
  from per_sales ps;
end;
$$;
