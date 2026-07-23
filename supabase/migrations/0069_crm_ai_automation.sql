-- ============================================================================
-- MK Connect — 0069: CRM AI automation (stuck-prospect analysis, branch
-- target reminders, SP1 warning drafting/review)
--
-- Three pieces, run every 3 days via pg_cron:
--   1. crm_run_prospect_analysis() — deterministic detection of prospects
--      with no follow-up in 3+ days (a proactive earlier signal than the
--      existing 7-day crm_run_follow_up_reminders daily job, which stays
--      untouched). Notifies the Sales owner + their branch's Kepala Cabang
--      via WhatsApp. Also detects the SP1 condition (0 closings this month
--      + 3+ stuck prospects) and enqueues an AI drafting job -- the letter
--      itself is the one piece worth spending a real Gemini call on; the
--      routine reminders stay plain templated SQL like every other
--      notification job in this codebase (ai_send_sales_target_reminders,
--      markom_weekly_reminder), which is both cheaper and doesn't
--      reintroduce the Gemini reliability issues just fixed elsewhere.
--   2. crm_run_branch_target_reminder() — branch-level target achievement
--      digest to each branch's Kepala Cabang.
--   3. crm_sp1_warnings + crm_review_sp1_warning() — the AI-drafted SP1
--      always lands as pending_review, never auto-issued (per decision:
--      Kepala Cabang, or org-wide HR/Direktur Operasional/Super Admin,
--      must approve before a sales rep is actually notified and the
--      warning escalates to Direktur Operasional).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ai_job_queue gains a second job type: the SP1 letter is the one piece of
-- this automation worth a real Gemini call (see docstring above).
-- ----------------------------------------------------------------------------
alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in ('whatsapp_ai_reply', 'crm_sp1_draft'));

-- ----------------------------------------------------------------------------
-- New notification categories, additive only.
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
    -- CRM AI automation (this migration)
    'stuck_prospect_reminder', 'stuck_prospect_alert', 'branch_target_reminder',
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation'
  ]));

-- Every new category above is WhatsApp-eligible -- this whole feature exists
-- to reach Sales/Kepala Cabang/Direktur Operasional on WhatsApp specifically.
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
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation'
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
-- New permissions: sp1_warning.manage lets a Kepala Cabang review/approve
-- SP1 drafts for their OWN branch (RLS/RPC below scope it); sp1_warning.view_all
-- additionally lifts that to every branch, for HR/Direktur Operasional/Super
-- Admin oversight (mirrors the registration.manage + registration.view_all
-- pattern from 0018).
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('sp1_warning.manage', 'Review and approve/reject AI-drafted SP1 (sales performance warning) letters for own branch'),
  ('sp1_warning.view_all', 'View and manage SP1 warnings across all branches, not just own')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'kepala_cabang' and p.key = 'sp1_warning.manage'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key in ('direktur_operasional', 'hr') and p.key in ('sp1_warning.manage', 'sp1_warning.view_all')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- crm_sp1_warnings: one row per (sales, month, year) -- the unique
-- constraint is what stops crm_run_prospect_analysis from re-drafting a
-- duplicate warning every time it runs within the same period.
-- ----------------------------------------------------------------------------
create table public.crm_sp1_warnings (
  id uuid primary key default gen_random_uuid(),
  sales_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null check (period_year between 2020 and 2100),
  reason text not null,
  stuck_prospect_ids uuid[] not null default '{}',
  ai_draft_content text,
  status text not null default 'pending_ai' check (status in ('pending_ai', 'pending_review', 'approved', 'rejected')),
  reviewed_by uuid references public.employees(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_id, period_month, period_year)
);
create index crm_sp1_warnings_branch_idx on public.crm_sp1_warnings (branch_id, status);
create index crm_sp1_warnings_sales_idx on public.crm_sp1_warnings (sales_id);

comment on table public.crm_sp1_warnings is 'AI-drafted SP1 (sales performance warning) letters, always pending_review until a human (Kepala Cabang/HR/Direktur Operasional/Super Admin) approves or rejects -- crm_review_sp1_warning is the only way status changes after drafting.';

create trigger set_updated_at before update on public.crm_sp1_warnings
  for each row execute function public.set_updated_at();
create trigger audit_log after insert or update or delete on public.crm_sp1_warnings
  for each row execute function public.audit_log_trigger();

alter table public.crm_sp1_warnings enable row level security;

create policy crm_sp1_warnings_select on public.crm_sp1_warnings for select to authenticated using (
  public.app_has_permission('sp1_warning.view_all')
  or (public.app_has_permission('sp1_warning.manage') and branch_id = public.app_current_branch_id())
);

-- ----------------------------------------------------------------------------
-- crm_run_prospect_analysis: every 3 days (cron below). Deterministic --
-- "stuck" = no follow-up logged in 3+ days, same shape as the existing
-- 7-day crm_run_follow_up_reminders, just an earlier/more proactive signal
-- on its own cadence. No last_reminder_sent_at throttle here (unlike the
-- 7-day job) since this only runs once every 3 days to begin with.
-- ----------------------------------------------------------------------------
create or replace function public.crm_run_prospect_analysis()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales record;
  v_manager record;
  v_stuck_ids uuid[];
  v_stuck_count int;
  v_closing_count int;
  v_month smallint := extract(month from now())::smallint;
  v_year smallint := extract(year from now())::smallint;
  v_sp1_id uuid;
begin
  for v_sales in
    select distinct e.id as sales_id, e.branch_id, e.full_name
    from public.employees e
    join public.prospects p on p.sales_id = e.id
    where e.deleted_at is null and e.employment_status = 'active'
      and p.deleted_at is null and p.status not in ('closing', 'inactive')
  loop
    select coalesce(array_agg(p.id), '{}'), count(*) into v_stuck_ids, v_stuck_count
    from public.prospects p
    where p.sales_id = v_sales.sales_id and p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and coalesce(p.last_follow_up_at, p.created_at) < now() - interval '3 days';

    if v_stuck_count > 0 then
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_sales.sales_id, 'crm', 'stuck_prospect_reminder',
        'Analisa AI: ' || v_stuck_count || ' prospek belum ada perkembangan',
        'AI mendeteksi ' || v_stuck_count || ' prospek Anda tanpa follow up dalam 3+ hari terakhir. Segera tindak lanjuti.',
        '/crm'
      );

      for v_manager in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.branch_id = v_sales.branch_id and em.deleted_at is null and r.key = 'kepala_cabang'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link)
        values (
          v_manager.id, 'crm', 'stuck_prospect_alert',
          'Analisa AI: ' || v_sales.full_name || ' punya ' || v_stuck_count || ' prospek stuck',
          'AI mendeteksi ' || v_stuck_count || ' prospek milik ' || v_sales.full_name || ' tanpa follow up 3+ hari.',
          '/crm'
        );
      end loop;
    end if;

    select count(*) into v_closing_count from public.prospects
    where sales_id = v_sales.sales_id and status = 'closing' and closed_at is not null
      and extract(month from closed_at) = v_month and extract(year from closed_at) = v_year;

    if v_closing_count = 0 and v_stuck_count >= 3 and not exists (
      select 1 from public.crm_sp1_warnings
      where sales_id = v_sales.sales_id and period_month = v_month and period_year = v_year
    ) then
      insert into public.crm_sp1_warnings (sales_id, branch_id, period_month, period_year, reason, stuck_prospect_ids, status)
      values (
        v_sales.sales_id, v_sales.branch_id, v_month, v_year,
        'Tidak ada closing bulan ini dan ' || v_stuck_count || ' prospek stuck tanpa follow up.',
        v_stuck_ids, 'pending_ai'
      )
      returning id into v_sp1_id;

      insert into public.ai_job_queue (job_type, payload)
      values ('crm_sp1_draft', jsonb_build_object('sp1_warning_id', v_sp1_id));
    end if;
  end loop;
end;
$$;

-- Day-of-month divisible by 3 is the closest pg_cron gets to "every 3 days"
-- (it has no relative-interval scheduling) -- 02:00 UTC = 10:00 WITA.
select cron.schedule('crm-prospect-analysis-3days', '0 2 */3 * *', $$select public.crm_run_prospect_analysis();$$);

-- ----------------------------------------------------------------------------
-- crm_run_branch_target_reminder: branch-level target achievement digest to
-- each branch's Kepala Cabang, every 3 days. Deliberately inlined (not
-- calling crm_branch_stats(), which has its own auth.uid()-based permission
-- check that a SECURITY DEFINER background job can't satisfy) -- same
-- pattern as ai_send_sales_target_reminders in 0063.
-- ----------------------------------------------------------------------------
create or replace function public.crm_run_branch_target_reminder()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month smallint := extract(month from now())::smallint;
  v_year smallint := extract(year from now())::smallint;
  v_row record;
  v_manager record;
begin
  for v_row in
    select
      e.branch_id,
      b.name as branch_name,
      sum(st.target_units) as target_units,
      (
        select count(*) from public.prospects p
        where p.branch_id = e.branch_id and p.status = 'closing' and p.closed_at is not null
          and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year
      ) as closing_units
    from public.sales_targets st
    join public.employees e on e.id = st.sales_id and e.deleted_at is null and e.employment_status = 'active'
    join public.branches b on b.id = e.branch_id
    where st.period_month = v_month and st.period_year = v_year
    group by e.branch_id, b.name
    having sum(st.target_units) > 0
  loop
    for v_manager in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.branch_id = v_row.branch_id and em.deleted_at is null and r.key = 'kepala_cabang'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_manager.id, 'crm', 'branch_target_reminder',
        'Progress Target Cabang ' || v_row.branch_name,
        'Closing ' || v_row.closing_units || ' dari ' || v_row.target_units || ' unit target ('
          || round(v_row.closing_units::numeric / v_row.target_units * 100, 1) || '%) bulan ini.',
        '/crm/dashboard'
      );
    end loop;
  end loop;
end;
$$;

select cron.schedule('crm-branch-target-reminder-3days', '0 1 */3 * *', $$select public.crm_run_branch_target_reminder();$$);

-- ----------------------------------------------------------------------------
-- crm_review_sp1_warning: the ONLY way a crm_sp1_warnings row moves out of
-- pending_review. Approval fires the formal notice to the sales rep and the
-- escalation notice to every Direktur Operasional; rejection just closes
-- the loop silently (no notification to the sales rep -- they were never
-- told a warning was being considered).
-- ----------------------------------------------------------------------------
create or replace function public.crm_review_sp1_warning(p_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_warning public.crm_sp1_warnings%rowtype;
  v_dirops record;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision';
  end if;

  select * into v_warning from public.crm_sp1_warnings where id = p_id for update;
  if not found then
    raise exception 'SP1 warning not found';
  end if;

  if not (
    public.app_has_permission('sp1_warning.view_all')
    or (public.app_has_permission('sp1_warning.manage') and v_warning.branch_id = public.app_current_branch_id())
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if v_warning.status <> 'pending_review' then
    raise exception 'SP1 warning already reviewed';
  end if;

  update public.crm_sp1_warnings set
    status = p_decision, reviewed_by = v_user_id, reviewed_at = now(), review_note = p_note, updated_at = now()
  where id = p_id;

  if p_decision = 'approved' then
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_warning.sales_id, 'crm', 'sp1_issued', 'Surat Peringatan 1 (SP1) diterbitkan',
      'Anda menerima SP1 terkait kinerja penjualan bulan ini. Silakan hubungi atasan langsung Anda untuk pembahasan lebih lanjut.',
      '/crm'
    );

    for v_dirops in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.deleted_at is null and r.key = 'direktur_operasional'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_dirops.id, 'crm', 'sp1_escalation', 'SP1 diterbitkan',
        'SP1 telah disetujui dan diterbitkan untuk seorang sales. Detail tersedia di sistem.',
        '/crm'
      );
    end loop;
  end if;
end;
$$;

grant execute on function public.crm_review_sp1_warning(uuid, text, text) to authenticated;
