-- ============================================================================
-- MK Connect — 0033: Selling Price + revenue/commission math on Sales Target
--
-- One Branch = one Selling Price per Unit for that month, set alongside the
-- existing Target Unit / Commission %. Everything else derives from it:
--   Target Revenue        = target_units * selling_price_per_unit
--   Max Commission        = target_revenue * commission_percent / 100
-- Achievement Revenue and Estimated Commission stay exactly what they
-- already were (collection / commission from crm_sales_stats) -- both are
-- still ONLY ever real, Finance-approved money (prospect_payments where
-- status = 'approved'). Nothing about that rule changes here; Max
-- Commission is an informational "what you'd earn at 100% of target"
-- reference figure, not a payout cap -- actual commission is still purely
-- collection * commission_percent regardless of how it compares to Max.
--
-- selling_price_per_unit is stored on both branch_sales_targets (the
-- Director's input) and sales_targets (the per-Sales distributed snapshot,
-- same value copied to every Sales in the branch) -- mirrors exactly how
-- commission_percent already works, so crm_sales_stats keeps reading a
-- single flat row per Sales with no extra joins.
--
-- crm_set_branch_target and crm_sales_stats both change their signature/
-- return shape, which CREATE OR REPLACE cannot do in Postgres -- each is
-- dropped first (old signature only), then recreated.
-- ============================================================================

alter table public.branch_sales_targets
  add column selling_price_per_unit numeric(16,2) not null default 0 check (selling_price_per_unit >= 0);

alter table public.sales_targets
  add column selling_price_per_unit numeric(16,2) not null default 0 check (selling_price_per_unit >= 0);

drop function if exists public.crm_set_branch_target(uuid, smallint, smallint, integer, numeric);

create or replace function public.crm_set_branch_target(
  p_branch_id uuid,
  p_period_month smallint,
  p_period_year smallint,
  p_target_units integer,
  p_selling_price_per_unit numeric,
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

  insert into public.branch_sales_targets (
    branch_id, period_month, period_year, target_units, selling_price_per_unit, commission_percent, created_by, updated_by
  )
  values (
    p_branch_id, p_period_month, p_period_year, p_target_units, p_selling_price_per_unit, p_commission_percent, v_user_id, v_user_id
  )
  on conflict (branch_id, period_month, period_year) do update set
    target_units = excluded.target_units,
    selling_price_per_unit = excluded.selling_price_per_unit,
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
  insert into public.sales_targets (
    sales_id, period_month, period_year, target_units, selling_price_per_unit, commission_percent, created_by, updated_by
  )
  select
    rs.sales_id, p_period_month, p_period_year,
    v_base + case when rs.rn <= v_remainder then 1 else 0 end,
    p_selling_price_per_unit,
    p_commission_percent,
    v_user_id, v_user_id
  from ranked_sales rs
  on conflict (sales_id, period_month, period_year) do update set
    target_units = excluded.target_units,
    selling_price_per_unit = excluded.selling_price_per_unit,
    commission_percent = excluded.commission_percent,
    updated_by = v_user_id;

  return query select v_branch_target_id, v_sales_count;
end;
$$;

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
  v_selling_price numeric(16,2);
  v_commission_percent numeric(5,2);
  v_target_revenue numeric(18,2);
  v_max_commission numeric(18,2);
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
    v_sales_id, v_month, v_year, v_target_units, v_selling_price, v_commission_percent,
    v_target_revenue, v_max_commission,
    v_closing_units,
    case when v_target_units = 0 then 0 else round(v_closing_units::numeric / v_target_units * 100, 1) end,
    greatest(v_target_units - v_closing_units::integer, 0),
    v_collection, v_commission,
    v_red, v_yellow, v_green, v_closing, v_today_prospect, v_today_follow_up, v_late_follow_up;
end;
$$;
