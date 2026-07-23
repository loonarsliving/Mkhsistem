-- ============================================================================
-- MK Connect — 0039: Markom KPI roles & permissions
-- Mirrors constants/rbac.ts and supabase/seed/01_rbac_seed.sql -- keep all
-- three in sync. Reuses the existing kepala_cabang / direktur_operasional /
-- direktur_utama roles as Branch Manager / Director of Operations / Director
-- (granting them additional kpi_task permissions); only `markom` is a net-new
-- role, mirroring how `sales`/`finance` were the only net-new CRM roles.
-- Idempotent: safe to re-run against the live project.
-- ============================================================================

insert into public.permissions (key, description) values
  ('kpi_task.view_own', 'View own assigned checklist tasks'),
  ('kpi_task.view_branch', 'View checklist tasks for own branch'),
  ('kpi_task.view_all', 'View checklist tasks across all branches'),
  ('kpi_task.assign', 'Create/edit/delete checklist tasks for employees'),
  ('kpi_task.verify', 'Mark a checklist task Completed or Rejected')
on conflict (key) do nothing;

insert into public.roles (key, name, level, description, is_system) values
  ('markom', 'Markom', 90, 'Weekly checklist tasks and own KPI dashboard', true)
on conflict (key) do nothing;

-- markom
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view', 'attendance.view_own', 'memo.view', 'announcement.view', 'kpi_task.view_own'
) where r.key = 'markom'
on conflict do nothing;

-- kepala_cabang (Branch Manager) -- reviews and verifies, cannot self-assign to own tasks since Markom isn't their division, but can assign/verify branch-wide
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'kpi_task.view_branch', 'kpi_task.assign', 'kpi_task.verify'
) where r.key = 'kepala_cabang'
on conflict do nothing;

-- direktur_operasional (Director of Operations)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'kpi_task.view_all', 'kpi_task.assign', 'kpi_task.verify'
) where r.key = 'direktur_operasional'
on conflict do nothing;

-- direktur_utama (Director)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'kpi_task.view_all', 'kpi_task.assign', 'kpi_task.verify'
) where r.key = 'direktur_utama'
on conflict do nothing;

-- super_admin: every permission (existing seed already cross-joins all
-- permissions for super_admin whenever it is re-run; repeated here so this
-- migration alone is sufficient even if the original seed is never re-run).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;
