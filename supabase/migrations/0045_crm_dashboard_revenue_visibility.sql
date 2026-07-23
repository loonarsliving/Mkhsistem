-- ============================================================================
-- MK Connect — 0045: CRM dashboard revenue + role-scoped visibility
--
-- Reworks the three CRM reporting RPCs backing the home dashboard so each
-- role only gets the figures its responsibility actually covers:
--
--   crm_sales_stats    -- Sales only. Commission split into two figures:
--                          estimated_commission (every Finance-approved
--                          payment this period, even a partial installment
--                          on a still-open deal) and verified_commission
--                          (the subset whose deal has fully reached
--                          Closing -- locked in, ready to pay). Both are
--                          already scoped to a single sales_id by the
--                          existing permission check -- commission was
--                          always single-Sales-only, this just makes the
--                          two distinct figures explicit.
--   crm_branch_stats    -- Branch Manager. No commission at all (branch
--                          performance, not personal pay); adds
--                          target_revenue, active_sales_count, and
--                          pending_finance_verification.
--   crm_national_stats  -- Director of Operations / Direktur Utama. No
--                          commission; adds company-wide target_units/
--                          target_revenue/achievement, monthly_growth_percent
--                          (vs previous month's Collection), and
--                          pending_finance_verification. branch_ranking
--                          gains target_revenue per branch.
--
-- Target Revenue is always target_units * selling_price_per_unit, summed
-- server-side from sales_targets -- never computed client-side. All three
-- functions change their return shape, so each is DROP + CREATE.
-- ============================================================================

drop function if exists public.crm_sales_stats(uuid, smallint, smallint);

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
  selling_price_per_unit numeric,
  commission_percent numeric,
  target_revenue numeric,
  max_commission numeric,
  closing_units bigint,
  achievement_percent numeric,
  remaining_target integer,
  collection numeric,
  estimated_commission numeric,
  verified_commission numeric,
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
  v_selling_price numeric(16,2);
  v_commission_percent numeric(5,2);
  v_target_revenue numeric(18,2);
  v_max_commission numeric(18,2);
  v_closing_units bigint;
  v_collection numeric(14,2);
  v_estimated_commission numeric(14,2);
  v_verified_commission numeric(14,2);
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

  select st.target_units, st.selling_price_per_unit, st.commission_percent
    into v_target_units, v_selling_price, v_commission_percent
  from public.sales_targets st
  where st.sales_id = v_sales_id and st.period_month = v_month and st.period_year = v_year;
  v_target_units := coalesce(v_target_units, 0);
  v_selling_price := coalesce(v_selling_price, 0);
  v_commission_percent := coalesce(v_commission_percent, 0);
  v_target_revenue := v_target_units * v_selling_price;
  v_max_commission := round(v_target_revenue * v_commission_percent / 100, 2);

  select count(*) into v_closing_units from public.prospects p
    where p.sales_id = v_sales_id and p.status = 'closing' and p.closed_at is not null
      and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year;

  select coalesce(sum(pp.amount), 0), coalesce(sum(pp.commission_amount), 0) into v_collection, v_estimated_commission
    from public.prospect_payments pp
    join public.prospects p on p.id = pp.prospect_id
    where p.sales_id = v_sales_id and pp.status = 'approved'
      and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year;

  select coalesce(sum(pp.commission_amount), 0) into v_verified_commission
    from public.prospect_payments pp
    join public.prospects p on p.id = pp.prospect_id
    where p.sales_id = v_sales_id and pp.status = 'approved' and p.status = 'closing'
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
    v_sales_id, v_month, v_year, v_target_units, v_selling_price, v_commission_percent,
    v_target_revenue, v_max_commission,
    v_closing_units,
    case when v_target_units = 0 then 0 else round(v_closing_units::numeric / v_target_units * 100, 1) end,
    greatest(v_target_units - v_closing_units::integer, 0),
    v_collection, v_estimated_commission, v_verified_commission,
    v_red, v_yellow, v_green, v_closing, v_today_prospect, v_today_follow_up, v_late_follow_up;
end;
$$;

drop function if exists public.crm_branch_stats(uuid, smallint, smallint);

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
  target_revenue numeric,
  closing_units bigint,
  achievement_percent numeric,
  collection numeric,
  active_sales_count bigint,
  pending_finance_verification bigint,
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
      coalesce(st.selling_price_per_unit, 0) as selling_price_per_unit,
      (select count(*) from public.prospects p where p.sales_id = bs.sales_id and p.status = 'closing'
        and p.closed_at is not null and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year) as closing_units,
      (select coalesce(sum(pp.amount), 0) from public.prospect_payments pp join public.prospects p on p.id = pp.prospect_id
        where p.sales_id = bs.sales_id and pp.status = 'approved'
          and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year) as collection
    from branch_sales bs
    left join public.sales_targets st on st.sales_id = bs.sales_id and st.period_month = v_month and st.period_year = v_year
  )
  select
    v_branch_id, v_month, v_year,
    coalesce(sum(ps.target_units), 0)::bigint,
    coalesce(sum(ps.target_units * ps.selling_price_per_unit), 0),
    coalesce(sum(ps.closing_units), 0)::bigint,
    case when coalesce(sum(ps.target_units), 0) = 0 then 0
      else round(coalesce(sum(ps.closing_units), 0)::numeric / sum(ps.target_units) * 100, 1) end,
    coalesce(sum(ps.collection), 0),
    (select count(*) from branch_sales)::bigint,
    (select count(*) from public.prospect_payments pp join public.prospects p on p.id = pp.prospect_id
      where p.branch_id = v_branch_id and pp.status = 'pending')::bigint,
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'red'),
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'yellow'),
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'green'),
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'closing'),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'sales_id', ps.sales_id, 'full_name', ps.full_name,
        'target_units', ps.target_units, 'closing_units', ps.closing_units,
        'achievement_percent', case when ps.target_units = 0 then 0 else round(ps.closing_units::numeric / ps.target_units * 100, 1) end,
        'collection', ps.collection
      ) order by (case when ps.target_units = 0 then 0 else ps.closing_units::numeric / ps.target_units end) desc)
      from per_sales ps),
      '[]'::jsonb
    )
  from per_sales ps;
end;
$$;

drop function if exists public.crm_national_stats(smallint, smallint);

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
  total_target_units bigint,
  total_target_revenue numeric,
  total_closing_units bigint,
  achievement_percent numeric,
  collection numeric,
  monthly_growth_percent numeric,
  pending_finance_verification bigint,
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
  v_prev_month smallint;
  v_prev_year smallint;
  v_total bigint;
  v_red bigint;
  v_yellow bigint;
  v_green bigint;
  v_closing bigint;
  v_collection numeric(14,2);
  v_prev_collection numeric(14,2);
begin
  if not public.app_has_permission('crm_analytics.view_all') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if v_month = 1 then
    v_prev_month := 12; v_prev_year := v_year - 1;
  else
    v_prev_month := v_month - 1; v_prev_year := v_year;
  end if;

  select count(*) filter (where deleted_at is null),
         count(*) filter (where deleted_at is null and status = 'red'),
         count(*) filter (where deleted_at is null and status = 'yellow'),
         count(*) filter (where deleted_at is null and status = 'green'),
         count(*) filter (where deleted_at is null and status = 'closing')
    into v_total, v_red, v_yellow, v_green, v_closing
    from public.prospects;

  select coalesce(sum(pp.amount), 0) into v_collection from public.prospect_payments pp
    where pp.status = 'approved' and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year;

  select coalesce(sum(pp.amount), 0) into v_prev_collection from public.prospect_payments pp
    where pp.status = 'approved' and extract(month from pp.approved_at) = v_prev_month and extract(year from pp.approved_at) = v_prev_year;

  return query
  with branch_agg as (
    select
      b.id as branch_id, b.name as branch_name,
      coalesce(sum(st.target_units), 0) as target_units,
      coalesce(sum(st.target_units * st.selling_price_per_unit), 0) as target_revenue,
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
  )
  select
    v_month, v_year, v_total, v_red, v_yellow, v_green, v_closing,
    case when v_total = 0 then 0 else round(v_closing::numeric / v_total * 100, 1) end,
    coalesce((select sum(ba.target_units) from branch_agg ba), 0)::bigint,
    coalesce((select sum(ba.target_revenue) from branch_agg ba), 0),
    coalesce((select sum(ba.closing_units) from branch_agg ba), 0)::bigint,
    case when coalesce((select sum(ba.target_units) from branch_agg ba), 0) = 0 then 0
      else round(coalesce((select sum(ba.closing_units) from branch_agg ba), 0)::numeric / (select sum(ba.target_units) from branch_agg ba) * 100, 1) end,
    v_collection,
    case when v_prev_collection = 0 then null
      else round((v_collection - v_prev_collection) / v_prev_collection * 100, 1) end,
    (select count(*) from public.prospect_payments where status = 'pending')::bigint,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'branch_id', ba.branch_id, 'branch_name', ba.branch_name,
        'target_units', ba.target_units, 'target_revenue', ba.target_revenue,
        'closing_units', ba.closing_units,
        'achievement_percent', case when ba.target_units = 0 then 0 else round(ba.closing_units::numeric / ba.target_units * 100, 1) end,
        'collection', ba.collection
      ) order by (case when ba.target_units = 0 then 0 else ba.closing_units::numeric / ba.target_units end) desc)
      from branch_agg ba),
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
