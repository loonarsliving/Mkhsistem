-- ============================================================================
-- MK Connect — 0268: Loonars AI Occupancy Ads — RBAC + shared infra widening
--
-- NOT YET APPLIED TO THE LIVE DATABASE. Per root CLAUDE.md ("never change
-- database schema without approval") this file is committed but must not be
-- run against the live Supabase project (svcmybsziaelwwdrnzcv) without a
-- separate, explicit human go-ahead -- see docs/project-memory/FEATURES.md's
-- Loonars AI Occupancy Ads entry for the exact approval gate.
--
-- New permissions occupancy_ads.view / occupancy_ads.manage, mirroring
-- ad_campaign.view/.manage's shape (0079) and its Super-Admin-only scoping
-- precedent (0088) -- this module can also spend real Meta ad budget via a
-- human-confirmed launch, same risk class as the existing Ads Specialist
-- module, so it starts equally narrow rather than defaulting wide.
--
-- Also widens two pieces of shared infra this module reuses rather than
-- forking: ai_integration_logs.connector (add 'villa', for
-- lib/occupancy/villa-provider.ts's GET-only villa-api telemetry) and
-- mkc_notifications' category check constraint (add
-- 'occupancy_campaign_launched' / 'occupancy_campaign_failed').
-- ============================================================================

insert into public.permissions (key, description) values
  ('occupancy_ads.view', 'View Loonars AI Occupancy Ads dashboard, calendar, and campaigns (read-only)'),
  ('occupancy_ads.manage', 'Manage Loonars AI Occupancy Ads: configure targets, review/approve AI drafts, launch/pause campaigns, manage creative assets')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin' and p.key in ('occupancy_ads.view', 'occupancy_ads.manage')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- ai_integration_logs: widen connector check to include 'villa' (villa-api
-- GET-only calls -- see lib/occupancy/villa-provider.ts).
-- ----------------------------------------------------------------------------
alter table public.ai_integration_logs drop constraint ai_integration_logs_connector_check;
alter table public.ai_integration_logs add constraint ai_integration_logs_connector_check
  check (connector in ('whatsapp', 'meta', 'villa'));

-- ----------------------------------------------------------------------------
-- mkc_notifications: widen category check. Full list carried forward from
-- 0257 (the last migration to touch this constraint) plus this module's two
-- new categories.
-- ----------------------------------------------------------------------------
alter table public.mkc_notifications drop constraint mkc_notifications_category_check;
alter table public.mkc_notifications add constraint mkc_notifications_category_check
  check (category is null or category = any (array[
    'attendance_reminder', 'late_attendance', 'forgot_checkout', 'leave_approved', 'leave_rejected', 'payroll_available',
    'new_prospect', 'follow_up_reminder', 'new_assignment', 'closing_approved', 'customer_verification', 'target_reminder',
    'markom_new_task', 'task_revision', 'task_approved', 'weekly_reminder',
    'project_progress', 'material_request', 'inspection_reminder',
    'payment_received', 'invoice_due', 'reimbursement_approved',
    'waiting_approval', 'approved', 'rejected',
    'new_announcement', 'new_memo',
    'maintenance', 'version_update', 'emergency_notice',
    'stuck_prospect_reminder', 'stuck_prospect_alert', 'branch_target_reminder',
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation',
    'task_pending_verification',
    'daily_motivation', 'daily_report',
    'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'new_ad_lead', 'content_published', 'content_publish_reminder', 'finance_expense_alert',
    'branch_balance_alert', 'sales_coaching_tip', 'ad_lead_followup_reminder', 'ad_lead_escalation_branch',
    'ad_lead_escalation_director', 'whatsapp_webhook_silence_alert', 'finance_expense_pending_verification',
    'sales_conduct_warning', 'meta_ads_balance_low', 'content_publish_failed', 'database_followup_push',
    'lead_wants_info', 'loonars_fee_alert', 'automation_dispatch_failed', 'automation_job_dead_letter',
    'automation_queue_stalled', 'disciplinary_warning', 'employee_terminated', 'content_review_pending',
    'salary_transfer_request', 'salary_transferred', 'salary_transfer_summary',
    'construction_expense_submitted', 'construction_weekly_report', 'material_purchase_missing_photo',
    'construction_progress_report', 'approval_request_submitted', 'approval_request_decided',
    'lead_hot_handoff', 'pending_question_timeout',
    'construction_cost_request_submitted', 'construction_cost_request_decided',
    'construction_project_weekly_report',
    -- This migration
    'occupancy_campaign_launched', 'occupancy_campaign_failed'
  ]));
