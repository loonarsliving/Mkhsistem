-- Owner's request: when a weekly borongan payment draft is generated
-- (awaiting Kepala Cabang's approval, 0220), that branch's Kepala Cabang
-- should get a WhatsApp alert with a direct link to approve it in MK
-- Connect -- mirroring the existing finance_expense_pending_verification
-- pattern (mkh-properti's pengajuan flow), which already does this for
-- gaji tukang/pembelian bahan approvals.

alter table public.cm_labor_payments
  add column if not exists notified_kc_at timestamptz;

create or replace function public.cm_generate_labor_payment(p_contract_id uuid, p_period_start date, p_period_end date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract public.cm_labor_contracts%rowtype;
  v_gross numeric;
  v_retention numeric;
  v_summary record;
  v_id uuid;
  v_contractor_name text;
  v_project_name text;
  v_branch_id uuid;
  v_sisa_kontrak numeric;
  v_kc record;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_contract from public.cm_labor_contracts where id = p_contract_id and status = 'active';
  if not found then
    raise exception 'Kontrak tidak ditemukan atau tidak aktif';
  end if;

  if exists (select 1 from public.cm_labor_payments where contract_id = p_contract_id and status = 'draft') then
    raise exception 'Masih ada payment draft yang belum diputuskan untuk kontrak ini';
  end if;

  select coalesce(sum(w.weight_pct / 100 * greatest(wbs.progress_pct - w.last_paid_progress_pct, 0) / 100 * v_contract.contract_value), 0)
  into v_gross
  from public.cm_labor_contract_weights w
  join public.cm_project_wbs wbs on wbs.id = w.project_wbs_id
  where w.contract_id = p_contract_id;

  if v_gross <= 0 then
    raise exception 'Tidak ada progress baru yang bisa dibayarkan sejak pembayaran terakhir';
  end if;

  v_retention := round(v_gross * v_contract.retention_pct / 100, 2);

  select * into v_summary from public.cm_labor_contract_summary(p_contract_id);

  insert into public.cm_labor_payments (contract_id, period_start, period_end, gross_earned, retention_amount, cumulative_earned_before, cumulative_paid_before, created_by)
  values (p_contract_id, p_period_start, p_period_end, round(v_gross, 2), v_retention, v_summary.cumulative_earned - v_gross, v_summary.cumulative_paid, auth.uid())
  returning id into v_id;

  -- Notify the project's branch Kepala Cabang with a direct link to approve.
  select full_name into v_contractor_name from public.cm_contractors where id = v_contract.contractor_id;
  select name, branch_id into v_project_name, v_branch_id from public.construction_projects where id = v_contract.project_id;
  v_sisa_kontrak := v_contract.contract_value - v_summary.cumulative_paid;

  if v_branch_id is not null then
    for v_kc in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.branch_id = v_branch_id and em.deleted_at is null and em.employment_status = 'active' and r.key = 'kepala_cabang'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
      values (
        v_kc.id, 'system', 'labor_payment_pending_approval',
        'Pengajuan Borongan Menunggu Persetujuan — ' || coalesce(v_project_name, '-'),
        '👷 Kontraktor: ' || coalesce(v_contractor_name, '-')
          || E'\n📅 Periode: ' || p_period_start || ' s/d ' || p_period_end
          || E'\n💰 Nilai Diajukan: Rp ' || to_char(round(v_gross, 0), 'FM999,999,999,999')
          || E'\n📉 Sisa Kontrak: Rp ' || to_char(round(v_sisa_kontrak, 0), 'FM999,999,999,999')
          || E'\n\n🔗 Setujui di sini: https://mkh.haluoleo.id/construction-finance',
        '/construction-finance',
        jsonb_build_object('payment_id', v_id, 'contract_id', p_contract_id, 'project_id', v_contract.project_id)
      );
    end loop;
    update public.cm_labor_payments set notified_kc_at = now() where id = v_id;
  end if;

  return v_id;
end;
$$;

-- Add the new category to the WhatsApp-eligible list (CREATE OR REPLACE of
-- the full trigger function -- every other category copied verbatim from
-- the live definition).
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
    'construction_progress_report',
    'approval_request_submitted', 'approval_request_decided',
    -- This migration (0223)
    'labor_payment_pending_approval'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$$;
