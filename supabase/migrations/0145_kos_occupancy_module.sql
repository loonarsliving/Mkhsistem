-- ============================================================================
-- Kos Occupancy module: single read-only page showing how many Kos rooms are
-- filled vs empty, sourced live from the Kos app's `kos-api` Edge Function
-- (separate Supabase project, gluoioiimapyhchdasfl) -- no local tables, no
-- sync infrastructure, just a permission gating the page.
-- ============================================================================

insert into public.permissions (key, description) values
  ('kos_occupancy.view', 'View Kos room occupancy summary (filled vs empty), synced live from the Kos app')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key in ('direktur_utama', 'direktur_operasional', 'kepala_cabang') and p.key = 'kos_occupancy.view'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin'
on conflict do nothing;
