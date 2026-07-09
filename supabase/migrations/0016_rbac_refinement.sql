-- ============================================================================
-- MK Connect — RBAC refinement for Direktur Operasional / HR / Super Admin
-- protection, plus the missing "Human Resource" jabatan.
-- ============================================================================

insert into public.positions (code, name, level, description)
values ('HR', 'Human Resource', 5, 'Manajemen sumber daya manusia')
on conflict (name) do nothing;

-- Direktur Operasional: add operational attendance management, which was
-- missing from the original seed (they already had view_all/export).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'attendance.manage', 'attendance.settings_manage'
) where r.key = 'direktur_operasional'
on conflict do nothing;

-- HR: must not be able to CRUD branches/divisions/positions — the original
-- seed over-granted these (they belong to Direktur Utama/Operasional only).
delete from public.role_permissions
where role_id = (select id from public.roles where key = 'hr')
  and permission_id in (
    select id from public.permissions where key in ('branch.manage', 'division.manage', 'position.manage')
  );

-- Protects every Super Admin-role employee (not just the flagged Root
-- Owner) from being deleted, demoted, or deactivated by a non-Super-Admin
-- actor — Direktur Operasional otherwise has near-identical employee.manage
-- rights and must not be able to touch a Super Admin account.
create or replace function public.prevent_non_super_admin_from_altering_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_role_key text;
begin
  select r.key into v_old_role_key from public.roles r where r.id = old.role_id;

  if v_old_role_key = 'super_admin' and coalesce(public.app_current_role_key(), '') <> 'super_admin' then
    if tg_op = 'DELETE' then
      raise exception 'Only a Super Admin can remove a Super Admin account' using errcode = '42501';
    elsif tg_op = 'UPDATE' and (
      new.role_id is distinct from old.role_id
      or new.deleted_at is distinct from old.deleted_at
      or new.employment_status is distinct from old.employment_status
    ) then
      raise exception 'Only a Super Admin can change another Super Admin account' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_non_super_admin_from_altering_super_admin on public.employees;
create trigger prevent_non_super_admin_from_altering_super_admin
  before update or delete on public.employees
  for each row execute function public.prevent_non_super_admin_from_altering_super_admin();
