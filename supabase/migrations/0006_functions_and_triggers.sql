-- ============================================================================
-- MK Connect — 0006: Helper functions & triggers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- generic updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'roles', 'branches', 'divisions', 'positions', 'employees',
      'work_schedules', 'attendance', 'leave_requests',
      'memos', 'announcement_categories', 'announcements'
    ])
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- generic audit log trigger
-- ----------------------------------------------------------------------------
create or replace function public.audit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (table_name, record_id, action, new_data, changed_by)
    values (tg_table_name, new.id, 'INSERT', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    values (tg_table_name, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs (table_name, record_id, action, old_data, changed_by)
    values (tg_table_name, old.id, 'DELETE', to_jsonb(old), auth.uid());
    return old;
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  -- role_permissions is intentionally excluded: it's a pure join table with
  -- a composite primary key (role_id, permission_id) and no `id` column, so
  -- audit_log_trigger()'s `new.id`/`old.id` lookup would fail on it.
  for t in
    select unnest(array[
      'employees', 'branches', 'divisions', 'positions', 'roles',
      'attendance', 'leave_requests', 'memos', 'announcements', 'work_schedules',
      'company_settings'
    ])
  loop
    execute format(
      'create trigger audit_log after insert or update or delete on public.%I for each row execute function public.audit_log_trigger()',
      t
    );
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- RBAC / identity helpers — SECURITY DEFINER so they can read `employees`
-- and `roles` regardless of the caller's RLS policies (no recursion).
-- ----------------------------------------------------------------------------
create or replace function public.app_current_role_key()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select r.key
  from public.employees e
  join public.roles r on r.id = e.role_id
  where e.id = auth.uid() and e.deleted_at is null
  limit 1;
$$;

create or replace function public.app_current_branch_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select e.branch_id
  from public.employees e
  where e.id = auth.uid() and e.deleted_at is null
  limit 1;
$$;

create or replace function public.app_has_permission(p_permission_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.employees e
    join public.role_permissions rp on rp.role_id = e.role_id
    join public.permissions p on p.id = rp.permission_id
    where e.id = auth.uid()
      and e.deleted_at is null
      and p.key = p_permission_key
  );
$$;

create or replace function public.app_is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.app_current_role_key() = 'super_admin';
$$;

comment on function public.app_current_role_key is 'Current caller''s role key; SECURITY DEFINER to avoid RLS recursion.';
comment on function public.app_current_branch_id is 'Current caller''s branch_id; SECURITY DEFINER to avoid RLS recursion.';
comment on function public.app_has_permission is 'Checks whether the caller''s role grants the given permission key.';

-- ----------------------------------------------------------------------------
-- geo helper: haversine distance in meters
-- ----------------------------------------------------------------------------
create or replace function public.calculate_distance_meters(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371000 * acos(
    least(1.0, greatest(-1.0,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2) - radians(lng1))
      + sin(radians(lat1)) * sin(radians(lat2))
    ))
  );
$$;

-- ----------------------------------------------------------------------------
-- target audience resolution — shared by memos & announcements
-- ----------------------------------------------------------------------------
create or replace function public.resolve_target_audience(p_target_type text, p_target_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from public.employees e
  where e.deleted_at is null
    and e.employment_status = 'active'
    and (
      (p_target_type = 'all_branch')
      or (p_target_type = 'all_division')
      or (p_target_type = 'branch' and e.branch_id = p_target_id)
      or (p_target_type = 'division' and e.division_id = p_target_id)
      or (p_target_type = 'position' and e.position_id = p_target_id)
      or (p_target_type = 'user' and e.id = p_target_id)
    );
$$;

create or replace function public.get_memo_audience(p_memo_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct ra.user_id
  from public.memo_targets mt
  cross join lateral public.resolve_target_audience(mt.target_type, mt.target_id) ra
  where mt.memo_id = p_memo_id;
$$;

create or replace function public.get_announcement_audience(p_announcement_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct ra.user_id
  from public.announcement_targets at_
  cross join lateral public.resolve_target_audience(at_.target_type, at_.target_id) ra
  where at_.announcement_id = p_announcement_id;
$$;
