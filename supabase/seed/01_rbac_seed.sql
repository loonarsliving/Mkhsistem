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
  ('crm_analytics.view_executive', 'View the pared-down Executive KPI dashboard widget (Direktur Utama)'),
  ('crm_project.manage', 'Manage the property project reference list'),
  ('kpi_task.view_own', 'View own assigned checklist tasks'),
  ('kpi_task.view_branch', 'View checklist tasks for own branch'),
  ('kpi_task.view_all', 'View checklist tasks across all branches'),
  ('kpi_task.assign', 'Create/edit/delete checklist tasks for employees'),
  ('kpi_task.verify', 'Mark a checklist task Completed or Rejected'),
  ('payroll.manage', 'Create and approve payroll runs, generating employee salary lines'),
  ('hr_expense.create', 'Submit bonus/reimbursement/other HR expense requests'),
  ('hr_expense.approve', 'Approve or reject bonus/reimbursement/other HR expense requests'),
  ('messaging.send', 'Send an ad-hoc WhatsApp message to any phone number via the MK Connect connector'),
  ('ai_module.manage', 'View and manage the AI module (knowledge base, behavior configuration)'),
  ('sp1_warning.manage', 'Review and approve/reject AI-drafted SP1 (sales performance warning) letters for own branch'),
  ('sp1_warning.view_all', 'View and manage SP1 warnings across all branches, not just own'),
  ('hr_workspace.view', 'View the HR control room (action queue, live attendance, compliance)'),
  ('assistant_workspace.view', 'View the private assistant workspace'),
  ('assistant_followup.manage', 'Create and complete personal follow-up items in the assistant workspace'),
  ('payroll.view', 'View payroll runs and salary figures without the authority to approve a run'),
  ('salary_input.submit', 'Input an individual employee''s salary and bank account, sending them a payslip notification and Super Admin a transfer request'),
  ('salary_input.transfer', 'See salary submissions awaiting transfer and mark them as transferred')
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
  ('markom', 'Markom', 90, 'Weekly checklist tasks and own KPI dashboard', true),
  ('staff', 'Staff', 100, 'Regular employee', true),
  ('private_assistant', 'Asisten Pribadi', 12, 'Private assistant to the Super Admin -- company-wide visibility, no approval authority', true),
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
  'crm_analytics.view_all', 'crm_analytics.view_executive', 'crm_project.manage',
  'kpi_task.view_all', 'kpi_task.assign', 'kpi_task.verify'
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
  'prospect.view_all', 'sales_target.view_all', 'sales_target.manage', 'crm_analytics.view_all', 'crm_project.manage',
  'kpi_task.view_all', 'kpi_task.assign', 'kpi_task.verify', 'payroll.manage', 'hr_expense.create', 'hr_expense.approve',
  'sp1_warning.manage', 'sp1_warning.view_all', 'salary_input.submit'
) where r.key = 'direktur_operasional'
on conflict do nothing;

-- hr: people + attendance company-wide, but no org-structure or role/settings control
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_all', 'attendance.manage', 'attendance.settings_manage', 'attendance.export',
  'memo.view', 'memo.create', 'memo.manage',
  'announcement.view', 'announcement.create', 'announcement.manage',
  'employee.view_all', 'employee.manage',
  'registration.view_all', 'registration.manage',
  'payroll.manage', 'payroll.view', 'hr_expense.create', 'hr_expense.approve',
  'sp1_warning.manage', 'sp1_warning.view_all',
  'hr_workspace.view', 'salary_input.submit'
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
  'prospect.view_branch', 'prospect.follow_up_create', 'sales_target.view_branch', 'crm_analytics.view_branch',
  'kpi_task.view_branch', 'kpi_task.assign', 'kpi_task.verify', 'hr_expense.create',
  'sp1_warning.manage', 'salary_input.submit'
) where r.key = 'kepala_cabang'
on conflict do nothing;

-- sales
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_own', 'memo.view', 'announcement.view',
  'prospect.view_own', 'prospect.create', 'prospect.follow_up_create', 'sales_target.view_own', 'hr_expense.create'
) where r.key = 'sales'
on conflict do nothing;

-- markom
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_own', 'memo.view', 'announcement.view', 'kpi_task.view_own', 'hr_expense.create'
) where r.key = 'markom'
on conflict do nothing;

-- finance
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_own', 'memo.view', 'announcement.view',
  'prospect.view_all', 'prospect.finance_verify', 'crm_analytics.view_all',
  'payroll.manage', 'hr_expense.create', 'hr_expense.approve', 'salary_input.transfer'
) where r.key = 'finance'
on conflict do nothing;

-- manager
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_branch',
  'memo.view', 'memo.create',
  'announcement.view',
  'employee.view_branch', 'hr_expense.create'
) where r.key = 'manager'
on conflict do nothing;

-- staff
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_own', 'memo.view', 'announcement.view', 'hr_expense.create'
) where r.key = 'staff'
on conflict do nothing;

-- private_assistant: read-everything, decide-nothing. Every key below is a
-- *_view / *_view_all -- see supabase/migrations/0177 for why the role holds
-- no manage/approve/publish permission at all.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view',
  'assistant_workspace.view', 'assistant_followup.manage',
  'attendance.view_all', 'attendance.export',
  'memo.view', 'announcement.view',
  'employee.view_all',
  'registration.view_all',
  'prospect.view_all',
  'sales_target.view_all',
  'crm_analytics.view_all', 'crm_analytics.view_executive',
  'kpi_task.view_all',
  'sp1_warning.view_all',
  'ad_campaign.view',
  'content_planner.view',
  'promo_template.view',
  'loonars_beauty.view',
  'kos_occupancy.view',
  'payroll.view',
  'system.monitoring_view'
) where r.key = 'private_assistant'
on conflict do nothing;

-- Anyone who may approve payroll should also be able to read it.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'payroll.view'
where r.key in ('super_admin', 'direktur_operasional', 'finance')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'hr_workspace.view', 'assistant_workspace.view', 'assistant_followup.manage'
) where r.key = 'super_admin'
on conflict do nothing;

-- super_admin already gets every permission via the cross-join above, but
-- kept explicit here for readability alongside the rest of this module.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('salary_input.submit', 'salary_input.transfer')
where r.key = 'super_admin'
on conflict do nothing;
