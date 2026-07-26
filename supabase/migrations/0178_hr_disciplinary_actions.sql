-- ============================================================================
-- MK Connect — 0178: HR disciplinary actions (SP1/SP2/SP3 + termination)
--
-- HR needs to issue warning letters and terminate employees, and the owner's
-- framing was "jika data-data mendukung untuk diberhentikan" -- only when the
-- record supports it. That requirement is the whole design here.
--
-- Why not reuse crm_sp1_warnings: that table is sales performance, not
-- discipline. Its columns are sales_id, stuck_prospect_ids, and a unique
-- constraint on (sales_id, period_month, period_year) -- one AI-drafted
-- letter per salesperson per month about unclosed prospects. An HR warning
-- for repeated absence has no period, no prospects, and can legitimately
-- happen twice in a month. Forcing them into one table would corrupt both.
--
-- Why termination needs its own record at all: today "terminating" someone
-- means employee.actions.ts calling softDeleteEmployee(), which sets
-- deleted_at and employment_status='terminated' and nothing else. No reason,
-- no evidence, no link to any prior warning, and the person disappears from
-- every list. For an employment decision that is the one record you cannot
-- afford not to have.
--
-- The evidence snapshot is computed inside the RPC, never accepted from the
-- caller. Two reasons: a client could otherwise fabricate the justification
-- attached to its own action, and attendance rows can be corrected later --
-- the letter must keep saying what was true on the day it was issued.
-- ============================================================================

insert into public.permissions (key, description) values
  ('hr_discipline.warn', 'Issue disciplinary warning letters (SP1/SP2/SP3)'),
  ('hr_discipline.terminate', 'Terminate an employee, with a recorded basis'),
  ('hr_discipline.view', 'View disciplinary history')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'hr_discipline.warn', 'hr_discipline.terminate', 'hr_discipline.view'
) where r.key in ('hr', 'super_admin')
on conflict do nothing;

-- Oversight roles see the history but do not issue letters themselves.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'hr_discipline.view'
where r.key in ('direktur_utama', 'direktur_operasional', 'private_assistant')
on conflict do nothing;

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
    'new_ad_lead', 'content_published', 'content_publish_reminder',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning',
    'meta_ads_balance_low',
    'content_publish_failed',
    'database_followup_push',
    'lead_wants_info',
    'loonars_fee_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled',
    -- This migration
    'disciplinary_warning', 'employee_terminated'
  ]));

-- ----------------------------------------------------------------------------
-- hr_disciplinary_actions
--
-- One row per letter issued. `evidence` is a frozen snapshot, not a live
-- join: attendance can be corrected after the fact, and a warning letter that
-- silently rewrites its own justification is worse than no letter at all.
--
-- `bypassed_ladder` records that a termination was issued without a prior
-- active warning. It is not blocked -- gross misconduct exists and HR must be
-- able to act on it the same day -- but it is always recorded, together with
-- the written justification the RPC demands in that case.
-- ----------------------------------------------------------------------------
create table if not exists public.hr_disciplinary_actions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  action_type text not null check (action_type in ('sp1', 'sp2', 'sp3', 'termination')),
  reason_category text not null check (reason_category in ('attendance', 'conduct', 'performance', 'other')),
  description text not null check (length(trim(description)) >= 10),
  evidence jsonb not null default '{}'::jsonb,
  effective_date date not null default current_date,
  last_working_date date,
  bypassed_ladder boolean not null default false,
  bypass_justification text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  revoked_by uuid references public.employees(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text,
  issued_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_disciplinary_bypass_needs_reason
    check (not bypassed_ladder or length(trim(coalesce(bypass_justification, ''))) >= 20)
);

create index if not exists hr_disciplinary_actions_employee_idx
  on public.hr_disciplinary_actions (employee_id, created_at desc);
create index if not exists hr_disciplinary_actions_active_idx
  on public.hr_disciplinary_actions (employee_id) where status = 'active';

alter table public.hr_disciplinary_actions enable row level security;

drop policy if exists hr_disciplinary_select on public.hr_disciplinary_actions;
create policy hr_disciplinary_select on public.hr_disciplinary_actions
  for select using (public.app_has_permission('hr_discipline.view') or employee_id = auth.uid());

-- Writes go exclusively through the RPCs below (security definer), so no
-- insert/update policy is granted: that keeps the evidence snapshot and the
-- ladder check impossible to bypass from PostgREST.

drop trigger if exists hr_disciplinary_actions_set_updated_at on public.hr_disciplinary_actions;
create trigger hr_disciplinary_actions_set_updated_at
  before update on public.hr_disciplinary_actions
  for each row execute function public.set_updated_at();

comment on table public.hr_disciplinary_actions is
  'HR warning letters and terminations. Distinct from crm_sp1_warnings (sales performance). Written only via hr_issue_warning/hr_terminate_employee so the evidence snapshot is always server-computed.';

-- ----------------------------------------------------------------------------
-- hr_discipline_evidence: the "do the data support this?" answer, in one
-- call. Used by the UI before HR commits to anything, and by the RPCs to
-- freeze the snapshot -- same function both times, so what HR sees on screen
-- is exactly what gets stored on the letter.
-- ----------------------------------------------------------------------------
create or replace function public.hr_discipline_evidence(p_employee_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_alpha_1m int;
  v_late_1m int;
  v_alpha_3m int;
  v_late_3m int;
  v_active_warnings int;
  v_last_warning text;
begin
  select
    count(*) filter (where status = 'alpha' and attendance_date >= current_date - interval '30 days'),
    count(*) filter (where status = 'terlambat' and attendance_date >= current_date - interval '30 days'),
    count(*) filter (where status = 'alpha' and attendance_date >= current_date - interval '90 days'),
    count(*) filter (where status = 'terlambat' and attendance_date >= current_date - interval '90 days')
    into v_alpha_1m, v_late_1m, v_alpha_3m, v_late_3m
  from public.attendance
  where user_id = p_employee_id and deleted_at is null;

  select count(*) into v_active_warnings
  from public.hr_disciplinary_actions
  where employee_id = p_employee_id and status = 'active' and action_type in ('sp1', 'sp2', 'sp3');

  select action_type into v_last_warning
  from public.hr_disciplinary_actions
  where employee_id = p_employee_id and status = 'active' and action_type in ('sp1', 'sp2', 'sp3')
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'captured_at', now(),
    'alpha_30d', coalesce(v_alpha_1m, 0),
    'late_30d', coalesce(v_late_1m, 0),
    'alpha_90d', coalesce(v_alpha_3m, 0),
    'late_90d', coalesce(v_late_3m, 0),
    'active_warnings', coalesce(v_active_warnings, 0),
    'last_warning', v_last_warning
  );
end;
$$;

grant execute on function public.hr_discipline_evidence(uuid) to authenticated;

comment on function public.hr_discipline_evidence is
  'Attendance and warning history behind a disciplinary decision. Shown to HR before issuing, and frozen into the letter when they do.';

-- ----------------------------------------------------------------------------
-- hr_issue_warning: issue SP1/SP2/SP3.
--
-- Refuses to skip a rung -- SP2 requires an active SP1, SP3 requires an
-- active SP2 -- because a warning ladder that can start at the top is not a
-- ladder, and the escalation is the part that makes the eventual termination
-- defensible.
-- ----------------------------------------------------------------------------
create or replace function public.hr_issue_warning(
  p_employee_id uuid,
  p_action_type text,
  p_reason_category text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_branch_id uuid;
  v_name text;
  v_evidence jsonb;
  v_required text;
begin
  if not public.app_has_permission('hr_discipline.warn') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_action_type not in ('sp1', 'sp2', 'sp3') then
    raise exception 'Gunakan hr_terminate_employee untuk pemberhentian';
  end if;

  select branch_id, full_name into v_branch_id, v_name
  from public.employees where id = p_employee_id and deleted_at is null;
  if not found then
    raise exception 'Karyawan tidak ditemukan';
  end if;

  v_evidence := public.hr_discipline_evidence(p_employee_id);

  -- No skipping rungs.
  v_required := case p_action_type when 'sp2' then 'sp1' when 'sp3' then 'sp2' else null end;
  if v_required is not null and not exists (
    select 1 from public.hr_disciplinary_actions
    where employee_id = p_employee_id and status = 'active' and action_type = v_required
  ) then
    raise exception 'Tidak bisa menerbitkan % sebelum ada % yang masih aktif', upper(p_action_type), upper(v_required);
  end if;

  insert into public.hr_disciplinary_actions (
    employee_id, branch_id, action_type, reason_category, description, evidence, issued_by
  ) values (
    p_employee_id, v_branch_id, p_action_type, p_reason_category, p_description, v_evidence, auth.uid()
  )
  returning id into v_id;

  -- The employee must be told they have been warned.
  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  values (
    p_employee_id, 'hr', 'disciplinary_warning',
    upper(p_action_type) || ' diterbitkan',
    'Anda menerima ' || upper(p_action_type) || ' terkait ' || p_reason_category
      || '. Silakan hubungi HR untuk penjelasan lengkap.',
    '/profile'
  );

  return v_id;
end;
$$;

grant execute on function public.hr_issue_warning(uuid, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- hr_terminate_employee
--
-- Deliberately does NOT hard-block a termination without prior warnings.
-- Gross misconduct is real and HR has to be able to act the same day; a
-- system that forbids it just gets worked around outside the system, which
-- is the outcome that leaves no record at all. Instead the absence of a
-- ladder is recorded as bypassed_ladder=true and requires a written
-- justification (>= 20 chars, enforced by check constraint).
--
-- Unlike softDeleteEmployee(), this does not set deleted_at: a terminated
-- employee stays queryable so their record, payroll history, and this letter
-- remain reachable.
-- ----------------------------------------------------------------------------
create or replace function public.hr_terminate_employee(
  p_employee_id uuid,
  p_reason_category text,
  p_description text,
  p_last_working_date date default null,
  p_bypass_justification text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_branch_id uuid;
  v_name text;
  v_evidence jsonb;
  v_has_warning boolean;
  v_bypassed boolean;
  v_admin record;
begin
  if not public.app_has_permission('hr_discipline.terminate') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select branch_id, full_name into v_branch_id, v_name
  from public.employees where id = p_employee_id and deleted_at is null;
  if not found then
    raise exception 'Karyawan tidak ditemukan';
  end if;

  if p_employee_id = auth.uid() then
    raise exception 'Tidak bisa memberhentikan diri sendiri';
  end if;

  -- Root owner protection (0011) applies here too: never let this be the
  -- path that removes a super_admin.
  if exists (
    select 1 from public.employees e join public.roles r on r.id = e.role_id
    where e.id = p_employee_id and r.key = 'super_admin'
  ) then
    raise exception 'Akun Super Admin tidak bisa diberhentikan lewat modul HR';
  end if;

  v_evidence := public.hr_discipline_evidence(p_employee_id);
  v_has_warning := (v_evidence ->> 'active_warnings')::int > 0;
  v_bypassed := not v_has_warning;

  if v_bypassed and length(trim(coalesce(p_bypass_justification, ''))) < 20 then
    raise exception 'Karyawan ini belum pernah menerima SP aktif. Wajib isi justifikasi pemberhentian minimal 20 karakter.';
  end if;

  insert into public.hr_disciplinary_actions (
    employee_id, branch_id, action_type, reason_category, description, evidence,
    last_working_date, bypassed_ladder, bypass_justification, issued_by
  ) values (
    p_employee_id, v_branch_id, 'termination', p_reason_category, p_description, v_evidence,
    coalesce(p_last_working_date, current_date), v_bypassed,
    case when v_bypassed then p_bypass_justification else null end,
    auth.uid()
  )
  returning id into v_id;

  update public.employees
    set employment_status = 'terminated', updated_at = now(), updated_by = auth.uid()
    where id = p_employee_id;

  -- Oversight, not an automated dismissal message. Telling someone they are
  -- fired is a conversation, so the employee is deliberately not notified
  -- here; management is.
  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active'
      and r.key in ('super_admin', 'direktur_utama', 'direktur_operasional')
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_admin.id, 'hr', 'employee_terminated',
      'Pemberhentian karyawan: ' || v_name,
      v_name || ' diberhentikan (' || p_reason_category || ')'
        || case when v_bypassed then ' — TANPA SP aktif sebelumnya.' else '.' end,
      '/hr/discipline'
    );
  end loop;

  return v_id;
end;
$$;

grant execute on function public.hr_terminate_employee(uuid, text, text, date, text) to authenticated;

-- ----------------------------------------------------------------------------
-- hr_revoke_disciplinary_action: warnings get overturned -- an appeal
-- succeeds, or the attendance data behind it turns out to be wrong. Revoking
-- keeps the row (it is a record) and drops it out of the active ladder.
-- ----------------------------------------------------------------------------
create or replace function public.hr_revoke_disciplinary_action(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.hr_disciplinary_actions%rowtype;
begin
  if not public.app_has_permission('hr_discipline.warn') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Alasan pencabutan wajib diisi';
  end if;

  select * into v_row from public.hr_disciplinary_actions where id = p_id for update;
  if not found then
    raise exception 'Data tidak ditemukan';
  end if;
  if v_row.status = 'revoked' then
    raise exception 'Sudah dicabut sebelumnya';
  end if;

  update public.hr_disciplinary_actions
    set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(), revoke_reason = p_reason
    where id = p_id;

  -- Reinstating a terminated employee is a separate, deliberate act -- this
  -- only undoes the letter, never the employment status.
end;
$$;

grant execute on function public.hr_revoke_disciplinary_action(uuid, text) to authenticated;
