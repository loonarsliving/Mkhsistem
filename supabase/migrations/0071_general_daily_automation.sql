-- ============================================================================
-- MK Connect — 0071: General daily automation (morning motivation, daily
-- report to Super Admin)
--
-- Deliberately ZERO Gemini calls -- both jobs are plain templated SQL, same
-- pattern as ai_send_sales_target_reminders/markom_weekly_reminder/
-- crm_run_prospect_analysis. A daily good-morning message and a numbers
-- digest don't need generation; a rotating quote pool + real query results
-- read better (and cost/fail nothing) compared to a Gemini call for text
-- that's this repetitive. This keeps the "spend a real AI call only where
-- generation adds value" rule established in 0069/0070 (SP1 letter,
-- research-informed checklist) -- everything routine stays deterministic.
--
--   1. ai_send_daily_motivation() -- Mon-Fri, 07:00 WITA (30 min before the
--      default 07:30 WITA arrival buffer used by attendance-checkin-
--      reminder-daily, so this lands first): a rotating pre-written
--      motivational line + a fixed target/on-time reminder, to every
--      active employee.
--   2. ai_send_daily_report() -- daily, 18:30 WITA (after mark-absentees-
--      alpha-daily finalizes attendance at 18:00 WITA): a same-day numbers
--      digest (attendance, CRM, Markom) to every Super Admin.
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
    -- General daily automation (this migration)
    'daily_motivation', 'daily_report'
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
    'daily_motivation', 'daily_report'
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

-- ----------------------------------------------------------------------------
-- ai_send_daily_motivation: rotating quote (day-of-year modulo pool size --
-- same quote never repeats two days running unless the pool is this small)
-- + a fixed on-time/target line. No per-employee personalization (the
-- weekly ai_send_sales_target_reminders job already covers real numbers) --
-- this is deliberately a blanket morning message, cheap to compute and send.
-- ----------------------------------------------------------------------------
create or replace function public.ai_send_daily_motivation()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quotes text[] := array[
    'Setiap hari adalah kesempatan baru untuk jadi lebih baik dari kemarin. Semangat!',
    'Hasil terbaik datang dari usaha konsisten, bukan usaha sesekali. Ayo mulai hari ini dengan semangat penuh!',
    'Target besar dicapai lewat langkah-langkah kecil hari ini. Fokus dan selesaikan yang di depan mata.',
    'Kerja keras hari ini adalah cerita sukses besok. Tetap semangat!',
    'Jangan tunggu motivasi datang -- ciptakan momentum sendiri dengan mulai bekerja sekarang.',
    'Satu langkah konsisten setiap hari akan membawa Anda lebih jauh dari sepuluh langkah sesekali.',
    'Percaya pada proses. Kerja keras hari ini akan terlihat hasilnya di kemudian hari.',
    'Disiplin adalah jembatan antara target dan pencapaian. Semangat mengejar target hari ini!',
    'Tim yang solid dan kerja yang rapi akan selalu menghasilkan yang terbaik. Ayo mulai!',
    'Hari baru, energi baru, semangat baru. Mari capai target bersama-sama!'
  ];
  v_quote text := v_quotes[1 + (extract(doy from current_date)::int % array_length(v_quotes, 1))];
  v_count integer;
begin
  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  select e.id, 'system', 'daily_motivation', 'Semangat Pagi!',
    v_quote || ' Jangan lupa cek target Anda hari ini dan pastikan check-in tepat waktu, jangan sampai terlambat.',
    '/dashboard'
  from public.employees e
  join public.roles r on r.id = e.role_id
  where e.deleted_at is null and e.employment_status = 'active' and r.key <> 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Mon-Fri 23:00 UTC (previous day) = 07:00 WITA -- 30 min before the
-- existing attendance-checkin-reminder-daily (07:30 WITA), so the
-- motivation message lands first thing before people start their commute.
select cron.schedule(
  'ai-daily-motivation',
  '0 23 * * 0-4',
  $$select public.ai_send_daily_motivation();$$
);

-- ----------------------------------------------------------------------------
-- ai_send_daily_report: same-day numbers digest to every Super Admin.
-- Deliberately inlined counts (not calling any permission-gated reporting
-- RPC) -- same reasoning as every other background job added this session.
-- ----------------------------------------------------------------------------
create or replace function public.ai_send_daily_report()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_present integer;
  v_late integer;
  v_alpha integer;
  v_total_active integer;
  v_new_prospects integer;
  v_closings_today integer;
  v_closings_revenue numeric;
  v_pending_sp1 integer;
  v_markom_completed_today integer;
  v_markom_pending integer;
  v_body text;
  v_admin record;
  v_count integer := 0;
begin
  select count(*) into v_total_active from public.employees where deleted_at is null and employment_status = 'active';

  select
    count(*) filter (where status = 'hadir'),
    count(*) filter (where status = 'terlambat'),
    count(*) filter (where status = 'alpha')
  into v_present, v_late, v_alpha
  from public.attendance where attendance_date = current_date;

  select count(*) into v_new_prospects from public.prospects
  where deleted_at is null and created_at::date = current_date;

  select count(*), coalesce(sum(total_collection), 0) into v_closings_today, v_closings_revenue
  from public.prospects where status = 'closing' and closed_at::date = current_date;

  select count(*) into v_pending_sp1 from public.crm_sp1_warnings where status = 'pending_review';

  select count(*) into v_markom_completed_today from public.kpi_tasks
  where deleted_at is null and status = 'completed' and completed_at::date = current_date;

  select count(*) into v_markom_pending from public.kpi_tasks
  where deleted_at is null and status = 'pending';

  v_body :=
    'Kehadiran: ' || v_present || ' hadir, ' || v_late || ' terlambat, ' || v_alpha || ' alpha (dari ' || v_total_active || ' karyawan aktif).' ||
    E'\nCRM: ' || v_new_prospects || ' prospek baru, ' || v_closings_today || ' closing (Rp ' || to_char(v_closings_revenue, 'FM999,999,999,999') || '), ' || v_pending_sp1 || ' SP1 menunggu review.' ||
    E'\nMarkom: ' || v_markom_completed_today || ' task selesai hari ini, ' || v_markom_pending || ' task masih pending.';

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (v_admin.id, 'system', 'daily_report', 'Laporan Harian MK Connect', v_body, '/dashboard');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- 10:30 UTC = 18:30 WITA, 30 min after mark-absentees-alpha-daily (18:00
-- WITA) finalizes the day's attendance so the digest's numbers are settled.
select cron.schedule(
  'ai-daily-report',
  '30 10 * * *',
  $$select public.ai_send_daily_report();$$
);
