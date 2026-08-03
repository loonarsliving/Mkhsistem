-- ============================================================================
-- MK Connect — 0191: Auto-send the branch salary summary once every active
-- employee has been input, instead of only on manual button press.
--
-- 0190 added an explicit "Kirim Ringkasan" action because per-employee
-- WhatsApp pings to Super Admin were too noisy. In practice a Kepala Cabang
-- inputting salaries doesn't always remember to press it once done, and the
-- Jogja case today showed the gap clearly (2 employees submitted, summary
-- sent, then 2 more submitted later and sat unsent). Per owner's request:
-- the system should recognize "all of this branch's active employees now
-- have a submission for this period" and fire the summary itself --
-- send_salary_transfer_summary() already only picks up not-yet-summarized
-- rows, so this is additive, not a replacement for the manual button (still
-- useful for a branch that will never reach 100%, e.g. someone on unpaid
-- leave that period).
-- ============================================================================

create or replace function public.submit_employee_salary(
  p_employee_id uuid,
  p_period_month smallint,
  p_period_year smallint,
  p_amount numeric,
  p_bank_name text,
  p_bank_account_number text,
  p_bank_account_holder text,
  p_note text default null
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

  -- Auto-fire the consolidated summary once every active employee of this
  -- branch has a submission for this period -- "distinct" so a re-submit
  -- (same employee, same period, blocked by the unique constraint anyway)
  -- can never double-count.
  select count(*) into v_active_count
  from public.employees
  where branch_id = v_employee.branch_id and deleted_at is null and employment_status = 'active';

  select count(distinct employee_id) into v_submitted_count
  from public.employee_salary_submissions
  where branch_id = v_employee.branch_id and period_month = p_period_month and period_year = p_period_year;

  if v_active_count > 0 and v_submitted_count >= v_active_count then
    perform public.send_salary_transfer_summary(v_employee.branch_id);
  end if;

  return v_id;
end;
$$;
