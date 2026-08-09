-- ============================================================================
-- MK Connect — 0195: Weekly construction finance WhatsApp report (Kendari)
--
-- Every Sunday 17:00 WIB (10:00 UTC), every active construction project
-- (Kendari today) gets a WhatsApp summary sent to every Super Admin:
-- total anggaran, dana masuk, sisa dana tunai, utang toko belum lunas, and
-- how many gaji tukang / pembelian material entries were input in the past
-- 7 days. Owner's explicit request -- a recurring cadence report, distinct
-- from the existing real-time "construction_expense_submitted" WA push on
-- every single input (0193).
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
    -- This migration
    'construction_weekly_report'
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
    -- This migration
    'construction_weekly_report'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- construction_send_weekly_report(): pg_cron job body. One WA push per
-- active construction project per Super Admin, summarizing saldo + the
-- past 7 days' activity.
-- ----------------------------------------------------------------------------
create or replace function public.construction_send_weekly_report()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_admin record;
  v_dana_masuk numeric;
  v_gaji_tukang numeric;
  v_material numeric;
  v_utang_belum_lunas numeric;
  v_sisa_dana numeric;
  v_week_gaji_count int;
  v_week_material_count int;
  v_body text;
begin
  for v_project in
    select p.id, p.name, p.total_budget, p.branch_id, b.name as branch_name
    from public.construction_projects p
    join public.branches b on b.id = p.branch_id
    where p.status = 'active'
  loop
    select coalesce(sum(amount), 0) into v_dana_masuk
      from public.construction_fund_transfers where project_id = v_project.id;

    select coalesce(sum(amount) filter (where expense_type = 'gaji_tukang'), 0),
           coalesce(sum(amount) filter (where expense_type = 'pembelian_material'), 0),
           coalesce(sum(amount) filter (where payment_method = 'utang' and not is_settled), 0)
      into v_gaji_tukang, v_material, v_utang_belum_lunas
      from public.construction_expenses where project_id = v_project.id;

    v_sisa_dana := v_dana_masuk - v_gaji_tukang;

    select count(*) filter (where expense_type = 'gaji_tukang' and created_at > now() - interval '7 days'),
           count(*) filter (where expense_type = 'pembelian_material' and created_at > now() - interval '7 days')
      into v_week_gaji_count, v_week_material_count
      from public.construction_expenses where project_id = v_project.id;

    v_body :=
      '📊 *' || v_project.branch_name || ' — ' || v_project.name || '*' || E'\n\n' ||
      '💰 Total Anggaran: Rp ' || to_char(v_project.total_budget, 'FM999,999,999,999') || E'\n' ||
      '📥 Dana Sudah Ditransfer: Rp ' || to_char(v_dana_masuk, 'FM999,999,999,999') || E'\n' ||
      '💵 Sisa Dana Tunai: Rp ' || to_char(v_sisa_dana, 'FM999,999,999,999') || E'\n' ||
      '🏗️ Total Gaji Tukang: Rp ' || to_char(v_gaji_tukang, 'FM999,999,999,999') || E'\n' ||
      '🧱 Total Pembelian Material: Rp ' || to_char(v_material, 'FM999,999,999,999') || E'\n' ||
      '⚠️ Utang Toko Belum Lunas: Rp ' || to_char(v_utang_belum_lunas, 'FM999,999,999,999') || E'\n\n' ||
      '📅 Aktivitas 7 hari terakhir: ' || v_week_gaji_count || 'x input gaji tukang, ' || v_week_material_count || 'x input material';

    for v_admin in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_admin.id, 'system', 'construction_weekly_report',
        'Laporan Mingguan Keuangan — ' || v_project.branch_name,
        v_body,
        '/construction-finance'
      );
    end loop;
  end loop;
end;
$$;

comment on function public.construction_send_weekly_report is
  'Weekly WhatsApp summary of every active construction project''s finances to every Super Admin. Scheduled Sunday 17:00 WIB by pg_cron.';

-- Sunday 10:00 UTC = 17:00 WIB.
select cron.schedule('construction-weekly-report', '0 10 * * 0', $$select public.construction_send_weekly_report();$$);
