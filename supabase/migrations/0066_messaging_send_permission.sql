-- ============================================================================
-- MK Connect — 0066: messaging.send permission
--
-- Backs the new admin-only "send WhatsApp message to any phone number"
-- feature (features/messaging), distinct from the existing notification
-- pipeline which only ever messages employees on file. Deliberately not
-- granted to any role but super_admin: it can reach numbers outside the
-- organization, so it stays out of the generic per-role seed list in
-- constants/rbac.ts (ROLE_PERMISSIONS_SEED) and is only ever picked up via
-- the super_admin cross join below.
-- ============================================================================

insert into public.permissions (key, description) values
  ('messaging.send', 'Send an ad-hoc WhatsApp message to any phone number via the MK Connect connector')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;
