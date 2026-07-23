-- ============================================================================
-- MK Connect — 0097: Content submissions become remind-then-manual-publish,
-- not auto-publish
--
-- The company's Instagram account isn't connected to Meta Business yet, and
-- the user explicitly decided to defer that setup rather than deal with it
-- right now. Instead of the Content Publishing API flow (0096, which needs
-- instagram_content_publish -- unverified and now on hold), the 5-minute
-- worker (app/api/social/publish-content) sends Markom a WhatsApp reminder
-- at the scheduled best-hour instead of calling Meta at all; Markom posts
-- manually in the real Instagram app and then marks the submission
-- published themselves. reminder_sent_at stops the worker from re-sending
-- the same reminder on every subsequent 5-minute tick.
-- ============================================================================

alter table public.markom_content_submissions add column reminder_sent_at timestamptz;

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
    -- This migration
    'content_publish_reminder'
  ]));
