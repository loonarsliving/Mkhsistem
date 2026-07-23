-- ============================================================================
-- MK Connect — 0025: CRM reporting functions
-- All dashboard/ranking/analytics numbers are computed here, server-side, so
-- the UI never re-derives Achievement %, Collection or Commission itself
-- ("no manual calculation"). Every function does its own permission check
-- and defaults its period to the current month/year when not given one.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Per-Sales dashboard stats (Sales Home Dashboard + Sales Dashboard).
-- ----------------------------------------------------------------------------
create or replace function public.crm_sales_stats(
  p_sales_id uuid default null,
  p_month smallint default null,
  p_year smallint default null
)
returns table (
  sales_id uuid,
  period_month smallint,
  period_year smallint,
  target_units integer,
  commission_percent numeric,
  closing_units bigint,
  achievement_percent numeric,
  remaining_target integer,
  collection numeric,
  commission numeric,
  prospects_red bigint,
  prospects_yellow bigint,
  prospects_green bigint,
  prospects_closing bigint,
  today_prospect bigint,
  today_follow_up bigint,
  late_follow_up bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_sales_id uuid := coalesce(p_sales_id, v_caller);
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
  v_target_units integer;
  v_commission_percent numeric(5,2);
  v_closing_units bigint;
  v_collection numeric(14,2);
  v_commission numeric(14,2);
  v_red bigint;
  v_yellow bigint;
  v_green bigint;
  v_closing bigint;
  v_today_prospect bigint;
  v_today_follow_up bigint;
  v_late_follow_up bigint;
begin
  if v_sales_id <> v_caller then
    if not (
      public.app_has_permission('sales_target.view_all')
      or (
        public.app_has_permission('sales_target.view_branch')
        and exists (select 1 from public.employees e where e.id = v_sales_id and e.branch_id = public.app_current_branch_id())
      )
    ) then
      raise exception 'Insufficient permission' using errcode = '42501';
    end if;
  end if;

  select st.target_units, st.commission_percent into v_target_units, v_commission_percent
  from public.sales_targets st
  where st.sales_id = v_sales_id and st.period_month = v_month and st.period_year = v_year;
  v_target_units := coalesce(v_target_units, 0);
  v_commission_percent := coalesce(v_commission_percent, 0);

  select count(*) into v_closing_units from public.prospects p
    where p.sales_id = v_sales_id and p.status = 'closing' and p.closed_at is not null
      and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year;

  select coalesce(sum(pp.amount), 0), coalesce(sum(pp.commission_amount), 0) into v_collection, v_commission
    from public.prospect_payments pp
    join public.prospects p on p.id = pp.prospect_id
    where p.sales_id = v_sales_id and pp.status = 'approved'
      and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year;

  select count(*) filter (where p.status = 'red'),
         count(*) filter (where p.status = 'yellow'),
         count(*) filter (where p.status = 'green'),
         count(*) filter (where p.status = 'closing'),
         count(*) filter (where p.created_at::date = current_date)
    into v_red, v_yellow, v_green, v_closing, v_today_prospect
    from public.prospects p
    where p.sales_id = v_sales_id and p.deleted_at is null;

  select count(*) into v_today_follow_up from public.prospect_follow_ups f
    join public.prospects p on p.id = f.prospect_id
    where p.sales_id = v_sales_id and f.activity_date = current_date;

  select count(*) into v_late_follow_up from public.prospects p
    where p.sales_id = v_sales_id and p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and coalesce(p.last_follow_up_at, p.created_at) < now() - interval '7 days';

  return query select
    v_sales_id, v_month, v_year, v_target_units, v_commission_percent,
    v_closing_units,
    case when v_target_units = 0 then 0 else round(v_closing_units::numeric / v_target_units * 100, 1) end,
    greatest(v_target_units - v_closing_units::integer, 0),
    v_collection, v_commission,
    v_red, v_yellow, v_green, v_closing, v_today_prospect, v_today_follow_up, v_late_follow_up;
end;
$$;

-- ----------------------------------------------------------------------------
-- Branch Manager dashboard: branch-wide rollup + per-sales performance table.
-- ----------------------------------------------------------------------------
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
    coalesce(sum(ps.closing_units), 0),
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

-- ----------------------------------------------------------------------------
-- Director dashboard: national rollup + branch ranking + top sales.
-- ----------------------------------------------------------------------------
create or replace function public.crm_national_stats(
  p_month smallint default null,
  p_year smallint default null
)
returns table (
  period_month smallint,
  period_year smallint,
  total_prospects bigint,
  prospects_red bigint,
  prospects_yellow bigint,
  prospects_green bigint,
  prospects_closing bigint,
  conversion_percent numeric,
  collection numeric,
  commission numeric,
  branch_ranking jsonb,
  top_sales jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
  v_total bigint;
  v_red bigint;
  v_yellow bigint;
  v_green bigint;
  v_closing bigint;
begin
  if not public.app_has_permission('crm_analytics.view_all') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select count(*) filter (where deleted_at is null),
         count(*) filter (where deleted_at is null and status = 'red'),
         count(*) filter (where deleted_at is null and status = 'yellow'),
         count(*) filter (where deleted_at is null and status = 'green'),
         count(*) filter (where deleted_at is null and status = 'closing')
    into v_total, v_red, v_yellow, v_green, v_closing
    from public.prospects;

  return query
  select
    v_month, v_year, v_total, v_red, v_yellow, v_green, v_closing,
    case when v_total = 0 then 0 else round(v_closing::numeric / v_total * 100, 1) end,
    (select coalesce(sum(pp.amount), 0) from public.prospect_payments pp
      where pp.status = 'approved' and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year),
    (select coalesce(sum(pp.commission_amount), 0) from public.prospect_payments pp
      where pp.status = 'approved' and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'branch_id', bs.branch_id, 'branch_name', bs.branch_name,
        'target_units', bs.target_units, 'closing_units', bs.closing_units,
        'achievement_percent', case when bs.target_units = 0 then 0 else round(bs.closing_units::numeric / bs.target_units * 100, 1) end,
        'collection', bs.collection
      ) order by (case when bs.target_units = 0 then 0 else bs.closing_units::numeric / bs.target_units end) desc)
      from (
        select
          b.id as branch_id, b.name as branch_name,
          coalesce(sum(st.target_units), 0) as target_units,
          coalesce((select count(*) from public.prospects p where p.branch_id = b.id and p.status = 'closing'
            and p.closed_at is not null and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year), 0) as closing_units,
          coalesce((select sum(pp.amount) from public.prospect_payments pp join public.prospects p on p.id = pp.prospect_id
            where p.branch_id = b.id and pp.status = 'approved'
              and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year), 0) as collection
        from public.branches b
        left join public.employees e on e.branch_id = b.id and e.deleted_at is null
        left join public.roles r on r.id = e.role_id and r.key = 'sales'
        left join public.sales_targets st on st.sales_id = e.id and st.period_month = v_month and st.period_year = v_year and r.key = 'sales'
        where b.deleted_at is null
        group by b.id, b.name
      ) bs),
      '[]'::jsonb
    ),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'sales_id', s.sales_id, 'full_name', s.full_name, 'branch_name', s.branch_name,
        'target_units', s.target_units, 'closing_units', s.closing_units, 'achievement_percent', s.achievement_percent
      ))
      from public.crm_sales_ranking(v_month, v_year, null) s
      limit 5),
      '[]'::jsonb
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- Ranking: ordered strictly by Achievement % (never by raw units sold).
-- ----------------------------------------------------------------------------
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
    where e.deleted_at is null and (p_branch_id is null or e.branch_id = p_branch_id)
  )
  select
    row_number() over (order by (case when target_units = 0 then 0 else closing_units::numeric / target_units end) desc, closing_units desc),
    sales_id, full_name, branch_name, target_units, closing_units,
    case when target_units = 0 then 0 else round(closing_units::numeric / target_units * 100, 1) end,
    collection
  from ranked
  order by (case when target_units = 0 then 0 else closing_units::numeric / target_units end) desc, closing_units desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- Conversion analytics. Period is optional -- null means all-time.
-- ----------------------------------------------------------------------------
create or replace function public.crm_conversion_analytics(
  p_branch_id uuid default null,
  p_month smallint default null,
  p_year smallint default null
)
returns table (
  total_prospects bigint,
  total_closing bigint,
  conversion_percent numeric,
  avg_follow_up_days numeric,
  avg_closing_days numeric,
  lead_source_performance jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch_id uuid := coalesce(p_branch_id, case when public.app_has_permission('crm_analytics.view_all') then null else public.app_current_branch_id() end);
begin
  if not (
    public.app_has_permission('crm_analytics.view_all')
    or (public.app_has_permission('crm_analytics.view_branch') and (v_branch_id is null or v_branch_id = public.app_current_branch_id()))
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  return query
  with scoped as (
    select p.* from public.prospects p
    where p.deleted_at is null
      and (v_branch_id is null or p.branch_id = v_branch_id)
      and (p_month is null or extract(month from p.created_at) = p_month)
      and (p_year is null or extract(year from p.created_at) = p_year)
  ),
  first_follow_up as (
    select f.prospect_id, min(f.created_at) as first_at
    from public.prospect_follow_ups f
    join scoped s on s.id = f.prospect_id
    group by f.prospect_id
  )
  select
    (select count(*) from scoped),
    (select count(*) from scoped where status = 'closing'),
    case when (select count(*) from scoped) = 0 then 0
      else round((select count(*) from scoped where status = 'closing')::numeric / (select count(*) from scoped) * 100, 1) end,
    (select round(avg(extract(epoch from (ffu.first_at - s.created_at)) / 86400), 1)
      from scoped s join first_follow_up ffu on ffu.prospect_id = s.id),
    (select round(avg(extract(epoch from (s.closed_at - s.created_at)) / 86400), 1)
      from scoped s where s.status = 'closing' and s.closed_at is not null),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'lead_source', ls.lead_source, 'total', ls.total, 'closing', ls.closing,
        'conversion_percent', case when ls.total = 0 then 0 else round(ls.closing::numeric / ls.total * 100, 1) end
      ) order by ls.total desc)
      from (
        select s.lead_source, count(*) as total, count(*) filter (where s.status = 'closing') as closing
        from scoped s
        group by s.lead_source
      ) ls),
      '[]'::jsonb
    );
end;
$$;
