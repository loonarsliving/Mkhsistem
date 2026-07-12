-- ============================================================================
-- MK Connect — 0060: fix missing branch_name/department_name in HR sync payloads
--
-- Found during the post-dashboard-redesign regression test: trg_payroll_item_sync
-- and trg_hr_expense_approved_sync only ever sent branch_id (a raw UUID) to
-- MKH Property, never a resolved branch_name — yet MKH Property's
-- sync_inbound RPC reads payload->>'branch_name' expecting a string, so it
-- was always NULL for payroll/bonus/reimbursement/other-HR-expense events
-- (confirmed via crm_payment_approved's payload, which already did this
-- correctly, as the working reference). Neither trigger sent any
-- department/division information at all. This is a pre-existing defect in
-- 0056_hr_payroll_expense_sync.sql, unrelated to and not introduced by the
-- Finance Dashboard redesign (index.html only).
-- ============================================================================

create or replace function public.trg_payroll_item_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_run public.payroll_runs%rowtype;
  v_branch_name text;
  v_department_name text;
begin
  select * into v_employee from public.employees where id = new.employee_id;
  select * into v_run from public.payroll_runs where id = new.payroll_run_id;
  select name into v_branch_name from public.branches where id = v_run.branch_id;
  select name into v_department_name from public.divisions where id = v_employee.division_id;

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
      'branch_name', v_branch_name,
      'department_name', v_department_name,
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

create or replace function public.trg_hr_expense_approved_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_branch_name text;
  v_department_name text;
begin
  if new.status = 'approved' and old.status <> 'approved' then
    select * into v_employee from public.employees where id = new.employee_id;
    select name into v_branch_name from public.branches where id = new.branch_id;
    select name into v_department_name from public.divisions where id = v_employee.division_id;

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
        'branch_name', v_branch_name,
        'department_name', v_department_name,
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
