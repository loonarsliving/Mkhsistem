-- ============================================================================
-- MK Connect — 0056: Minimal Payroll / HR-expense modules + outbound sync
--
-- MK Connect had no payroll, bonus, reimbursement, or HR-expense module at
-- all before this migration (see README/features — only CRM commission
-- existed, handled separately in 0057). The Finance-sync brief requires
-- these six approval events to auto-create expense transactions in MKH
-- Property:
--   1. Payroll approved            -> payroll_runs.status: draft -> approved
--   2. Employee salary generated   -> payroll_items insert (one per employee)
--   3. Sales commission approved   -> handled in 0057 (prospect_payments)
--   4. Bonus approved              -> hr_expenses.expense_type = 'bonus'
--   5. Reimbursement approved      -> hr_expenses.expense_type = 'reimbursement'
--   6. Other HR expenses approved  -> hr_expenses.expense_type = 'other'
--
-- Each approval enqueues a public.sync_log row (direction='outbound') via a
-- trigger; public.sync_dispatch_pending() (0055) delivers it to MKH
-- Property. Business/ledger logic (which COA account, double-entry) lives on
-- the MKH Property side, which stays the sole owner of the general ledger.
-- ============================================================================

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null check (period_year >= 2020),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  total_amount numeric(14, 2) not null default 0,
  created_by uuid references public.employees(id),
  approved_by uuid references public.employees(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (branch_id, period_month, period_year)
);

create table public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  base_salary numeric(14, 2) not null default 0,
  allowances numeric(14, 2) not null default 0,
  deductions numeric(14, 2) not null default 0,
  net_salary numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);

create table public.hr_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_type text not null check (expense_type in ('bonus', 'reimbursement', 'other')),
  employee_id uuid not null references public.employees(id),
  branch_id uuid not null references public.branches(id),
  amount numeric(14, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references public.employees(id),
  approved_by uuid references public.employees(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;
alter table public.hr_expenses enable row level security;

-- ----------------------------------------------------------------------------
-- Permissions (mirrors constants/rbac.ts convention from 01_rbac_seed.sql —
-- keep that file in sync when this ships).
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('payroll.manage', 'Create and approve payroll runs, generating employee salary lines'),
  ('hr_expense.create', 'Submit bonus/reimbursement/other HR expense requests'),
  ('hr_expense.approve', 'Approve or reject bonus/reimbursement/other HR expense requests')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('hr', 'finance', 'super_admin', 'direktur_operasional')
  and p.key = 'payroll.manage'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('hr', 'finance', 'super_admin', 'direktur_operasional', 'staff', 'sales', 'markom', 'manager', 'kepala_cabang')
  and p.key = 'hr_expense.create'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('hr', 'finance', 'super_admin', 'direktur_operasional')
  and p.key = 'hr_expense.approve'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS: viewer needs payroll.manage/hr_expense.* or must be the employee the
-- row is about (self-view of own payslips/requests).
-- ----------------------------------------------------------------------------
create policy payroll_runs_select on public.payroll_runs for select
  using (public.app_has_permission('payroll.manage'));
create policy payroll_runs_write on public.payroll_runs for all
  using (public.app_has_permission('payroll.manage'))
  with check (public.app_has_permission('payroll.manage'));

create policy payroll_items_select on public.payroll_items for select
  using (public.app_has_permission('payroll.manage') or employee_id = auth.uid());
create policy payroll_items_write on public.payroll_items for all
  using (public.app_has_permission('payroll.manage'))
  with check (public.app_has_permission('payroll.manage'));

create policy hr_expenses_select on public.hr_expenses for select
  using (public.app_has_permission('hr_expense.approve') or employee_id = auth.uid());
create policy hr_expenses_insert on public.hr_expenses for insert
  with check (public.app_has_permission('hr_expense.create'));
create policy hr_expenses_update on public.hr_expenses for update
  using (public.app_has_permission('hr_expense.approve'))
  with check (public.app_has_permission('hr_expense.approve'));

create or replace function public.create_payroll_run(p_branch_id uuid, p_period_month smallint, p_period_year smallint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.app_has_permission('payroll.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  insert into public.payroll_runs (branch_id, period_month, period_year, created_by)
  values (p_branch_id, p_period_month, p_period_year, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- approve_payroll_run(): approves the run header AND generates the salary
-- lines in one call (satisfies both "payroll approved" and "salary
-- generated" events; each is logged to sync_log separately for audit).
-- p_items: [{ "employee_id": uuid, "base_salary": numeric, "allowances": numeric, "deductions": numeric }, ...]
-- ----------------------------------------------------------------------------
create or replace function public.approve_payroll_run(p_payroll_run_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_run public.payroll_runs%rowtype;
  v_item jsonb;
  v_net numeric(14, 2);
  v_total numeric(14, 2) := 0;
begin
  if not public.app_has_permission('payroll.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_run from public.payroll_runs where id = p_payroll_run_id for update;
  if not found then
    raise exception 'Payroll run not found';
  end if;
  if v_run.status <> 'draft' then
    raise exception 'Payroll run already approved';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one salary line is required';
  end if;

  update public.payroll_runs
    set status = 'approved', approved_by = v_user_id, approved_at = now()
    where id = p_payroll_run_id;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
  values (
    'outbound', 'payroll_run_approved', 'payroll_runs', p_payroll_run_id,
    'mkc:payroll_run:' || p_payroll_run_id,
    jsonb_build_object(
      'payroll_run_id', p_payroll_run_id,
      'branch_id', v_run.branch_id,
      'period_month', v_run.period_month,
      'period_year', v_run.period_year
    )
  )
  on conflict (idempotency_key) do nothing;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_net := coalesce((v_item ->> 'base_salary')::numeric, 0)
           + coalesce((v_item ->> 'allowances')::numeric, 0)
           - coalesce((v_item ->> 'deductions')::numeric, 0);
    v_total := v_total + v_net;

    insert into public.payroll_items (payroll_run_id, employee_id, base_salary, allowances, deductions, net_salary)
    values (
      p_payroll_run_id,
      (v_item ->> 'employee_id')::uuid,
      coalesce((v_item ->> 'base_salary')::numeric, 0),
      coalesce((v_item ->> 'allowances')::numeric, 0),
      coalesce((v_item ->> 'deductions')::numeric, 0),
      v_net
    );
  end loop;

  update public.payroll_runs set total_amount = v_total where id = p_payroll_run_id;
end;
$$;

-- Trigger: one sync_log row per generated salary line ("salary generated" event).
create or replace function public.trg_payroll_item_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_run public.payroll_runs%rowtype;
begin
  select * into v_employee from public.employees where id = new.employee_id;
  select * into v_run from public.payroll_runs where id = new.payroll_run_id;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
  values (
    'outbound', 'payroll_salary_generated', 'payroll_items', new.id,
    'mkc:payroll_item:' || new.id,
    jsonb_build_object(
      'payroll_item_id', new.id,
      'payroll_run_id', new.payroll_run_id,
      'employee_id', new.employee_id,
      'employee_code', v_employee.employee_code,
      'employee_name', v_employee.full_name,
      'branch_id', v_run.branch_id,
      'period_month', v_run.period_month,
      'period_year', v_run.period_year,
      'base_salary', new.base_salary,
      'allowances', new.allowances,
      'deductions', new.deductions,
      'net_salary', new.net_salary
    )
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

create trigger payroll_item_after_insert_sync
  after insert on public.payroll_items
  for each row execute function public.trg_payroll_item_sync();

-- ----------------------------------------------------------------------------
-- HR expenses (bonus / reimbursement / other): create + approve/reject.
-- ----------------------------------------------------------------------------
create or replace function public.create_hr_expense(
  p_expense_type text, p_employee_id uuid, p_branch_id uuid,
  p_amount numeric, p_expense_date date, p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.app_has_permission('hr_expense.create') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  insert into public.hr_expenses (expense_type, employee_id, branch_id, amount, expense_date, description, requested_by)
  values (p_expense_type, p_employee_id, p_branch_id, p_amount, coalesce(p_expense_date, current_date), p_description, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.approve_hr_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.app_has_permission('hr_expense.approve') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.hr_expenses
    set status = 'approved', approved_by = v_user_id, approved_at = now()
    where id = p_id and status = 'pending';

  if not found then
    raise exception 'HR expense not found or already decided';
  end if;
end;
$$;

create or replace function public.reject_hr_expense(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.app_has_permission('hr_expense.approve') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.hr_expenses
    set status = 'rejected', approved_by = v_user_id, approved_at = now(), rejection_reason = p_reason
    where id = p_id and status = 'pending';

  if not found then
    raise exception 'HR expense not found or already decided';
  end if;
end;
$$;

create or replace function public.trg_hr_expense_approved_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
begin
  if new.status = 'approved' and old.status <> 'approved' then
    select * into v_employee from public.employees where id = new.employee_id;

    insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
    values (
      'outbound',
      case new.expense_type
        when 'bonus' then 'bonus_approved'
        when 'reimbursement' then 'reimbursement_approved'
        else 'hr_expense_approved'
      end,
      'hr_expenses', new.id, 'mkc:hr_expense:' || new.id,
      jsonb_build_object(
        'hr_expense_id', new.id,
        'expense_type', new.expense_type,
        'employee_id', new.employee_id,
        'employee_code', v_employee.employee_code,
        'employee_name', v_employee.full_name,
        'branch_id', new.branch_id,
        'amount', new.amount,
        'expense_date', new.expense_date,
        'description', new.description
      )
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return new;
end;
$$;

create trigger hr_expense_after_update_sync
  after update on public.hr_expenses
  for each row execute function public.trg_hr_expense_approved_sync();
