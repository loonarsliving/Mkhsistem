-- ============================================================================
-- MK Connect — 0142: Markom Content Studio
--
-- Activates the module that was postponed at 0097 (Instagram wasn't on Meta
-- Business, so publishing was manual + a WhatsApp reminder). Zernio (0126)
-- now gives us a real publish API for both product lines, so this migration
-- turns markom_content_submissions into the backing table for a brand new
-- module with 3 submenus -- Leasehold, Villa, Beauty -- mapped via the new
-- content_focus column ('leasehold_sales' | 'occupancy' | 'beauty', same
-- vocabulary as kpi_tasks.content_focus and social_competitor_accounts, see
-- 0123/0124). AI review now returns a 0-10 score instead of a binary
-- verdict (lib/ai/domains/markom.ts); a submission that scores >= 8.5 is
-- auto-scheduled for the account's best upload hour and actually published
-- via Zernio at that time (app/api/social/publish-content), no more manual
-- WhatsApp-reminder-then-self-confirm step.
--
-- task_id becomes nullable: Beauty content has no kpi_tasks checklist item
-- to attach to at all (Beauty's checklist lives entirely outside kpi_tasks,
-- see 0112/0131), so branch_id/division_id must be derivable straight from
-- the submitting employee's own record instead of solely inherited from a
-- linked task.
-- ============================================================================

alter table public.markom_content_submissions
  alter column task_id drop not null;

alter table public.markom_content_submissions
  add column content_focus text,
  add column platform text not null default 'instagram' check (platform in ('instagram', 'tiktok')),
  add column ai_score numeric(3,1) check (ai_score is null or (ai_score >= 0 and ai_score <= 10)),
  add column zernio_account_id text,
  add column zernio_post_id text,
  add column zernio_publish_status text,
  add column zernio_permalink text;

-- Backfill: inherit from the linked task's own content_focus where it's a
-- real value, otherwise default to leasehold_sales (existing rows all
-- predate this module and were leasehold-checklist-driven).
update public.markom_content_submissions s
set content_focus = t.content_focus
from public.kpi_tasks t
where s.task_id = t.id and t.content_focus in ('leasehold_sales', 'occupancy');

update public.markom_content_submissions
set content_focus = 'leasehold_sales'
where content_focus is null;

alter table public.markom_content_submissions
  alter column content_focus set not null,
  add constraint markom_content_submissions_content_focus_check
    check (content_focus in ('leasehold_sales', 'occupancy', 'beauty'));

comment on column public.markom_content_submissions.content_focus is 'Which Content Studio submenu this belongs to -- Leasehold/Villa/Beauty.';
comment on column public.markom_content_submissions.ai_score is 'Gemini-assigned 0-10 score (one decimal); >= 8.5 auto-schedules for publish, see CONTENT_AUTO_PUBLISH_SCORE_THRESHOLD in lib/ai/domains/markom.ts.';
comment on column public.markom_content_submissions.zernio_post_id is 'Zernio post _id returned by client.posts.createPost, used to poll client.posts.getPost for final status.';

-- Failed Zernio publish attempts get their own notification category,
-- distinct from the existing 'content_publish_reminder' (0097, now unused
-- by new submissions but left alone for any row still mid-flight).
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
    'daily_motivation', 'daily_report', 'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'new_ad_lead',
    'content_published',
    'content_publish_reminder',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning',
    'meta_ads_balance_low',
    -- This migration
    'content_publish_failed'
  ]));
