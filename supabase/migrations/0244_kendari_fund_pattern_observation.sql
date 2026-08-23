-- ============================================================================
-- MK Connect — 0244: Observational views over Kendari's real fund/expense
-- pattern, read-only.
--
-- Owner's ask: before building the stock-control gaps identified for a NEW
-- cost-by-fee project, first study how Kendari's existing "modal -> keluar"
-- pattern actually behaves in practice -- Fasly (Kendari's Kepala Cabang,
-- see constants/rbac.ts and 0196) receives capital transfers
-- (construction_fund_transfers) and draws against it via
-- construction_submit_expense. Deliberately NOT touching Kendari's live
-- flow to do this: three plain read-only views over data that already
-- exists, no new tables, no new write path, no change to any existing
-- function, column, or RLS policy. Views are security-invoker (Postgres
-- default), so they inherit construction_expenses'/
-- construction_fund_transfers' existing RLS exactly -- a Kepala Cabang
-- still only sees their own branch's rows, same as querying those tables
-- directly today.
-- ============================================================================

-- Weekly cadence of modal in vs pengeluaran out, by category, with running
-- balance -- the shape of "how often and how much does Fasly draw against
-- what's been transferred."
create or replace view public.v_construction_fund_flow_weekly as
with events as (
  select
    project_id,
    date_trunc('week', transfer_date)::date as week_start,
    'in' as direction,
    'modal' as category,
    amount
  from public.construction_fund_transfers
  union all
  select
    project_id,
    date_trunc('week', expense_date)::date as week_start,
    'out' as direction,
    case
      when expense_type = 'gaji_tukang' then 'gaji'
      when expense_type in ('material_tunai', 'pembelian_material') then 'material'
      else 'lain_lain'
    end as category,
    amount
  from public.construction_expenses
),
weekly as (
  select
    project_id,
    week_start,
    coalesce(sum(amount) filter (where direction = 'in'), 0) as fund_in,
    coalesce(sum(amount) filter (where direction = 'out' and category = 'gaji'), 0) as expense_gaji,
    coalesce(sum(amount) filter (where direction = 'out' and category = 'material'), 0) as expense_material,
    coalesce(sum(amount) filter (where direction = 'out' and category = 'lain_lain'), 0) as expense_lain_lain,
    coalesce(sum(amount) filter (where direction = 'out'), 0) as expense_total
  from events
  group by project_id, week_start
)
select
  project_id,
  week_start,
  fund_in,
  expense_gaji,
  expense_material,
  expense_lain_lain,
  expense_total,
  sum(fund_in) over (partition by project_id order by week_start) as cumulative_fund_in,
  sum(expense_total) over (partition by project_id order by week_start) as cumulative_expense_total,
  sum(fund_in - expense_total) over (partition by project_id order by week_start) as running_balance
from weekly
order by project_id, week_start;

-- Every material-type expense (material_tunai/pembelian_material), flagged
-- by whether it actually got a material_id/quantity attached -- answers
-- "does Fasly's process actually specify WHAT was bought and how much, or
-- just an amount and a toko name?" before we design alias/PR flows around
-- an assumption of that detail existing.
create or replace view public.v_construction_material_expense_trace as
select
  e.id as expense_id,
  e.project_id,
  e.expense_date,
  e.party_name,
  e.amount,
  e.payment_method,
  e.material_id,
  m.name as material_name,
  e.quantity,
  (e.material_id is not null) as has_material_detail
from public.construction_expenses e
left join public.cm_materials m on m.id = e.material_id
where e.expense_type in ('material_tunai', 'pembelian_material')
order by e.project_id, e.expense_date desc;

-- Recurring parties (tukang/toko) per project + expense type -- the real
-- cast of names, useful later for designing material/vendor aliasing
-- without guessing.
create or replace view public.v_construction_party_frequency as
select
  project_id,
  expense_type,
  party_name,
  count(*) as occurrence_count,
  sum(amount) as total_amount,
  min(expense_date) as first_seen,
  max(expense_date) as last_seen
from public.construction_expenses
group by project_id, expense_type, party_name
order by project_id, occurrence_count desc;

grant select on public.v_construction_fund_flow_weekly to authenticated;
grant select on public.v_construction_material_expense_trace to authenticated;
grant select on public.v_construction_party_frequency to authenticated;
