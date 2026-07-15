-- ============================================================================
-- MK Connect — 0079: meta_ad_campaigns tracking table
--
-- One row per Click-to-WhatsApp ad AI (or a human, via the Ads Specialist
-- page) launches through lib/meta/ads.ts. Keeps a local record of the
-- Meta-side object IDs (campaign/adset/creative/ad) so the app can show
-- status/performance without re-deriving it, and links back to which real
-- photo (crm_project_photos) and which research summary produced it, for
-- auditability given AI is authorized to launch these autonomously.
-- ============================================================================

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
    -- Ads Specialist (this migration)
    'ad_campaign_launched', 'ad_campaign_failed'
  ]));

create or replace function public.mkc_notifications_whatsapp_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category = any (array[
    'attendance_reminder', 'late_attendance', 'forgot_checkout',
    'new_memo',
    'target_reminder',
    'weekly_reminder', 'markom_new_task', 'task_revision',
    'payroll_available',
    'waiting_approval',
    'project_progress', 'material_request', 'inspection_reminder',
    'stuck_prospect_reminder', 'stuck_prospect_alert', 'branch_target_reminder',
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation',
    'task_pending_verification',
    'daily_motivation', 'daily_report',
    'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed'
  ]) then
    perform net.http_post(
      url := 'https://mkh.haluoleo.id/api/ai/whatsapp-relay',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('notification_id', new.id),
      timeout_milliseconds := 5000
    );
  end if;
  return new;
end;
$$;

create table public.meta_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.crm_projects(id) on delete set null,
  branch_id uuid not null references public.branches(id) on delete restrict,
  photo_id uuid references public.crm_project_photos(id) on delete set null,
  meta_campaign_id text not null,
  meta_adset_id text not null,
  meta_creative_id text not null,
  meta_ad_id text not null,
  name text not null,
  headline text not null,
  primary_text text not null,
  description text,
  daily_budget_idr integer not null,
  status text not null default 'active' check (status in ('active', 'paused', 'ended', 'failed')),
  launched_by text not null default 'ai' check (launched_by in ('ai', 'human')),
  research_summary text,
  failure_reason text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meta_ad_campaigns_branch_id_idx on public.meta_ad_campaigns (branch_id);
create index meta_ad_campaigns_project_id_idx on public.meta_ad_campaigns (project_id);

alter table public.meta_ad_campaigns enable row level security;

-- ad_campaign.manage (Markom/Directors/Super Admin) sees every branch;
-- ad_campaign.view alone (Kepala Cabang) is scoped to their own branch --
-- mirrors the crm_analytics.view_branch pattern (0025).
create policy meta_ad_campaigns_select on public.meta_ad_campaigns for select to authenticated
  using (
    public.app_has_permission('ad_campaign.manage')
    or (public.app_has_permission('ad_campaign.view') and branch_id = public.app_current_branch_id())
  );
create policy meta_ad_campaigns_write on public.meta_ad_campaigns for all to authenticated
  using (public.app_has_permission('ad_campaign.manage'))
  with check (public.app_has_permission('ad_campaign.manage'));
