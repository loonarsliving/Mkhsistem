-- ============================================================================
-- MK Connect — 0199: AI-assessed construction progress per block, weekly
-- report every Saturday 13:00 WIB (before payroll)
--
-- Owner's ask: a new module that assesses the progress shown in Endy's
-- construction photos, timed to Saturday payroll (penggajian), so the
-- report gives supporting data before deciding how much "sisa uang tukang"
-- to send per block -- advisory only, the owner still decides and sends
-- the money himself.
--
-- construction_blocks is Loonars Living's fixed block list (owner-provided:
-- A1-A5, B1-B4, C1-C4). Every photo Endy sends captioned with a block code
-- gets a real Gemini Vision assessment (lib/ai/domains/
-- construction-progress-vision.ts), stored in construction_progress_photos.
-- construction_send_progress_report() aggregates the latest assessment per
-- block each week into one WhatsApp report to Super Admin.
-- ============================================================================

create table public.construction_blocks (
  id uuid primary key default gen_random_uuid(),
  project_code text not null default 'LL',
  code text not null unique,
  created_at timestamptz not null default now()
);

insert into public.construction_blocks (code) values
  ('A1'), ('A2'), ('A3'), ('A4'), ('A5'),
  ('B1'), ('B2'), ('B3'), ('B4'),
  ('C1'), ('C2'), ('C3'), ('C4');

create table public.construction_progress_photos (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  block_id uuid not null references public.construction_blocks(id),
  image_url text not null,
  caption text,
  ai_stage text,
  ai_progress_pct int,
  ai_notes text,
  ai_concerns text,
  created_at timestamptz not null default now()
);
create index construction_progress_photos_block_created_idx on public.construction_progress_photos (block_id, created_at desc);

alter table public.construction_blocks enable row level security;
alter table public.construction_progress_photos enable row level security;
-- Service-role only (written by the webhook handler's admin client, read by
-- construction_send_progress_report below), same posture as
-- photo_auto_forward_rules (0197) / photo_auto_forward_log (0198).

comment on table public.construction_progress_photos is
  'One row per progress photo Endy sends with a recognized block-code caption -- ai_stage/ai_progress_pct/ai_notes/ai_concerns are a Gemini Vision estimate from that single photo, advisory only. Aggregated weekly by construction_send_progress_report (0199) into a Saturday 13:00 WhatsApp report for payroll decision support.';

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
    'daily_motivation', 'daily_report', 'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'new_ad_lead',
    'content_published', 'content_publish_reminder',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning', 'meta_ads_balance_low', 'content_publish_failed', 'database_followup_push',
    'lead_wants_info', 'loonars_fee_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled',
    'disciplinary_warning', 'employee_terminated', 'content_review_pending',
    'salary_transfer_request', 'salary_transferred', 'salary_transfer_summary',
    'construction_expense_submitted',
    'construction_weekly_report',
    'material_purchase_missing_photo',
    -- This migration
    'construction_progress_report'
  ]));

create or replace function public.mkc_notifications_whatsapp_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
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
    'ad_campaign_launched', 'ad_campaign_failed',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning',
    'meta_ads_balance_low',
    'lead_wants_info',
    'loonars_fee_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled',
    'content_review_pending',
    'salary_transfer_summary',
    'construction_expense_submitted',
    'construction_weekly_report',
    'material_purchase_missing_photo',
    -- This migration
    'construction_progress_report'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- construction_send_progress_report(): pg_cron job body, Saturday 13:00 WIB.
-- One consolidated WA message per active Super Admin, listing every block's
-- latest AI assessment from the past 7 days (or "-" if no photo came in),
-- so a stalled block is visible too -- that's useful payroll signal on its
-- own, not just a gap in the data.
-- ----------------------------------------------------------------------------
create or replace function public.construction_send_progress_report()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
  v_block record;
  v_latest record;
  v_lines text := '';
  v_photo_count int;
begin
  for v_block in select id, code from public.construction_blocks order by code loop
    select cpp.ai_stage, cpp.ai_progress_pct, cpp.ai_notes, cpp.ai_concerns, cpp.created_at
      into v_latest
      from public.construction_progress_photos cpp
      where cpp.block_id = v_block.id and cpp.created_at >= now() - interval '7 days'
      order by cpp.created_at desc
      limit 1;

    select count(*) into v_photo_count
      from public.construction_progress_photos
      where block_id = v_block.id and created_at >= now() - interval '7 days';

    if v_latest.ai_stage is not null then
      v_lines := v_lines || E'\n*' || v_block.code || '*: ' || v_latest.ai_stage || ' (~' || coalesce(v_latest.ai_progress_pct, 0) || '%)'
        || ' — ' || v_photo_count || ' foto minggu ini'
        || case when coalesce(v_latest.ai_concerns, '') <> '' then E'\n  ⚠️ ' || v_latest.ai_concerns else '' end;
    elsif v_photo_count > 0 then
      v_lines := v_lines || E'\n*' || v_block.code || '*: ' || v_photo_count || ' foto minggu ini (penilaian AI tidak tersedia)';
    else
      v_lines := v_lines || E'\n*' || v_block.code || '*: tidak ada foto minggu ini';
    end if;
  end loop;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body)
    values (
      v_admin.id, 'system', 'construction_progress_report',
      '🏗️ Laporan Progres Bangunan — Loonars Living',
      'Ringkasan progres per blok (estimasi AI dari foto Endy, 7 hari terakhir). Data pendukung untuk penggajian tukang hari ini -- bukan keputusan final.'
        || E'\n' || v_lines
    );
  end loop;
end;
$$;

comment on function public.construction_send_progress_report is
  'Weekly (Saturday 13:00 WIB) WhatsApp report to every Super Admin: latest AI-estimated progress per Loonars Living block from Endy''s captioned photos (past 7 days). Advisory data for deciding sisa uang tukang per blok on payroll day -- never an automatic payment.';

select cron.schedule(
  'construction-progress-report',
  '0 6 * * 6',
  $$select public.construction_send_progress_report();$$
);
