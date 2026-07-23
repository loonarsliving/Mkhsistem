-- ============================================================================
-- MK Connect — 0034: Fix Sales role gap for real Marketing & Sales employees
--
-- Found while building the Markom KPI module (which reuses this exact
-- division-for-function + role-for-permission pairing): all 15 real
-- employees in the "Marketing & Sales" division hold role 'staff', which
-- grants zero CRM permissions (prospect.create, sales_target.view_own, etc.
-- only exist on role 'sales'). The division-based target distribution
-- (crm_set_branch_target) correctly finds and assigns them targets, but
-- with role 'staff' they cannot create prospects, add follow-ups, or view
-- their own Sales Dashboard/target at all -- contradicting the explicit
-- requirement that Sales see their target on their own dashboard.
--
-- Fix: reassign role 'sales' (a strict permission superset of 'staff', see
-- constants/rbac.ts) to any active, non-deleted employee in the
-- "Marketing & Sales" division who currently holds role 'staff'. Employees
-- already holding a more specific role (kepala_cabang, direktur_*, etc.)
-- are left untouched -- only the bare 'staff' baseline is upgraded.
-- ============================================================================

update public.employees e
set role_id = (select id from public.roles where key = 'sales'), updated_at = now()
where e.deleted_at is null
  and e.role_id = (select id from public.roles where key = 'staff')
  and e.division_id = (select id from public.divisions where name = 'Marketing & Sales');
