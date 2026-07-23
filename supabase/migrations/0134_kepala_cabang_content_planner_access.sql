-- ============================================================================
-- Grant Kepala Cabang access to Content Planner / Content Audit (both
-- Leasehold/Occupancy and the Beauty tab) -- previously only super_admin,
-- direktur_utama, direktur_operasional, and markom could open these two
-- pages. loonars_beauty.view/manage is the same permission that also gates
-- the standalone Loonars Beauty ops pages (orders/evaluation/performance),
-- so Kepala Cabang gains access to those too as a side effect -- confirmed
-- acceptable, not a separate ask.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'content_planner.view', 'content_planner.manage',
  'loonars_beauty.view', 'loonars_beauty.manage'
) where r.key = 'kepala_cabang'
on conflict do nothing;
