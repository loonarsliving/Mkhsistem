-- ============================================================================
-- MK Connect — 0289: Vando mengelola karyawan Loonars Private Living
--
-- Owner 2026-10-19: Vando (Kepala Cabang Jogja) harus bisa menambah dan
-- mengeluarkan karyawan Loonars Private Living (cabang LPL, 0282) serta
-- menginput gaji mereka. LPL adalah cabang terpisah dari Jogja, jadi
-- pemeriksaan "cabang sendiri" yang ada (RLS employees_select,
-- submit_employee_salary, send_salary_transfer_summary) menolak Vando.
--
-- Vando TIDAK diberi employee.manage: izin itu berlaku untuk semua karyawan
-- semua cabang (termasuk mengganti peran). Sebagai gantinya:
--   - izin baru lpl_staff.manage (super_admin di level peran; Kepala Cabang
--     Jogja lewat pemeriksaan cabang, sama seperti villa_referral.manage 0283
--     dan getCurrentSession() di sisi aplikasi),
--   - RLS SELECT tambahan (permissive, tidak mengubah policy lama),
--   - RPC lpl_add_employee / lpl_remove_employee yang memaksa cabang LPL,
--     divisi LPL, dan peran staff,
--   - submit_employee_salary + send_salary_transfer_summary menerima cabang
--     LPL untuk pemegang izin ini.
-- ============================================================================

insert into public.permissions (key, description) values
  ('lpl_staff.manage', 'Tambah, keluarkan, dan input gaji karyawan Loonars Private Living')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin' and p.key = 'lpl_staff.manage'
on conflict do nothing;

create or replace function public.app_lpl_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.branches where code = 'LPL' limit 1;
$$;

-- Kepala Cabang dipakai semua cabang, jadi pemberian ke Vando dicek lewat
-- cabangnya (kode JOG), bukan role_permissions.
create or replace function public.app_can_manage_lpl_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_has_permission('lpl_staff.manage')
    or exists (
      select 1
      from public.employees e
      join public.roles r on r.id = e.role_id
      join public.branches b on b.id = e.branch_id
      where e.id = auth.uid()
        and e.deleted_at is null
        and e.employment_status = 'active'
        and r.key = 'kepala_cabang'
        and b.code = 'JOG'
    );
$$;

revoke execute on function public.app_lpl_branch_id() from public, anon;
revoke execute on function public.app_can_manage_lpl_staff() from public, anon;
grant execute on function public.app_lpl_branch_id() to authenticated;
grant execute on function public.app_can_manage_lpl_staff() to authenticated;

-- ----------------------------------------------------------------------------
-- RLS: tambahan permissive, policy lama tidak disentuh
-- ----------------------------------------------------------------------------
drop policy if exists employees_select_lpl_manager on public.employees;
create policy employees_select_lpl_manager on public.employees for select to authenticated
  using (branch_id = public.app_lpl_branch_id() and public.app_can_manage_lpl_staff());

drop policy if exists employee_salary_submissions_select_lpl_manager on public.employee_salary_submissions;
create policy employee_salary_submissions_select_lpl_manager on public.employee_salary_submissions for select to authenticated
  using (branch_id = public.app_lpl_branch_id() and public.app_can_manage_lpl_staff());

-- ----------------------------------------------------------------------------
-- Tambah karyawan LPL. Akun auth dibuat lebih dulu oleh server action
-- (inviteUserByEmail, service role); RPC ini hanya mengisi profil dengan
-- cabang/peran yang dipaksa, sehingga pemanggil tidak bisa menaruh orang
-- di cabang lain atau memberi peran lebih tinggi.
-- ----------------------------------------------------------------------------
create or replace function public.lpl_add_employee(
  p_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_division_id uuid,
  p_gender text,
  p_join_date date,
  p_bank_name text,
  p_bank_account_number text,
  p_bank_account_holder text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch uuid := public.app_lpl_branch_id();
  v_role uuid;
  v_code text;
  v_next int;
begin
  if not public.app_can_manage_lpl_staff() then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if v_branch is null then
    raise exception 'Cabang Loonars Private Living tidak ditemukan';
  end if;
  if p_division_id is not null and not exists (
    select 1 from public.divisions where id = p_division_id and branch_id = v_branch
  ) then
    raise exception 'Divisi bukan divisi Loonars Private Living';
  end if;

  select id into v_role from public.roles where key = 'staff';

  select coalesce(max(substring(employee_code from '^LPL-(\d+)$')::int), 0) + 1 into v_next
  from public.employees where employee_code ~ '^LPL-\d+$';
  v_code := 'LPL-' || lpad(v_next::text, 3, '0');

  insert into public.employees (
    id, employee_code, full_name, email, phone, branch_id, division_id, role_id,
    gender, join_date, bank_name, bank_account_number, bank_account_holder,
    employment_status, created_by, updated_by
  ) values (
    p_id, v_code, trim(p_full_name), lower(trim(p_email)), nullif(trim(p_phone), ''), v_branch, p_division_id, v_role,
    p_gender, coalesce(p_join_date, current_date), nullif(trim(p_bank_name), ''),
    nullif(trim(p_bank_account_number), ''), nullif(trim(p_bank_account_holder), ''),
    'active', auth.uid(), auth.uid()
  );

  return v_code;
end;
$$;

-- Keluarkan = sama dengan "Nonaktifkan" di /employees (soft delete +
-- terminated); riwayat absensi/gaji tetap tersimpan.
create or replace function public.lpl_remove_employee(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
begin
  if not public.app_can_manage_lpl_staff() then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_id = auth.uid() then
    raise exception 'Tidak bisa mengeluarkan akun sendiri';
  end if;

  select * into v_employee from public.employees where id = p_id and deleted_at is null;
  if not found or v_employee.branch_id is distinct from public.app_lpl_branch_id() then
    raise exception 'Karyawan bukan karyawan Loonars Private Living' using errcode = '42501';
  end if;
  if exists (select 1 from public.roles where id = v_employee.role_id and key = 'super_admin') then
    raise exception 'Akun Super Admin tidak bisa dikeluarkan dari sini' using errcode = '42501';
  end if;

  update public.employees
  set deleted_at = now(), employment_status = 'terminated', updated_by = auth.uid()
  where id = p_id;
end;
$$;

revoke execute on function public.lpl_add_employee(uuid, text, text, text, uuid, text, date, text, text, text) from public, anon;
revoke execute on function public.lpl_remove_employee(uuid) from public, anon;
grant execute on function public.lpl_add_employee(uuid, text, text, text, uuid, text, date, text, text, text) to authenticated;
grant execute on function public.lpl_remove_employee(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- submit_employee_salary: sama dengan 0192, hanya pemeriksaan cabang yang
-- juga menerima karyawan LPL untuk app_can_manage_lpl_staff().
-- ----------------------------------------------------------------------------
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
  if not public.app_has_permission('salary_input.submit') and not public.app_can_manage_lpl_staff() then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_employee from public.employees where id = p_employee_id and deleted_at is null;
  if not found then
    raise exception 'Employee not found';
  end if;

  select branch_id into v_caller_branch from public.employees where id = v_caller;

  if not public.app_has_permission('salary_input.transfer')
    and v_employee.branch_id is distinct from v_caller_branch
    and not (v_employee.branch_id = public.app_lpl_branch_id() and public.app_can_manage_lpl_staff())
  then
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

-- ----------------------------------------------------------------------------
-- send_salary_transfer_summary: sama dengan 0191, kecuali p_branch_id = LPL
-- dihormati untuk app_can_manage_lpl_staff(). Tanpa ini, ringkasan otomatis
-- di akhir submit_employee_salary untuk karyawan LPL akan menarget cabang
-- Jogja milik Vando (dan gagal bila Jogja tidak punya pengajuan tertunda,
-- yang ikut membatalkan input gajinya).
-- ----------------------------------------------------------------------------
create or replace function public.send_salary_transfer_summary(p_branch_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_branch uuid;
  v_target_branch uuid;
  v_branch_name text;
  v_row record;
  v_lines text := '';
  v_total numeric(14, 2) := 0;
  v_count int := 0;
  v_admin record;
  v_ids uuid[] := '{}';
begin
  if not public.app_has_permission('salary_input.submit')
    and not public.app_has_permission('salary_input.transfer')
    and not public.app_can_manage_lpl_staff()
  then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select branch_id into v_caller_branch from public.employees where id = v_caller;

  if public.app_has_permission('salary_input.transfer') then
    v_target_branch := coalesce(p_branch_id, v_caller_branch);
  elsif p_branch_id is not null and p_branch_id = public.app_lpl_branch_id() and public.app_can_manage_lpl_staff() then
    v_target_branch := p_branch_id;
  else
    v_target_branch := v_caller_branch;
  end if;

  if v_target_branch is null then
    raise exception 'Cabang tidak ditemukan';
  end if;

  select name into v_branch_name from public.branches where id = v_target_branch;

  for v_row in
    select s.id, s.amount, s.bank_name, s.bank_account_number, s.bank_account_holder, e.full_name
    from public.employee_salary_submissions s
    join public.employees e on e.id = s.employee_id
    where s.branch_id = v_target_branch and s.status = 'pending_transfer' and s.summary_sent_at is null
    order by s.created_at
  loop
    v_count := v_count + 1;
    v_total := v_total + v_row.amount;
    v_ids := v_ids || v_row.id;
    v_lines := v_lines || E'\n' || v_count || '. ' || v_row.full_name
      || ' — Rp ' || to_char(v_row.amount, 'FM999,999,999,999')
      || E'\n   ' || coalesce(nullif(trim(v_row.bank_name), ''), '-') || ' ' || v_row.bank_account_number
      || case when coalesce(trim(v_row.bank_account_holder), '') <> '' then ' a.n. ' || trim(v_row.bank_account_holder) else '' end;
  end loop;

  if v_count = 0 then
    raise exception 'Tidak ada pengajuan gaji yang perlu dikirim untuk cabang ini';
  end if;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'salary_transfer_summary',
      'Ringkasan Transfer Gaji — ' || coalesce(v_branch_name, '-') || ' (' || v_count || ' karyawan)',
      'Total: Rp ' || to_char(v_total, 'FM999,999,999,999') || v_lines,
      '/hr/salary',
      jsonb_build_object('branch_id', v_target_branch, 'submission_ids', to_jsonb(v_ids), 'count', v_count)
    );
  end loop;

  update public.employee_salary_submissions set summary_sent_at = now() where id = any (v_ids);

  return v_count;
end;
$$;
