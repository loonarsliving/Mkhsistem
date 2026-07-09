-- ============================================================================
-- MK Connect — 0011: Root Owner protection
-- Marks a single employee row as the immutable root owner account (the
-- company's primary Super Admin). Enforced via BEFORE triggers rather than
-- an RLS policy alone, so the guarantee holds even for callers that bypass
-- RLS (service_role) and even when the deletion is a cascade from
-- auth.users being removed.
-- ============================================================================

alter table public.employees add column is_root_owner boolean not null default false;
create unique index employees_single_root_owner on public.employees (is_root_owner) where is_root_owner;

create or replace function public.prevent_root_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_root_owner and (
    new.deleted_at is not null
    or new.employment_status = 'terminated'
    or new.role_id <> old.role_id
    or new.is_root_owner = false
  ) then
    raise exception 'The root owner account cannot be deleted, terminated, or have its role/ownership changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger prevent_root_owner_removal
  before update on public.employees
  for each row execute function public.prevent_root_owner_removal();

create or replace function public.prevent_root_owner_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_root_owner then
    raise exception 'The root owner account cannot be deleted' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger prevent_root_owner_hard_delete
  before delete on public.employees
  for each row execute function public.prevent_root_owner_hard_delete();

-- Postgres requires new view columns to be appended, not inserted mid-list,
-- so this re-declares 0008's v_employee_directory with is_root_owner last.
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
  e.is_root_owner
from public.employees e
join public.branches b on b.id = e.branch_id
left join public.divisions d on d.id = e.division_id
left join public.positions p on p.id = e.position_id
join public.roles r on r.id = e.role_id;
