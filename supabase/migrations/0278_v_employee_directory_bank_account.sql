-- ============================================================================
-- MK Connect — 0278: expose bank account fields through v_employee_directory
--
-- 0277 added employees.bank_name/bank_account_number/bank_account_holder, but
-- both the employee edit page (getEmployeeById) and the logged-in session's
-- own profile (requireSession -> session.employee) read through
-- v_employee_directory rather than the employees table directly, and that
-- view has an explicit column list (not select *). Without this, the new
-- columns exist in the database but the edit/profile forms can never see the
-- values they're supposed to pre-fill and let the employee correct.
-- ============================================================================

create or replace view public.v_employee_directory as
select
  e.id,
  e.employee_code,
  e.full_name,
  e.email,
  e.phone,
  e.avatar_url,
  e.employment_status,
  e.gender,
  e.birth_date,
  e.address,
  e.join_date,
  e.branch_id,
  b.name as branch_name,
  e.division_id,
  d.name as division_name,
  e.position_id,
  p.name as position_name,
  e.role_id,
  r.key as role_key,
  r.name as role_name,
  e.created_at,
  e.deleted_at,
  e.is_root_owner,
  e.bank_name,
  e.bank_account_number,
  e.bank_account_holder
from public.employees e
join public.branches b on b.id = e.branch_id
left join public.divisions d on d.id = e.division_id
left join public.positions p on p.id = e.position_id
join public.roles r on r.id = e.role_id;
