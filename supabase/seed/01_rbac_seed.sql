-- ============================================================================
-- MK Connect — Seed: roles, permissions, role_permissions
-- Mirrors constants/rbac.ts — keep both in sync.
-- ============================================================================

insert into public.permissions (key, description) values
  ('dashboard.view', 'View the dashboard'),
  ('attendance.view_own', 'View own attendance records'),
  ('attendance.view_branch', 'View attendance records for own branch'),
  ('attendance.view_all', 'View attendance records for all branches'),
  ('attendance.manage', 'Create/edit/delete attendance records and decide leave requests'),
  ('attendance.settings_manage', 'Manage work schedules, office location and radius'),
  ('attendance.export', 'Export attendance reports'),
  ('memo.view', 'View memos targeted to self'),
  ('memo.create', 'Create memos'),
  ('memo.manage', 'Edit/delete any memo and view all memos'),
  ('announcement.view', 'View announcements targeted to self'),
  ('announcement.create', 'Create announcements'),
  ('announcement.manage', 'Edit/delete any announcement and view all announcements'),
  ('employee.view_branch', 'View employees in own branch'),
  ('employee.view_all', 'View employees across all branches'),
  ('employee.manage', 'Create/edit/delete employees'),
  ('branch.manage', 'Manage branches'),
  ('division.manage', 'Manage divisions'),
  ('position.manage', 'Manage positions'),
  ('role.manage', 'Manage roles and role permissions'),
  ('settings.manage', 'Manage company settings'),
  ('audit_log.view', 'View the audit log')
on conflict (key) do nothing;

insert into public.roles (key, name, level, description, is_system) values
  ('super_admin', 'Super Admin', 1, 'Full system access', true),
  ('direktur_utama', 'Direktur Utama', 10, 'Company-wide executive oversight', true),
  ('direktur_operasional', 'Direktur Operasional', 15, 'Operational executive oversight', true),
  ('hr', 'HR', 20, 'Human resources management', true),
  ('kepala_cabang', 'Kepala Cabang', 30, 'Branch head', true),
  ('manager', 'Manager', 40, 'Division / team manager', true),
  ('staff', 'Staff', 100, 'Regular employee', true)
on conflict (key) do nothing;

-- super_admin: every permission
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;

-- direktur_utama / direktur_operasional
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_all', 'attendance.export',
  'memo.view', 'memo.create', 'memo.manage',
  'announcement.view', 'announcement.create', 'announcement.manage',
  'employee.view_all', 'employee.manage',
  'branch.manage', 'division.manage', 'position.manage',
  'settings.manage', 'audit_log.view'
) where r.key = 'direktur_utama'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_all', 'attendance.export',
  'memo.view', 'memo.create', 'memo.manage',
  'announcement.view', 'announcement.create', 'announcement.manage',
  'employee.view_all', 'employee.manage',
  'branch.manage', 'division.manage', 'position.manage'
) where r.key = 'direktur_operasional'
on conflict do nothing;

-- hr
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_all', 'attendance.manage', 'attendance.settings_manage', 'attendance.export',
  'memo.view', 'memo.create', 'memo.manage',
  'announcement.view', 'announcement.create', 'announcement.manage',
  'employee.view_all', 'employee.manage',
  'branch.manage', 'division.manage', 'position.manage'
) where r.key = 'hr'
on conflict do nothing;

-- kepala_cabang
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_branch', 'attendance.export',
  'memo.view', 'memo.create',
  'announcement.view', 'announcement.create',
  'employee.view_branch'
) where r.key = 'kepala_cabang'
on conflict do nothing;

-- manager
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_branch',
  'memo.view', 'memo.create',
  'announcement.view',
  'employee.view_branch'
) where r.key = 'manager'
on conflict do nothing;

-- staff
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_own', 'memo.view', 'announcement.view'
) where r.key = 'staff'
on conflict do nothing;
