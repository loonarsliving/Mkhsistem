-- ============================================================================
-- MK Connect — 0192: Exclude employees on a separate payroll schedule from
-- the "branch complete" auto-summary check.
--
-- 0191 auto-sends the branch salary summary once every active employee has
-- a submission for the period. Jogja has one employee (Endy) who is paid on
-- a different day than the rest of the branch by design -- waiting on him
-- would mean the rest of the branch's summary never auto-fires. Per owner's
-- request ("selalu pisahkan Endy"): a per-employee flag excludes someone
-- from that completeness count entirely, reusable for any employee/branch
-- in the same situation, not just Endy.
-- ============================================================================

alter table public.employees add column salary_separate_schedule boolean not null default false;

comment on column public.employees.salary_separate_schedule is
  'True if this employee is paid on a different schedule than the rest of their branch -- excluded from submit_employee_salary()''s "every active employee submitted" completeness check (0191), so the rest of the branch''s summary can still auto-send without waiting on them.';

update public.employees set salary_separate_schedule = true where id = '74eaa9be-e03a-4837-be31-eb1538ecd650';

create or replace function public.submit_employee_salary(
  p_employee_id uuid,
  p_period_month smallint,
  p_period_year smallint,
  p_amount numeric,
  p_bank_name text,
  p_bank_account_number text,
  p_bank_account_holder text,
  p_note text default null,
  p_separate_schedule boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_branch uuid;
  v_employee public.employees%rowtype;
  v_id uuid;
  v_admin record;
  v_period text;
  v_active_count int;
  v_submitted_count int;
begin
  if not public.app_has_permission('salary_input.submit') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_employee from public.employees where id = p_employee_id and deleted_at is null;
  if not found then
    raise exception 'Employee not found';
  end if;

  select branch_id into v_caller_branch from public.employees where id = v_caller;

  if not public.app_has_permission('salary_input.transfer') and v_employee.branch_id is distinct from v_caller_branch then
    raise exception 'Karyawan ini bukan bagian dari cabang Anda' using errcode = '42501';
  end if;

  if p_bank_account_number is null or trim(p_bank_account_number) = '' then
    raise exception 'Nomor rekening wajib diisi';
  end if;

  if p_separate_schedule is not null then
    update public.employees set salary_separate_schedule = p_separate_schedule where id = p_employee_id;
    v_employee.salary_separate_schedule := p_separate_schedule;
  end if;

  insert into public.employee_salary_submissions (
    employee_id, branch_id, period_month, period_year, amount,
    bank_name, bank_account_number, bank_account_holder, note, submitted_by
  )
  values (
    p_employee_id, v_employee.branch_id, p_period_month, p_period_year, p_amount,
    nullif(trim(p_bank_name), ''), trim(p_bank_account_number), nullif(trim(p_bank_account_holder), ''),
    nullif(trim(p_note), ''), v_caller
  )
  returning id into v_id;

  v_period := to_char(make_date(p_period_year, p_period_month, 1), 'FMMonth YYYY');

  insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
  values (
    p_employee_id, 'system', 'payroll_available',
    'Slip Gaji Anda Tersedia — ' || v_period,
    '💰 Gaji periode ' || v_period || ': Rp ' || to_char(p_amount, 'FM999,999,999,999')
      || E'\n🏦 Ditransfer ke: ' || coalesce(nullif(trim(p_bank_name), ''), '-') || ' ' || trim(p_bank_account_number)
      || case when coalesce(trim(p_bank_account_holder), '') <> '' then ' a.n. ' || trim(p_bank_account_holder) else '' end
      || E'\n\nDana akan ditransfer setelah dikonfirmasi oleh Super Admin.',
    '/hr/salary',
    jsonb_build_object('salary_submission_id', v_id, 'period_month', p_period_month, 'period_year', p_period_year)
  );

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'salary_transfer_request',
      'Permintaan Transfer Gaji — ' || v_employee.full_name,
      '👤 Karyawan: ' || v_employee.full_name
        || E'\n💰 Nominal: Rp ' || to_char(p_amount, 'FM999,999,999,999')
        || E'\n🏦 Rekening: ' || coalesce(nullif(trim(p_bank_name), ''), '-') || ' ' || trim(p_bank_account_number)
        || case when coalesce(trim(p_bank_account_holder), '') <> '' then ' a.n. ' || trim(p_bank_account_holder) else '' end
        || E'\n📅 Periode: ' || v_period
        || E'\n👤 Diinput oleh Kepala Cabang',
      '/hr/salary',
      jsonb_build_object('salary_submission_id', v_id, 'employee_id', p_employee_id)
    );
  end loop;

  -- Employees flagged salary_separate_schedule (0192) don't count toward
  -- "has this branch input everyone" -- their own submission still auto-
  -- fires a summary that covers just them once they're the only one left
  -- pending, same as any other branch would.
  select count(*) into v_active_count
  from public.employees
  where branch_id = v_employee.branch_id and deleted_at is null and employment_status = 'active'
    and salary_separate_schedule = false;

  select count(distinct s.employee_id) into v_submitted_count
  from public.employee_salary_submissions s
  join public.employees e on e.id = s.employee_id
  where s.branch_id = v_employee.branch_id and s.period_month = p_period_month and s.period_year = p_period_year
    and e.salary_separate_schedule = false;

  if v_active_count > 0 and v_submitted_count >= v_active_count then
    perform public.send_salary_transfer_summary(v_employee.branch_id);
  end if;

  return v_id;
end;
$$;
