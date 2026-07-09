-- ============================================================================
-- MK Connect — Employee self-registration with tiered approval
-- ============================================================================

-- Jabodetabek is a registration option but wasn't a branch yet (Cibarusah is
-- a specific city under that region, tracked separately).
insert into public.branches (code, name, city, address, latitude, longitude, radius_meters, is_head_office)
values ('JBD', 'Jabodetabek', 'Jakarta', null, -6.2088, 106.8456, 100, false)
on conflict (code) do nothing;

-- Placeholder role for self-registered accounts awaiting approval. Deliberately
-- has zero role_permissions rows (granted nowhere below) — even in the
-- hypothetical case a pending user obtained a session, app_has_permission()
-- would return false for everything, including dashboard.view.
insert into public.roles (key, name, level, description, is_system)
values ('pending', 'Pending Approval', 999, 'Self-registered account awaiting approval', true)
on conflict (key) do nothing;

insert into public.permissions (key, description) values
  ('registration.view_all', 'View self-registration requests for all branches'),
  ('registration.view_branch', 'View self-registration requests for own branch'),
  ('registration.manage', 'Approve or reject self-registration requests')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'registration.view_all', 'registration.manage'
) where r.key = 'direktur_operasional'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'registration.view_branch', 'registration.manage'
) where r.key = 'kepala_cabang'
on conflict do nothing;

alter table public.mkc_notifications drop constraint mkc_notifications_type_check;
alter table public.mkc_notifications add constraint mkc_notifications_type_check
  check (type = any (array['memo', 'announcement', 'attendance', 'leave_request', 'system', 'registration']));

alter table public.employees
  add column approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column is_active boolean not null default true,
  add column approved_by uuid references public.employees (id) on delete set null,
  add column approved_at timestamptz,
  add column rejected_by uuid references public.employees (id) on delete set null,
  add column rejected_at timestamptz,
  add column rejection_reason text;

create index employees_approval_status_idx on public.employees (approval_status) where approval_status = 'pending';

-- Auto-generated employee codes for self-registration (the form doesn't ask
-- for one). Existing rows are EMP-0001..EMP-0005, so start past that.
create sequence if not exists public.employee_code_seq start with 6;

create or replace function public.next_employee_code()
returns text
language sql
as $$
  select 'EMP-' || lpad(nextval('public.employee_code_seq')::text, 4, '0');
$$;

create or replace function public.set_employee_code()
returns trigger
language plpgsql
as $$
begin
  if new.employee_code is null or new.employee_code = '' then
    new.employee_code := public.next_employee_code();
  end if;
  return new;
end;
$$;

drop trigger if exists set_employee_code_before_insert on public.employees;
create trigger set_employee_code_before_insert
  before insert on public.employees
  for each row execute function public.set_employee_code();

-- ----------------------------------------------------------------------------
-- Approve / reject — SECURITY DEFINER so a Kepala Cabang (who has no
-- employee.manage / employees UPDATE RLS grant) can still act, but each
-- function does its own authorization check rather than relying on RLS.
-- `select ... for update` + a `where approval_status = 'pending'` guard on
-- the final UPDATE make double-approval impossible even under concurrent
-- calls: the second caller blocks on the row lock, then sees a row that's
-- no longer pending and raises instead of silently no-op'ing.
-- ----------------------------------------------------------------------------
create or replace function public.approve_employee_registration(p_employee_id uuid)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.employees;
  v_staff_role_id uuid;
begin
  select * into v_target from public.employees where id = p_employee_id for update;
  if not found then
    raise exception 'Registrasi tidak ditemukan' using errcode = 'P0002';
  end if;

  -- Authorization is checked before the pending-status check so an
  -- unauthorized caller can't infer whether a record exists and has already
  -- been processed just from which error they get back.
  if not (
    public.app_is_super_admin()
    or (
      public.app_has_permission('registration.manage')
      and (public.app_has_permission('registration.view_all') or v_target.branch_id = public.app_current_branch_id())
    )
  ) then
    raise exception 'Anda tidak berwenang menyetujui registrasi ini' using errcode = '42501';
  end if;

  if v_target.approval_status <> 'pending' then
    raise exception 'Registrasi ini sudah diproses' using errcode = '22023';
  end if;

  select id into v_staff_role_id from public.roles where key = 'staff';

  update public.employees
  set role_id = v_staff_role_id,
      approval_status = 'approved',
      is_active = true,
      approved_by = auth.uid(),
      approved_at = now(),
      rejected_by = null,
      rejected_at = null,
      rejection_reason = null
  where id = p_employee_id and approval_status = 'pending'
  returning * into v_target;

  if not found then
    raise exception 'Registrasi ini sudah diproses' using errcode = '22023';
  end if;

  return v_target;
end;
$$;

grant execute on function public.approve_employee_registration(uuid) to authenticated;

create or replace function public.reject_employee_registration(p_employee_id uuid, p_reason text default null)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.employees;
begin
  select * into v_target from public.employees where id = p_employee_id for update;
  if not found then
    raise exception 'Registrasi tidak ditemukan' using errcode = 'P0002';
  end if;

  if not (
    public.app_is_super_admin()
    or (
      public.app_has_permission('registration.manage')
      and (public.app_has_permission('registration.view_all') or v_target.branch_id = public.app_current_branch_id())
    )
  ) then
    raise exception 'Anda tidak berwenang menolak registrasi ini' using errcode = '42501';
  end if;

  if v_target.approval_status <> 'pending' then
    raise exception 'Registrasi ini sudah diproses' using errcode = '22023';
  end if;

  update public.employees
  set approval_status = 'rejected',
      is_active = false,
      rejected_by = auth.uid(),
      rejected_at = now(),
      rejection_reason = p_reason
  where id = p_employee_id and approval_status = 'pending'
  returning * into v_target;

  if not found then
    raise exception 'Registrasi ini sudah diproses' using errcode = '22023';
  end if;

  return v_target;
end;
$$;

grant execute on function public.reject_employee_registration(uuid, text) to authenticated;
