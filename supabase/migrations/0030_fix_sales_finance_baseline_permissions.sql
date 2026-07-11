-- ============================================================================
-- MK Connect — 0030: Grant baseline permissions to sales/finance roles
--
-- Found during full-system QA: the sales and finance roles (added in 0027)
-- were only granted CRM-specific permissions. Every other real employee
-- role (staff, kepala_cabang, manager, hr, direktur_*) also carries
-- attendance.view_own (or a broader attendance tier), memo.view, and
-- announcement.view -- the baseline "you're an employee of this company"
-- permissions. Sales and Finance employees never got them, so they had no
-- way to see company memos/announcements, and (before the matching nav.ts
-- fix) no way to even find the Attendance nav link.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'attendance.view_own', 'memo.view', 'announcement.view'
) where r.key in ('sales', 'finance')
on conflict do nothing;
