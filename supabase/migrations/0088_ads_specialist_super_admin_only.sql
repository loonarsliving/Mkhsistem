-- ============================================================================
-- MK Connect — 0088: Restrict Ads Specialist to Super Admin only
--
-- ad_campaign.view/manage previously reached Markom, Direktur Utama,
-- Direktur Operasional (both), and Kepala Cabang (view). Per explicit
-- instruction, Ads Specialist visibility narrows to Super Admin only --
-- everyone else loses both the nav entry and page/action access. The
-- autonomous weekly ad-launch cron (markom_run_ai_ads_dispatch, 0081) is
-- unaffected -- it runs as a SECURITY DEFINER function bypassing RLS
-- entirely, same as every other automated job in this app.
-- ============================================================================

delete from public.role_permissions
where permission_id in (select id from public.permissions where key in ('ad_campaign.view', 'ad_campaign.manage'))
  and role_id not in (select id from public.roles where key = 'super_admin');
