-- ============================================================================
-- MK Connect — 0009: Row Level Security
-- Every table is scoped by role permission and/or branch via the
-- app_current_role_key() / app_current_branch_id() / app_has_permission()
-- helpers defined in 0006. Service role (used by trusted server code) has
-- BYPASSRLS and is unaffected by any policy below.
-- ============================================================================

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.branches enable row level security;
alter table public.divisions enable row level security;
alter table public.positions enable row level security;
alter table public.employees enable row level security;
alter table public.work_schedules enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
alter table public.memos enable row level security;
alter table public.memo_attachments enable row level security;
alter table public.memo_targets enable row level security;
alter table public.memo_reads enable row level security;
alter table public.announcement_categories enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_attachments enable row level security;
alter table public.announcement_targets enable row level security;
alter table public.mkc_notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.company_settings enable row level security;

-- ----------------------------------------------------------------------------
-- roles / permissions / role_permissions
-- ----------------------------------------------------------------------------
create policy roles_select on public.roles for select to authenticated using (true);
create policy roles_write on public.roles for all to authenticated
  using (public.app_has_permission('role.manage'))
  with check (public.app_has_permission('role.manage'));

create policy permissions_select on public.permissions for select to authenticated using (true);

create policy role_permissions_select on public.role_permissions for select to authenticated using (true);
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (public.app_has_permission('role.manage'))
  with check (public.app_has_permission('role.manage'));

-- ----------------------------------------------------------------------------
-- branches / divisions / positions
-- ----------------------------------------------------------------------------
create policy branches_select on public.branches for select to authenticated
  using (deleted_at is null or public.app_has_permission('branch.manage'));
create policy branches_write on public.branches for all to authenticated
  using (public.app_has_permission('branch.manage'))
  with check (public.app_has_permission('branch.manage'));

create policy divisions_select on public.divisions for select to authenticated
  using (deleted_at is null or public.app_has_permission('division.manage'));
create policy divisions_write on public.divisions for all to authenticated
  using (public.app_has_permission('division.manage'))
  with check (public.app_has_permission('division.manage'));

create policy positions_select on public.positions for select to authenticated
  using (deleted_at is null or public.app_has_permission('position.manage'));
create policy positions_write on public.positions for all to authenticated
  using (public.app_has_permission('position.manage'))
  with check (public.app_has_permission('position.manage'));

-- ----------------------------------------------------------------------------
-- employees
-- ----------------------------------------------------------------------------
create policy employees_select on public.employees for select to authenticated
  using (
    id = auth.uid()
    or public.app_has_permission('employee.view_all')
    or (public.app_has_permission('employee.view_branch') and branch_id = public.app_current_branch_id())
  );

create policy employees_insert on public.employees for insert to authenticated
  with check (public.app_has_permission('employee.manage'));

create policy employees_update on public.employees for update to authenticated
  using (id = auth.uid() or public.app_has_permission('employee.manage'))
  with check (id = auth.uid() or public.app_has_permission('employee.manage'));

create policy employees_delete on public.employees for delete to authenticated
  using (public.app_has_permission('employee.manage'));

-- Prevent a self-service profile update from silently changing sensitive
-- fields (role, branch, employment status, ...) unless the caller actually
-- has employee.manage. Complements the coarse-grained policy above.
create or replace function public.prevent_employee_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.app_has_permission('employee.manage') then
    if new.role_id is distinct from old.role_id
      or new.branch_id is distinct from old.branch_id
      or new.division_id is distinct from old.division_id
      or new.position_id is distinct from old.position_id
      or new.position_id is distinct from old.position_id
      or new.employment_status is distinct from old.employment_status
      or new.employee_code is distinct from old.employee_code
    then
      raise exception 'You are not allowed to change this field' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger prevent_employee_self_privilege_escalation
  before update on public.employees
  for each row execute function public.prevent_employee_self_privilege_escalation();

-- ----------------------------------------------------------------------------
-- work_schedules
-- ----------------------------------------------------------------------------
create policy work_schedules_select on public.work_schedules for select to authenticated using (true);
create policy work_schedules_write on public.work_schedules for all to authenticated
  using (public.app_has_permission('attendance.settings_manage'))
  with check (public.app_has_permission('attendance.settings_manage'));

-- ----------------------------------------------------------------------------
-- attendance
-- ----------------------------------------------------------------------------
create policy attendance_select on public.attendance for select to authenticated
  using (
    user_id = auth.uid()
    or public.app_has_permission('attendance.view_all')
    or (public.app_has_permission('attendance.view_branch') and branch_id = public.app_current_branch_id())
  );
create policy attendance_write on public.attendance for all to authenticated
  using (public.app_has_permission('attendance.manage'))
  with check (public.app_has_permission('attendance.manage'));

-- ----------------------------------------------------------------------------
-- leave_requests
-- ----------------------------------------------------------------------------
create policy leave_requests_select on public.leave_requests for select to authenticated
  using (
    user_id = auth.uid()
    or public.app_has_permission('attendance.view_all')
    or (
      public.app_has_permission('attendance.view_branch')
      and exists (
        select 1 from public.employees e
        where e.id = leave_requests.user_id and e.branch_id = public.app_current_branch_id()
      )
    )
  );
create policy leave_requests_insert on public.leave_requests for insert to authenticated
  with check (user_id = auth.uid() or public.app_has_permission('attendance.manage'));
create policy leave_requests_update on public.leave_requests for update to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.app_has_permission('attendance.manage'))
  with check ((user_id = auth.uid() and status = 'pending') or public.app_has_permission('attendance.manage'));
create policy leave_requests_delete on public.leave_requests for delete to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.app_has_permission('attendance.manage'));

-- ----------------------------------------------------------------------------
-- memos & related
-- ----------------------------------------------------------------------------
create policy memos_select on public.memos for select to authenticated
  using (
    created_by = auth.uid()
    or public.app_has_permission('memo.manage')
    or exists (select 1 from public.get_memo_audience(memos.id) ma where ma.user_id = auth.uid())
  );
create policy memos_insert on public.memos for insert to authenticated
  with check (created_by = auth.uid() and public.app_has_permission('memo.create'));
create policy memos_update on public.memos for update to authenticated
  using (created_by = auth.uid() or public.app_has_permission('memo.manage'))
  with check (created_by = auth.uid() or public.app_has_permission('memo.manage'));
create policy memos_delete on public.memos for delete to authenticated
  using (created_by = auth.uid() or public.app_has_permission('memo.manage'));

create policy memo_targets_select on public.memo_targets for select to authenticated
  using (exists (select 1 from public.memos m where m.id = memo_targets.memo_id));
create policy memo_targets_write on public.memo_targets for all to authenticated
  using (exists (
    select 1 from public.memos m where m.id = memo_targets.memo_id
      and (m.created_by = auth.uid() or public.app_has_permission('memo.manage'))
  ))
  with check (exists (
    select 1 from public.memos m where m.id = memo_targets.memo_id
      and (m.created_by = auth.uid() or public.app_has_permission('memo.manage'))
  ));

create policy memo_attachments_select on public.memo_attachments for select to authenticated
  using (exists (
    select 1 from public.memos m where m.id = memo_attachments.memo_id
      and (m.created_by = auth.uid() or public.app_has_permission('memo.manage')
           or exists (select 1 from public.get_memo_audience(m.id) ma where ma.user_id = auth.uid()))
  ));
create policy memo_attachments_write on public.memo_attachments for all to authenticated
  using (exists (
    select 1 from public.memos m where m.id = memo_attachments.memo_id
      and (m.created_by = auth.uid() or public.app_has_permission('memo.manage'))
  ))
  with check (exists (
    select 1 from public.memos m where m.id = memo_attachments.memo_id
      and (m.created_by = auth.uid() or public.app_has_permission('memo.manage'))
  ));

create policy memo_reads_select on public.memo_reads for select to authenticated
  using (
    user_id = auth.uid()
    or public.app_has_permission('memo.manage')
    or exists (select 1 from public.memos m where m.id = memo_reads.memo_id and m.created_by = auth.uid())
  );
create policy memo_reads_insert on public.memo_reads for insert to authenticated
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- announcements & related
-- ----------------------------------------------------------------------------
create policy announcement_categories_select on public.announcement_categories for select to authenticated using (true);
create policy announcement_categories_write on public.announcement_categories for all to authenticated
  using (public.app_has_permission('announcement.manage'))
  with check (public.app_has_permission('announcement.manage'));

create policy announcements_select on public.announcements for select to authenticated
  using (
    created_by = auth.uid()
    or public.app_has_permission('announcement.manage')
    or exists (select 1 from public.get_announcement_audience(announcements.id) aa where aa.user_id = auth.uid())
  );
create policy announcements_insert on public.announcements for insert to authenticated
  with check (created_by = auth.uid() and public.app_has_permission('announcement.create'));
create policy announcements_update on public.announcements for update to authenticated
  using (created_by = auth.uid() or public.app_has_permission('announcement.manage'))
  with check (created_by = auth.uid() or public.app_has_permission('announcement.manage'));
create policy announcements_delete on public.announcements for delete to authenticated
  using (created_by = auth.uid() or public.app_has_permission('announcement.manage'));

create policy announcement_targets_select on public.announcement_targets for select to authenticated
  using (exists (select 1 from public.announcements a where a.id = announcement_targets.announcement_id));
create policy announcement_targets_write on public.announcement_targets for all to authenticated
  using (exists (
    select 1 from public.announcements a where a.id = announcement_targets.announcement_id
      and (a.created_by = auth.uid() or public.app_has_permission('announcement.manage'))
  ))
  with check (exists (
    select 1 from public.announcements a where a.id = announcement_targets.announcement_id
      and (a.created_by = auth.uid() or public.app_has_permission('announcement.manage'))
  ));

create policy announcement_attachments_select on public.announcement_attachments for select to authenticated
  using (exists (
    select 1 from public.announcements a where a.id = announcement_attachments.announcement_id
      and (a.created_by = auth.uid() or public.app_has_permission('announcement.manage')
           or exists (select 1 from public.get_announcement_audience(a.id) aa where aa.user_id = auth.uid()))
  ));
create policy announcement_attachments_write on public.announcement_attachments for all to authenticated
  using (exists (
    select 1 from public.announcements a where a.id = announcement_attachments.announcement_id
      and (a.created_by = auth.uid() or public.app_has_permission('announcement.manage'))
  ))
  with check (exists (
    select 1 from public.announcements a where a.id = announcement_attachments.announcement_id
      and (a.created_by = auth.uid() or public.app_has_permission('announcement.manage'))
  ));

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
create policy notifications_select on public.mkc_notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.mkc_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy notifications_delete on public.mkc_notifications for delete to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- audit_logs (read-only for privileged roles; writes only via trigger)
-- ----------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.app_has_permission('audit_log.view'));

-- ----------------------------------------------------------------------------
-- company_settings
-- ----------------------------------------------------------------------------
create policy company_settings_select on public.company_settings for select to authenticated using (true);
create policy company_settings_update on public.company_settings for update to authenticated
  using (public.app_has_permission('settings.manage'))
  with check (public.app_has_permission('settings.manage'));
