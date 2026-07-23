-- ============================================================================
-- MK Connect — 0090: Restrict Promo Broadcast to Super Admin only
--
-- Same treatment as 0088 (Ads Specialist): promo_template.view/manage
-- previously reached Markom, Direktur Utama, Direktur Operasional, and
-- Kepala Cabang (view). Per explicit instruction, Promo Broadcast narrows to
-- Super Admin only -- everyone else loses both the nav entry and page/action
-- access. The autonomous crons (crm_run_promo_cadence_dispatch, the
-- dispatch-promo-sends worker) are unaffected -- they run as SECURITY
-- DEFINER / service-role, bypassing RLS entirely, same as every other
-- automated job in this app.
-- ============================================================================

delete from public.role_permissions
where permission_id in (select id from public.permissions where key in ('promo_template.view', 'promo_template.manage'))
  and role_id not in (select id from public.roles where key = 'super_admin');
