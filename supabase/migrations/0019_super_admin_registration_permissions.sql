-- ============================================================================
-- MK Connect — Backfill missing super_admin registration permissions
-- ============================================================================

-- Super Admin is documented (constants/rbac.ts ROLE_PERMISSIONS_SEED, enforced by
-- tests/unit/constants/rbac.test.ts "grants super_admin every permission that exists")
-- to hold every permission that exists. Migration 0018 (self-registration) added
-- registration.view_all / registration.view_branch / registration.manage but only
-- granted them to direktur_operasional and kepala_cabang, leaving super_admin unable
-- to view or act on the Pending Registration / Approval page. Backfilling the gap.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('registration.view_all', 'registration.view_branch', 'registration.manage')
where r.key = 'super_admin'
on conflict do nothing;
