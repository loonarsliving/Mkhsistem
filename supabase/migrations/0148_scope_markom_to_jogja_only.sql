-- ============================================================================
-- Owner's call: the whole Markom page group (Checklist, Assign Task,
-- Ranking, Foto Project, Content Studio, Content Planner, Content Audit,
-- Promo Broadcast) should only be reachable by the Markom role, Jogja's own
-- Kepala Cabang, and Super Admin -- not Direktur Utama/Operasional, and not
-- other branches' Kepala Cabang. Ads Specialist stays Super Admin only,
-- which it already was (ad_campaign.view/manage was never granted to any
-- other role).
--
-- Direktur Utama/Operasional: clean permission revocation, no branch
-- nuance needed since kpi_task.view_all / crm_project_photo.manage /
-- content_submission.manage / content_planner.* were company-wide grants.
--
-- Kepala Cabang: role_permissions grant is intentionally left AS-IS here --
-- every branch shares this one role, and kpi_tasks/content_planner RLS
-- already scopes each Kepala Cabang to their own branch_id, so Jogja's head
-- keeping the grant can't leak Jogja's data to another branch. The actual
-- Jogja-only restriction happens app-side in getCurrentSession()
-- (lib/rbac/session.ts), which strips these permissions back out of the
-- session for any Kepala Cabang whose branch isn't Jogja -- see
-- constants/rbac.ts MARKOM_KEPALA_CABANG_PERMISSIONS.
-- ============================================================================

delete from public.role_permissions
where role_id in (select id from public.roles where key in ('direktur_utama', 'direktur_operasional'))
  and permission_id in (
    select id from public.permissions where key in (
      'crm_project_photo.manage', 'content_submission.manage',
      'content_planner.view', 'content_planner.manage',
      'kpi_task.view_all', 'kpi_task.assign', 'kpi_task.verify'
    )
  );
