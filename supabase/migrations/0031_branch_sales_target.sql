-- ============================================================================
-- MK Connect — 0031: Branch-based Sales Target
--
-- Matches the company's actual current process: business is run by Branch
-- (city), not by Project. Director / Director of Operations sets ONE
-- monthly target + commission % per BRANCH; the system automatically finds
-- every currently-ACTIVE Sales employee in that branch and splits the
-- target units evenly among them. Replaces the old per-Sales manual-entry
-- flow (crm_upsert_sales_target from 0024, no longer called by the app --
-- left in place as it's harmless and still callable, just unused).
--
-- Deliberately does NOT touch crm_sales_stats / crm_branch_stats /
-- crm_national_stats / crm_sales_ranking (0025, fixed in 0029) -- all of
-- them already read from sales_targets by sales_id, so once this RPC
-- populates that same table, every dashboard/report keeps working with
-- zero changes.
-- ============================================================================

create table public.branch_sales_targets (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null check (period_year between 2020 and 2100),
  target_units integer not null default 0 check (target_units >= 0),
  commission_percent numeric(5,2) not null default 0 check (commission_percent >= 0 and commission_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (branch_id, period_month, period_year)
);
create index branch_sales_targets_period_idx on public.branch_sales_targets (period_year, period_month);

create trigger set_updated_at before update on public.branch_sales_targets for each row execute function public.set_updated_at();
create trigger audit_log after insert or update or delete on public.branch_sales_targets for each row execute function public.audit_log_trigger();

alter table public.branch_sales_targets enable row level security;

create policy branch_sales_targets_select on public.branch_sales_targets for select to authenticated
  using (
    public.app_has_permission('sales_target.view_all')
    or (public.app_has_permission('sales_target.view_branch') and branch_id = public.app_current_branch_id())
  );

create policy branch_sales_targets_write on public.branch_sales_targets for all to authenticated
  using (public.app_has_permission('sales_target.manage'))
  with check (public.app_has_permission('sales_target.manage'));

-- ----------------------------------------------------------------------------
-- Set a branch's target and auto-distribute it evenly across active Sales.
-- Any remainder from integer division goes to the earliest-joined Sales
-- first, so the sum of individual targets always equals the branch total
-- exactly (e.g. 40 units / 4 Sales = 10 each; 41 / 4 = 11,10,10,10).
-- ----------------------------------------------------------------------------
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
  join public.roles r on r.id = e.role_id
  where e.branch_id = p_branch_id and e.deleted_at is null and e.employment_status = 'active' and r.key = 'sales';

  if v_sales_count = 0 then
    return query select v_branch_target_id, 0;
    return;
  end if;

  v_base := p_target_units / v_sales_count;
  v_remainder := p_target_units % v_sales_count;

  with ranked_sales as (
    select e.id as sales_id, row_number() over (order by e.join_date, e.id) as rn
    from public.employees e
    join public.roles r on r.id = e.role_id
    where e.branch_id = p_branch_id and e.deleted_at is null and e.employment_status = 'active' and r.key = 'sales'
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

-- Director of Operations, not only Director, sets branch targets per the
-- company's actual process.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'sales_target.manage'
where r.key = 'direktur_operasional'
on conflict do nothing;
