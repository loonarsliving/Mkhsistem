-- ============================================================================
-- MK Connect — 0062: Director Dashboard Total Revenue undercounts new
-- Target Management V2 targets
--
-- Root cause: crm_national_stats computed branch target_units/target_revenue
-- (which the Director Dashboard's "Total Revenue" tile reads directly) by
-- summing sales_targets -- the per-Sales-rep DISTRIBUTED table -- instead of
-- crm_target_headers/crm_target_details, the V2 source-of-truth SAVED
-- target. A newly-saved product with no Sales rep assigned yet to
-- crm_product_sales_assignments produces zero sales_targets rows (nothing
-- to distribute to), so its saved target silently never reached this
-- company-wide figure even though Target Management V2 showed it correctly.
--
-- Fix: branch_agg's target_units/target_revenue now come straight from
-- crm_target_headers + crm_target_details for the period, grouped by
-- branch -- the full committed target, independent of distribution/
-- assignment status. This is the correct source for a Director-level "what
-- did the company commit to" figure. crm_sales_stats and crm_branch_stats
-- are intentionally untouched -- those are legitimately about what's been
-- distributed to a given Sales rep/branch roster, a different question.
-- ============================================================================

create or replace function public.crm_national_stats(p_month smallint default null, p_year smallint default null)
returns table(period_month smallint, period_year smallint, total_prospects bigint, prospects_red bigint, prospects_yellow bigint, prospects_green bigint, prospects_closing bigint, conversion_percent numeric, total_target_units bigint, total_target_revenue numeric, total_closing_units bigint, achievement_percent numeric, collection numeric, monthly_growth_percent numeric, pending_finance_verification bigint, branch_ranking jsonb, top_sales jsonb)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
  with branch_target_agg as (
    select h.branch_id,
      coalesce(sum(d.target_unit), 0) as target_units,
      coalesce(sum(d.target_revenue), 0) as target_revenue
    from public.crm_target_headers h
    join public.crm_target_details d on d.target_header_id = h.id
    where h.period_month = v_month and h.period_year = v_year
    group by h.branch_id
  ),
  branch_agg as (
    select
      b.id as branch_id, b.name as branch_name,
      coalesce(bta.target_units, 0) as target_units,
      coalesce(bta.target_revenue, 0) as target_revenue,
      coalesce((select count(*) from public.prospects p where p.branch_id = b.id and p.status = 'closing'
        and p.closed_at is not null and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year), 0) as closing_units,
      coalesce((select sum(pp.amount) from public.prospect_payments pp join public.prospects p on p.id = pp.prospect_id
        where p.branch_id = b.id and pp.status = 'approved'
          and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year), 0) as collection
    from public.branches b
    left join branch_target_agg bta on bta.branch_id = b.id
    where b.deleted_at is null
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
$function$;
