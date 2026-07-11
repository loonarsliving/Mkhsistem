-- ============================================================================
-- MK Connect — 0032: Identify "Sales" by Division, not Role
--
-- Business correction: Role is authorization/RBAC only. Division determines
-- an employee's actual function. "Sales" = employees whose Division is
-- "Marketing & Sales" -- never the 'sales' Role. The 'sales' Role keeps
-- granting CRM permissions (prospect.create etc.) exactly as before; that
-- is unchanged and unrelated to this fix.
--
-- Confirmed against live data before writing this: the company already has
-- 15 real active employees in the "Marketing & Sales" division (6
-- Jabodetabek, 5 Jogja, 4 Makassar) -- every one of them currently has
-- Role = 'staff', not 'sales'. This is exactly why the old Role-based
-- filter always found nobody: the real Sales team was never given the
-- 'sales' Role, because Role was never meant to encode that.
--
-- Replaces the r.key = 'sales' filter (0025/0029/0031) with a Division-name
-- filter in the four places that decide who is Sales for target
-- distribution and reporting: crm_set_branch_target, crm_branch_stats,
-- crm_national_stats, crm_sales_ranking. Forward-fix via CREATE OR REPLACE;
-- no prior migration files are edited.
-- ============================================================================

create or replace function public.crm_set_branch_target(
  p_branch_id uuid,
  p_period_month smallint,
  p_period_year smallint,
  p_target_units integer,
  p_commission_percent numeric
)
returns table (
  branch_target_id uuid,
  distributed_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_branch_target_id uuid;
  v_sales_count integer;
  v_base integer;
  v_remainder integer;
begin
  if not public.app_has_permission('sales_target.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  insert into public.branch_sales_targets (branch_id, period_month, period_year, target_units, commission_percent, created_by, updated_by)
  values (p_branch_id, p_period_month, p_period_year, p_target_units, p_commission_percent, v_user_id, v_user_id)
  on conflict (branch_id, period_month, period_year) do update set
    target_units = excluded.target_units,
    commission_percent = excluded.commission_percent,
    updated_by = v_user_id
  returning id into v_branch_target_id;

  select count(*) into v_sales_count
  from public.employees e
  join public.divisions d on d.id = e.division_id
  where e.branch_id = p_branch_id and e.deleted_at is null and e.employment_status = 'active' and d.name = 'Marketing & Sales';

  if v_sales_count = 0 then
    return query select v_branch_target_id, 0;
    return;
  end if;

  v_base := p_target_units / v_sales_count;
  v_remainder := p_target_units % v_sales_count;

  with ranked_sales as (
    select e.id as sales_id, row_number() over (order by e.join_date, e.id) as rn
    from public.employees e
    join public.divisions d on d.id = e.division_id
    where e.branch_id = p_branch_id and e.deleted_at is null and e.employment_status = 'active' and d.name = 'Marketing & Sales'
  )
  insert into public.sales_targets (sales_id, period_month, period_year, target_units, commission_percent, created_by, updated_by)
  select
    rs.sales_id, p_period_month, p_period_year,
    v_base + case when rs.rn <= v_remainder then 1 else 0 end,
    p_commission_percent,
    v_user_id, v_user_id
  from ranked_sales rs
  on conflict (sales_id, period_month, period_year) do update set
    target_units = excluded.target_units,
    commission_percent = excluded.commission_percent,
    updated_by = v_user_id;

  return query select v_branch_target_id, v_sales_count;
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
    join public.divisions d on d.id = e.division_id
    where e.branch_id = v_branch_id and e.deleted_at is null and e.employment_status = 'active' and d.name = 'Marketing & Sales'
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
        left join public.employees e on e.branch_id = b.id and e.deleted_at is null and e.employment_status = 'active'
        left join public.divisions d on d.id = e.division_id and d.name = 'Marketing & Sales'
        left join public.sales_targets st on st.sales_id = e.id and st.period_month = v_month and st.period_year = v_year and d.name = 'Marketing & Sales'
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
    join public.divisions d on d.id = e.division_id
    join public.branches b on b.id = e.branch_id
    left join public.sales_targets st on st.sales_id = e.id and st.period_month = v_month and st.period_year = v_year
    where e.deleted_at is null and e.employment_status = 'active' and d.name = 'Marketing & Sales'
      and (p_branch_id is null or e.branch_id = p_branch_id)
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
