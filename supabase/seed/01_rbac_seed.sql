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
  ('audit_log.view', 'View the audit log'),
  ('system.monitoring_view', 'View system health, error logs and performance metrics'),
  ('registration.view_all', 'View self-registration requests for all branches'),
  ('registration.view_branch', 'View self-registration requests for own branch'),
  ('registration.manage', 'Approve or reject self-registration requests'),
  ('prospect.view_own', 'View own prospects'),
  ('prospect.view_branch', 'View prospects for own branch'),
  ('prospect.view_all', 'View prospects across all branches'),
  ('prospect.create', 'Create new prospects'),
  ('prospect.manage', 'Full override on any prospect (edit/delete/reassign)'),
  ('prospect.follow_up_create', 'Add follow-up activity to a prospect'),
  ('prospect.finance_verify', 'Record and approve/reject prospect payments; only path to Closing status'),
  ('sales_target.view_own', 'View own monthly target and commission %'),
  ('sales_target.view_branch', 'View monthly targets for own branch'),
  ('sales_target.view_all', 'View monthly targets across all branches'),
  ('sales_target.manage', 'Set monthly targets and commission % for Sales'),
  ('crm_analytics.view_branch', 'View CRM dashboards/analytics for own branch'),
  ('crm_analytics.view_all', 'View CRM dashboards/analytics across all branches'),
  ('crm_project.manage', 'Manage the property project reference list')
on conflict (key) do nothing;

insert into public.roles (key, name, level, description, is_system) values
  ('super_admin', 'Super Admin', 1, 'Full system access', true),
  ('direktur_utama', 'Direktur Utama', 10, 'Company-wide executive oversight', true),
  ('direktur_operasional', 'Direktur Operasional', 15, 'Operational executive oversight', true),
  ('hr', 'HR', 20, 'Human resources management', true),
  ('finance', 'Finance', 35, 'Payment verification and closing approval', true),
  ('kepala_cabang', 'Kepala Cabang', 30, 'Branch head', true),
  ('manager', 'Manager', 40, 'Division / team manager', true),
  ('sales', 'Sales', 90, 'Prospect intake, follow-up, and own CRM dashboard', true),
  ('staff', 'Staff', 100, 'Regular employee', true),
  ('pending', 'Pending Approval', 999, 'Self-registered account awaiting approval', true)
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
  'settings.manage', 'audit_log.view',
  'prospect.view_all', 'prospect.manage', 'sales_target.view_all', 'sales_target.manage',
  'crm_analytics.view_all', 'crm_project.manage'
) where r.key = 'direktur_utama'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_all', 'attendance.manage', 'attendance.settings_manage', 'attendance.export',
  'memo.view', 'memo.create', 'memo.manage',
  'announcement.view', 'announcement.create', 'announcement.manage',
  'employee.view_all', 'employee.manage',
  'branch.manage', 'division.manage', 'position.manage',
  'registration.view_all', 'registration.manage',
  'prospect.view_all', 'sales_target.view_all', 'crm_analytics.view_all', 'crm_project.manage'
) where r.key = 'direktur_operasional'
on conflict do nothing;

-- hr: people + attendance company-wide, but no org-structure or role/settings control
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_all', 'attendance.manage', 'attendance.settings_manage', 'attendance.export',
  'memo.view', 'memo.create', 'memo.manage',
  'announcement.view', 'announcement.create', 'announcement.manage',
  'employee.view_all', 'employee.manage'
) where r.key = 'hr'
on conflict do nothing;

-- kepala_cabang
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_branch', 'attendance.export',
  'memo.view', 'memo.create',
  'announcement.view', 'announcement.create',
  'employee.view_branch',
  'registration.view_branch', 'registration.manage',
  'prospect.view_branch', 'prospect.follow_up_create', 'sales_target.view_branch', 'crm_analytics.view_branch'
) where r.key = 'kepala_cabang'
on conflict do nothing;

-- sales
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'prospect.view_own', 'prospect.create', 'prospect.follow_up_create', 'sales_target.view_own'
) where r.key = 'sales'
on conflict do nothing;

-- finance
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'prospect.view_all', 'prospect.finance_verify', 'crm_analytics.view_all'
) where r.key = 'finance'
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
