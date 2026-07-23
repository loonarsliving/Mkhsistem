-- ============================================================================
-- MK Connect — 0027: CRM roles & permissions
-- Mirrors constants/rbac.ts and supabase/seed/01_rbac_seed.sql — keep all
-- three in sync. Reuses the existing direktur_utama / direktur_operasional /
-- kepala_cabang roles as Director / Director of Operations / Branch Manager
-- (granting them additional CRM permissions); only `sales` and `finance` are
-- net-new roles. Idempotent: safe to re-run against the live project.
-- ============================================================================

insert into public.permissions (key, description) values
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
  ('sales', 'Sales', 90, 'Prospect intake, follow-up, and own CRM dashboard', true),
  ('finance', 'Finance', 35, 'Payment verification and closing approval', true)
on conflict (key) do nothing;

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

-- kepala_cabang (Branch Manager)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'prospect.view_branch', 'prospect.follow_up_create', 'sales_target.view_branch', 'crm_analytics.view_branch'
) where r.key = 'kepala_cabang'
on conflict do nothing;

-- direktur_operasional (Director of Operations)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'prospect.view_all', 'sales_target.view_all', 'crm_analytics.view_all', 'crm_project.manage'
) where r.key = 'direktur_operasional'
on conflict do nothing;

-- direktur_utama (Director)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'prospect.view_all', 'prospect.manage', 'sales_target.view_all', 'sales_target.manage',
  'crm_analytics.view_all', 'crm_project.manage'
) where r.key = 'direktur_utama'
on conflict do nothing;

-- super_admin: every permission (existing seed already cross-joins all
-- permissions for super_admin whenever it is re-run; repeated here so this
-- migration alone is sufficient even if the original seed is never re-run).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;
