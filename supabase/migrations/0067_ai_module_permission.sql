-- ============================================================================
-- MK Connect — 0067: ai_module.manage permission
--
-- Backs the new "Modul AI" nav entry/page (features/ai-module) — a container
-- for AI knowledge base and behavior configuration whose actual shape is
-- still being defined with the customer. Scoped to super_admin only for now,
-- same rationale as messaging.send (0066): kept out of the generic per-role
-- seed list in constants/rbac.ts and picked up only via the super_admin
-- cross join below, until it's clear which other roles (if any) should see it.
-- ============================================================================

insert into public.permissions (key, description) values
  ('ai_module.manage', 'View and manage the AI module (knowledge base, behavior configuration)')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;
