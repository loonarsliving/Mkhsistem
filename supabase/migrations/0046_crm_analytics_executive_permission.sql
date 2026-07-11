-- ============================================================================
-- MK Connect — 0046: crm_analytics.view_executive (Direktur Utama split)
--
-- Direktur Utama and Direktur Operasional both hold crm_analytics.view_all
-- (needed for /crm/analytics, prospect.manage overrides, etc), so that
-- permission alone can't tell the home dashboard which of the two distinct
-- widgets to render (Operational: Company Target/Revenue Target, Branch
-- Performance, Sales Ranking, Branch Ranking -- vs Executive: pared-down
-- KPIs only, no commission, plus Monthly Growth). This permission is the
-- tie-breaker: whoever holds it sees the Executive widget instead of the
-- Operational one on the home dashboard, even though both still share
-- crm_analytics.view_all for everything else.
-- ============================================================================

insert into public.permissions (key, description) values
  ('crm_analytics.view_executive', 'View the pared-down Executive KPI dashboard widget (Direktur Utama)')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'crm_analytics.view_executive'
where r.key = 'direktur_utama'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;
