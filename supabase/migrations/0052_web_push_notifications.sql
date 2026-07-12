-- ============================================================================
-- MK Connect — 0052: Web Push notifications (PWA), notification categories,
-- and a tri-state (unread/read/archived) Notification Center.
-- ============================================================================

-- pg_net lets a trigger fire an async outbound HTTP call without blocking
-- the calling transaction — used below to invoke the send-push Edge Function.
create extension if not exists pg_net with schema extensions;

-- ----------------------------------------------------------------------------
-- Browser push subscriptions (Web Push / VAPID). One row per (user, browser).
-- Same ownership pattern as mkc_device_push_tokens (0021): a device only
-- ever registers/removes its own subscription; only a service-role sender
-- (the Edge Function) reads across users, bypassing RLS entirely.
-- ----------------------------------------------------------------------------
create table public.mkc_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.employees (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (endpoint)
);
create index mkc_push_subscriptions_user_id_idx on public.mkc_push_subscriptions (user_id);

alter table public.mkc_push_subscriptions enable row level security;

create policy mkc_push_subscriptions_select on public.mkc_push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy mkc_push_subscriptions_insert on public.mkc_push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy mkc_push_subscriptions_update on public.mkc_push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mkc_push_subscriptions_delete on public.mkc_push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Notification taxonomy: widen `type` (coarse module) and add `category`
-- (fine-grained subtype, used for icon/routing/filter chips in the client).
-- category is nullable so every pre-existing row stays valid.
-- ----------------------------------------------------------------------------
alter table public.mkc_notifications drop constraint mkc_notifications_type_check;
alter table public.mkc_notifications add constraint mkc_notifications_type_check
  check (type = any (array[
    'memo', 'announcement', 'attendance', 'leave_request', 'system', 'registration',
    'crm', 'kpi_task', 'hr', 'finance', 'project', 'approval'
  ]));

alter table public.mkc_notifications add column category text;
alter table public.mkc_notifications add constraint mkc_notifications_category_check
  check (category is null or category = any (array[
    -- HR
    'attendance_reminder', 'late_attendance', 'forgot_checkout', 'leave_approved', 'leave_rejected', 'payroll_available',
    -- CRM
    'new_prospect', 'follow_up_reminder', 'new_assignment', 'closing_approved', 'customer_verification',
    -- Markom
    'markom_new_task', 'task_revision', 'task_approved', 'weekly_reminder',
    -- Project
    'project_progress', 'material_request', 'inspection_reminder',
    -- Finance
    'payment_received', 'invoice_due', 'reimbursement_approved',
    -- Approvals (generic, cross-cutting)
    'waiting_approval', 'approved', 'rejected',
    -- Announcements / Memo
    'new_announcement', 'new_memo',
    -- System
    'maintenance', 'version_update', 'emergency_notice'
  ]));

-- Tri-state status alongside the existing is_read/read_at (kept, many call
-- sites already read/write them) — status is the canonical field going
-- forward for the Notification Center's Unread/Read/Archived tabs.
alter table public.mkc_notifications add column status text not null default 'unread'
  check (status in ('unread', 'read', 'archived'));
update public.mkc_notifications set status = case when is_read then 'read' else 'unread' end;
create index mkc_notifications_user_status_idx on public.mkc_notifications (user_id, status);

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.mkc_notifications
  set is_read = true, read_at = now(),
      status = case when status = 'archived' then status else 'read' end
  where id = p_notification_id and user_id = auth.uid();
$$;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security invoker
set search_path = public
as $$
  update public.mkc_notifications
  set is_read = true, read_at = now(), status = 'read'
  where user_id = auth.uid() and status = 'unread';
$$;

create or replace function public.archive_notification(p_notification_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.mkc_notifications
  set status = 'archived'
  where id = p_notification_id and user_id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- Push delivery trigger: every notification insert (regardless of which RPC
-- created it) fires an async call to the send-push Edge Function. The
-- function re-fetches the row itself by id server-side rather than trusting
-- this payload, so this call only ever triggers delivery of a notification
-- that was already legitimately created and persisted -- it cannot be used
-- to inject arbitrary push content.
--
-- Authorization: verify_jwt=true on the function (Supabase's own
-- recommended default), authenticated here with the project's anon key.
-- This is NOT a secret -- it's the same key shipped to every browser as
-- NEXT_PUBLIC_SUPABASE_ANON_KEY, safe to commit. The function itself uses
-- its own service-role client (from the SUPABASE_SERVICE_ROLE_KEY Supabase
-- auto-injects into every deployed Edge Function) for the privileged lookup
-- of push subscriptions, which anon-key access cannot read (RLS-protected).
-- ----------------------------------------------------------------------------
create or replace function public.mkc_notifications_push_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://svcmybsziaelwwdrnzcv.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2Y215YnN6aWFlbHd3ZHJuemN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyODExNzEsImV4cCI6MjA5Njg1NzE3MX0.Ds4cdAthZndisUoB4CRq1Ckc4F59TKE_n1QjxlfDEiA'
    ),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

create trigger mkc_notifications_after_insert_push
  after insert on public.mkc_notifications
  for each row execute function public.mkc_notifications_push_trigger();

-- ============================================================================
-- Category-tag existing notification-creating RPCs (full CREATE OR REPLACE
-- restatements — only the mkc_notifications insert(s) in each gained a
-- `category` value; every other line is unchanged from 0007/0024/0026/0049).
-- ============================================================================

create or replace function public.attendance_check_in(
  p_latitude double precision,
  p_longitude double precision,
  p_photo_url text,
  p_note text default null
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_branch public.branches%rowtype;
  v_schedule public.work_schedules%rowtype;
  v_distance double precision;
  v_within_radius boolean;
  v_local_time time;
  v_status text;
  v_existing public.attendance%rowtype;
  v_result public.attendance%rowtype;
  v_tz text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_branch from public.branches b
    join public.employees e on e.branch_id = b.id
    where e.id = v_user_id;
  if not found then
    raise exception 'Employee or branch not found';
  end if;

  select * into v_existing from public.attendance
    where user_id = v_user_id and attendance_date = current_date;
  if found and v_existing.check_in_time is not null then
    raise exception 'Already checked in today' using errcode = 'P0001';
  end if;

  select ws.* into v_schedule from public.work_schedules ws
    where ws.is_default and ws.deleted_at is null
      and (ws.branch_id = v_branch.id or ws.branch_id is null)
    order by ws.branch_id nulls last
    limit 1;

  select timezone into v_tz from public.company_settings limit 1;
  v_tz := coalesce(v_tz, 'Asia/Makassar');
  v_local_time := (now() at time zone v_tz)::time;

  if v_branch.latitude is not null and v_branch.longitude is not null then
    v_distance := public.calculate_distance_meters(p_latitude, p_longitude, v_branch.latitude, v_branch.longitude);
    v_within_radius := v_distance <= v_branch.radius_meters;
  else
    v_distance := null;
    v_within_radius := true;
  end if;

  if v_schedule.id is not null and v_local_time > (v_schedule.start_time + make_interval(mins => v_schedule.late_tolerance_minutes)) then
    v_status := 'terlambat';
  else
    v_status := 'hadir';
  end if;

  insert into public.attendance (
    user_id, branch_id, work_schedule_id, attendance_date,
    check_in_time, check_in_latitude, check_in_longitude,
    check_in_distance_meters, check_in_within_radius, check_in_photo_url, check_in_note,
    status, created_by, updated_by
  ) values (
    v_user_id, v_branch.id, v_schedule.id, current_date,
    now(), p_latitude, p_longitude,
    v_distance, v_within_radius, p_photo_url, p_note,
    v_status, v_user_id, v_user_id
  )
  on conflict (user_id, attendance_date) do update set
    branch_id = excluded.branch_id,
    work_schedule_id = excluded.work_schedule_id,
    check_in_time = excluded.check_in_time,
    check_in_latitude = excluded.check_in_latitude,
    check_in_longitude = excluded.check_in_longitude,
    check_in_distance_meters = excluded.check_in_distance_meters,
    check_in_within_radius = excluded.check_in_within_radius,
    check_in_photo_url = excluded.check_in_photo_url,
    check_in_note = excluded.check_in_note,
    status = excluded.status,
    updated_by = v_user_id
  returning * into v_result;

  if v_status = 'terlambat' then
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_user_id, 'attendance', 'late_attendance',
      'Anda tercatat terlambat',
      'Check-in hari ini melewati batas toleransi jadwal kerja.',
      '/attendance/history'
    );
  end if;

  return v_result;
end;
$$;

create or replace function public.decide_leave_request(
  p_leave_request_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approver uuid := auth.uid();
  v_leave public.leave_requests%rowtype;
  v_day date;
  v_branch_id uuid;
begin
  if not public.app_has_permission('attendance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_leave from public.leave_requests where id = p_leave_request_id and deleted_at is null;
  if not found then
    raise exception 'Leave request not found';
  end if;
  if v_leave.status <> 'pending' then
    raise exception 'Leave request already decided';
  end if;

  update public.leave_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    approved_by = v_approver,
    approved_at = now(),
    rejection_reason = case when p_approve then null else p_rejection_reason end,
    updated_by = v_approver
  where id = p_leave_request_id
  returning * into v_leave;

  if p_approve then
    select branch_id into v_branch_id from public.employees where id = v_leave.user_id;

    v_day := v_leave.start_date;
    while v_day <= v_leave.end_date loop
      insert into public.attendance (user_id, branch_id, attendance_date, status, leave_request_id, created_by, updated_by)
      values (v_leave.user_id, v_branch_id, v_day, v_leave.type, v_leave.id, v_approver, v_approver)
      on conflict (user_id, attendance_date) do update set
        status = v_leave.type,
        leave_request_id = v_leave.id,
        updated_by = v_approver;
      v_day := v_day + 1;
    end loop;
  end if;

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  values (
    v_leave.user_id,
    'leave_request',
    case when p_approve then 'leave_approved' else 'leave_rejected' end,
    case when p_approve then 'Pengajuan izin/sakit disetujui' else 'Pengajuan izin/sakit ditolak' end,
    case when p_approve then 'Pengajuan Anda telah disetujui.' else coalesce('Alasan: ' || p_rejection_reason, 'Pengajuan Anda ditolak.') end,
    '/attendance/history'
  );

  return v_leave;
end;
$$;

create or replace function public.create_memo(
  p_title text,
  p_content text,
  p_priority text,
  p_is_pinned boolean,
  p_is_mandatory_read boolean,
  p_expires_at timestamptz,
  p_targets jsonb,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_memo_id uuid;
  v_target jsonb;
  v_attachment jsonb;
begin
  if not public.app_has_permission('memo.create') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if jsonb_array_length(p_targets) = 0 then
    raise exception 'At least one target is required';
  end if;

  insert into public.memos (title, content, priority, is_pinned, is_mandatory_read, expires_at, created_by, updated_by)
  values (p_title, p_content, p_priority, p_is_pinned, p_is_mandatory_read, p_expires_at, v_user_id, v_user_id)
  returning id into v_memo_id;

  for v_target in select * from jsonb_array_elements(p_targets) loop
    insert into public.memo_targets (memo_id, target_type, target_id)
    values (v_memo_id, v_target->>'target_type', nullif(v_target->>'target_id', '')::uuid);
  end loop;

  for v_attachment in select * from jsonb_array_elements(p_attachments) loop
    insert into public.memo_attachments (memo_id, file_url, file_name, file_size, mime_type, created_by)
    values (
      v_memo_id,
      v_attachment->>'file_url',
      v_attachment->>'file_name',
      nullif(v_attachment->>'file_size', '')::bigint,
      v_attachment->>'mime_type',
      v_user_id
    );
  end loop;

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  select ma.user_id, 'memo', 'new_memo', 'Memo baru: ' || p_title, left(p_content, 140), '/memo/' || v_memo_id
  from public.get_memo_audience(v_memo_id) ma
  where ma.user_id <> v_user_id;

  return v_memo_id;
end;
$$;

create or replace function public.create_announcement(
  p_title text,
  p_content text,
  p_category_id uuid,
  p_is_pinned boolean,
  p_expires_at timestamptz,
  p_targets jsonb,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_announcement_id uuid;
  v_target jsonb;
  v_attachment jsonb;
begin
  if not public.app_has_permission('announcement.create') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if jsonb_array_length(p_targets) = 0 then
    raise exception 'At least one target is required';
  end if;

  insert into public.announcements (title, content, category_id, is_pinned, expires_at, created_by, updated_by)
  values (p_title, p_content, p_category_id, p_is_pinned, p_expires_at, v_user_id, v_user_id)
  returning id into v_announcement_id;

  for v_target in select * from jsonb_array_elements(p_targets) loop
    insert into public.announcement_targets (announcement_id, target_type, target_id)
    values (v_announcement_id, v_target->>'target_type', nullif(v_target->>'target_id', '')::uuid);
  end loop;

  for v_attachment in select * from jsonb_array_elements(p_attachments) loop
    insert into public.announcement_attachments (announcement_id, file_url, file_name, file_size, mime_type, created_by)
    values (
      v_announcement_id,
      v_attachment->>'file_url',
      v_attachment->>'file_name',
      nullif(v_attachment->>'file_size', '')::bigint,
      v_attachment->>'mime_type',
      v_user_id
    );
  end loop;

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  select aa.user_id, 'announcement', 'new_announcement', 'Pengumuman baru: ' || p_title, left(p_content, 140), '/announcements/' || v_announcement_id
  from public.get_announcement_audience(v_announcement_id) aa
  where aa.user_id <> v_user_id;

  return v_announcement_id;
end;
$$;

create or replace function public.crm_run_follow_up_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prospect record;
  v_manager record;
begin
  for v_prospect in
    select p.id, p.customer_name, p.sales_id, p.branch_id
    from public.prospects p
    where p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and coalesce(p.last_follow_up_at, p.created_at) < now() - interval '7 days'
      and (p.last_reminder_sent_at is null or p.last_reminder_sent_at < current_date)
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_prospect.sales_id, 'crm', 'follow_up_reminder', 'Belum ada follow up: ' || v_prospect.customer_name,
      'Sudah 7 hari tanpa follow up. Segera hubungi kembali prospect ini.',
      '/crm/prospects/' || v_prospect.id
    );

    for v_manager in
      select e.id from public.employees e
      join public.roles r on r.id = e.role_id
      where e.branch_id = v_prospect.branch_id and e.deleted_at is null and r.key = 'kepala_cabang'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_manager.id, 'crm', 'follow_up_reminder', 'Follow up terlambat: ' || v_prospect.customer_name,
        'Prospect ini belum di-follow up selama 7 hari.',
        '/crm/prospects/' || v_prospect.id
      );
    end loop;

    update public.prospects set last_reminder_sent_at = now() where id = v_prospect.id;
  end loop;

  update public.prospects set status = 'inactive'
  where deleted_at is null
    and status not in ('closing', 'inactive')
    and coalesce(last_follow_up_at, created_at) < now() - interval '30 days';
end;
$$;

create or replace function public.crm_approve_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.prospect_payments%rowtype;
  v_prospect public.prospects%rowtype;
  v_commission_percent numeric(5,2);
  v_commission_amount numeric(14,2);
  v_period_month smallint;
  v_period_year smallint;
begin
  if not public.app_has_permission('prospect.finance_verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_payment from public.prospect_payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Payment already decided';
  end if;

  select * into v_prospect from public.prospects where id = v_payment.prospect_id for update;

  v_period_month := extract(month from v_payment.payment_date)::smallint;
  v_period_year := extract(year from v_payment.payment_date)::smallint;

  select commission_percent into v_commission_percent
  from public.sales_targets
  where sales_id = v_prospect.sales_id and period_month = v_period_month and period_year = v_period_year;
  v_commission_percent := coalesce(v_commission_percent, 0);
  v_commission_amount := round(v_payment.amount * v_commission_percent / 100, 2);

  update public.prospect_payments set
    status = 'approved',
    commission_amount = v_commission_amount,
    approved_by = v_user_id,
    approved_at = now()
  where id = p_payment_id;

  update public.prospects set
    total_collection = total_collection + v_payment.amount,
    total_commission = total_commission + v_commission_amount,
    status = case when status = 'green' then 'closing' else status end,
    closed_at = case when status = 'green' then now() else closed_at end,
    updated_by = v_user_id
  where id = v_prospect.id;

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  values (
    v_prospect.sales_id,
    'crm',
    case when v_prospect.status = 'closing' then 'closing_approved' else 'customer_verification' end,
    'Pembayaran disetujui: ' || v_prospect.customer_name,
    'Finance menyetujui ' || v_payment.payment_type || ' sebesar Rp ' || to_char(v_payment.amount, 'FM999,999,999,999'),
    '/crm/prospects/' || v_prospect.id
  );
end;
$$;

create or replace function public.crm_reject_payment(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.prospect_payments%rowtype;
  v_prospect public.prospects%rowtype;
begin
  if not public.app_has_permission('prospect.finance_verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_payment from public.prospect_payments where id = p_payment_id and status = 'pending';
  if not found then
    raise exception 'Payment not found or already decided';
  end if;

  select * into v_prospect from public.prospects where id = v_payment.prospect_id;

  update public.prospect_payments set
    status = 'rejected', approved_by = v_user_id, approved_at = now(), rejection_reason = p_reason
  where id = p_payment_id;

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  values (
    v_prospect.sales_id,
    'crm',
    'customer_verification',
    'Pembayaran ditolak: ' || v_prospect.customer_name,
    coalesce('Alasan: ' || p_reason, 'Finance menolak pembayaran ini, silakan periksa kembali.'),
    '/crm/prospects/' || v_prospect.id
  );
end;
$$;

create or replace function public.kpi_assign_tasks(
  p_branch_id uuid,
  p_period_year smallint,
  p_period_month smallint,
  p_period_week smallint,
  p_items jsonb,
  p_division_id uuid default null
)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_division_id uuid := coalesce(p_division_id, (select id from public.divisions where name = 'Marketing & Komunikasi'));
  v_item jsonb;
  v_task_id uuid;
  v_member record;
begin
  if not public.app_has_permission('kpi_task.assign') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if not (public.app_has_permission('kpi_task.view_all') or p_branch_id = public.app_current_branch_id()) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'Branch not found';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one checklist item is required';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce(trim(v_item->>'title'), '') = '' then
      raise exception 'Every checklist item needs a title';
    end if;

    insert into public.kpi_tasks (
      division_id, branch_id, title, description,
      period_year, period_month, period_week, due_date, created_by, updated_by
    ) values (
      v_division_id, p_branch_id,
      v_item->>'title', nullif(v_item->>'description', ''),
      p_period_year, p_period_month, p_period_week,
      nullif(v_item->>'due_date', '')::date,
      v_user_id, v_user_id
    )
    returning id into v_task_id;

    return next v_task_id;
  end loop;

  for v_member in
    select e.id from public.employees e
    where e.branch_id = p_branch_id and e.division_id = v_division_id
      and e.deleted_at is null and e.employment_status = 'active'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_member.id,
      'kpi_task',
      'markom_new_task',
      'Checklist minggu baru untuk tim',
      jsonb_array_length(p_items) || ' task baru untuk Minggu ' || p_period_week || ' ditambahkan ke checklist tim Anda.',
      '/markom'
    );
  end loop;

  return;
end;
$$;

create or replace function public.kpi_verify_task(
  p_task_id uuid,
  p_status text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.kpi_tasks%rowtype;
  v_member record;
begin
  if p_status not in ('completed', 'rejected') then
    raise exception 'Invalid status';
  end if;

  if not public.app_has_permission('kpi_task.verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_task from public.kpi_tasks where id = p_task_id and deleted_at is null;
  if not found then
    raise exception 'Task not found';
  end if;
  if exists (
    select 1 from public.employees e
    where e.id = v_user_id and e.branch_id = v_task.branch_id and e.division_id = v_task.division_id
  ) then
    raise exception 'A team member cannot verify their own team''s task' using errcode = '42501';
  end if;
  if not (public.app_has_permission('kpi_task.view_all') or v_task.branch_id = public.app_current_branch_id()) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if v_task.status <> 'pending' then
    raise exception 'This task has already been decided';
  end if;

  update public.kpi_tasks set
    status = p_status,
    completed_at = case when p_status = 'completed' then now() else null end,
    verified_by = v_user_id,
    notes = coalesce(p_notes, notes),
    updated_by = v_user_id
  where id = p_task_id;

  for v_member in
    select e.id from public.employees e
    where e.branch_id = v_task.branch_id and e.division_id = v_task.division_id
      and e.deleted_at is null and e.employment_status = 'active'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    values (
      v_member.id,
      'kpi_task',
      case when p_status = 'completed' then 'task_approved' else 'task_revision' end,
      case when p_status = 'completed' then 'Task disetujui: ' || v_task.title else 'Task perlu revisi: ' || v_task.title end,
      coalesce(p_notes, case when p_status = 'completed' then 'Task tim Anda telah disetujui Branch Manager.' else 'Task tim Anda perlu revisi, silakan cek catatan.' end),
      '/markom'
    );
  end loop;
end;
$$;

create or replace function public.approve_employee_registration(p_employee_id uuid)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.employees;
  v_staff_role_id uuid;
begin
  select * into v_target from public.employees where id = p_employee_id for update;
  if not found then
    raise exception 'Registrasi tidak ditemukan' using errcode = 'P0002';
  end if;

  if not (
    public.app_is_super_admin()
    or (
      public.app_has_permission('registration.manage')
      and (public.app_has_permission('registration.view_all') or v_target.branch_id = public.app_current_branch_id())
    )
  ) then
    raise exception 'Anda tidak berwenang menyetujui registrasi ini' using errcode = '42501';
  end if;

  if v_target.approval_status <> 'pending' then
    raise exception 'Registrasi ini sudah diproses' using errcode = '22023';
  end if;

  select id into v_staff_role_id from public.roles where key = 'staff';

  update public.employees
  set role_id = v_staff_role_id,
      approval_status = 'approved',
      is_active = true,
      approved_by = auth.uid(),
      approved_at = now(),
      rejected_by = null,
      rejected_at = null,
      rejection_reason = null
  where id = p_employee_id and approval_status = 'pending'
  returning * into v_target;

  if not found then
    raise exception 'Registrasi ini sudah diproses' using errcode = '22023';
  end if;

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  values (
    v_target.id, 'registration', 'approved',
    'Registrasi Anda disetujui',
    'Akun Anda telah disetujui dan aktif. Selamat bergabung!',
    '/dashboard'
  );

  return v_target;
end;
$$;

create or replace function public.reject_employee_registration(p_employee_id uuid, p_reason text default null)
returns public.employees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.employees;
begin
  select * into v_target from public.employees where id = p_employee_id for update;
  if not found then
    raise exception 'Registrasi tidak ditemukan' using errcode = 'P0002';
  end if;

  if not (
    public.app_is_super_admin()
    or (
      public.app_has_permission('registration.manage')
      and (public.app_has_permission('registration.view_all') or v_target.branch_id = public.app_current_branch_id())
    )
  ) then
    raise exception 'Anda tidak berwenang menolak registrasi ini' using errcode = '42501';
  end if;

  if v_target.approval_status <> 'pending' then
    raise exception 'Registrasi ini sudah diproses' using errcode = '22023';
  end if;

  update public.employees
  set approval_status = 'rejected',
      is_active = false,
      rejected_by = auth.uid(),
      rejected_at = now(),
      rejection_reason = p_reason
  where id = p_employee_id and approval_status = 'pending'
  returning * into v_target;

  if not found then
    raise exception 'Registrasi ini sudah diproses' using errcode = '22023';
  end if;

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  values (
    v_target.id, 'registration', 'rejected',
    'Registrasi Anda ditolak',
    coalesce('Alasan: ' || p_reason, 'Registrasi Anda tidak dapat disetujui.'),
    null
  );

  return v_target;
end;
$$;

-- ============================================================================
-- New scheduled reminders — the two HR categories and the one Markom
-- category that had no existing trigger point.
-- ============================================================================

create or replace function public.attendance_notify_checkin_reminder()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  select e.id, 'hr', 'attendance_reminder', 'Jangan lupa check-in',
    'Anda belum check-in hari ini. Segera lakukan check-in sebelum jadwal kerja dimulai.',
    '/attendance'
  from public.employees e
  join public.roles r on r.id = e.role_id
  where e.deleted_at is null and e.is_active and e.employment_status = 'active' and r.key <> 'pending'
    and not exists (
      select 1 from public.attendance a
      where a.user_id = e.id and a.attendance_date = current_date and a.check_in_time is not null
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 23:30 UTC Sun-Thu = 07:30 WITA Mon-Fri, 30 min before the default 08:00
-- schedule start (mirrors the WITA-conversion pattern in 0013/0026).
select cron.schedule(
  'attendance-checkin-reminder-daily',
  '30 23 * * 0-4',
  $$select public.attendance_notify_checkin_reminder();$$
);

create or replace function public.attendance_notify_forgot_checkout()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  select a.user_id, 'hr', 'forgot_checkout', 'Anda belum check-out',
    'Tercatat check-in hari ini tapi belum check-out. Jangan lupa check-out sebelum meninggalkan kantor.',
    '/attendance/history'
  from public.attendance a
  where a.attendance_date = current_date
    and a.check_in_time is not null
    and a.check_out_time is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 09:00 UTC = 17:00 WITA, the default schedule's end_time -- an hour before
-- mark_absentees_alpha (0013) so a genuine forgot-checkout nudge lands
-- before end-of-day finalization.
select cron.schedule(
  'attendance-forgot-checkout-daily',
  '0 9 * * *',
  $$select public.attendance_notify_forgot_checkout();$$
);

create or replace function public.markom_weekly_reminder()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  select distinct e.id, 'kpi_task', 'weekly_reminder', 'Checklist mingguan belum selesai',
    'Tim Anda masih memiliki task Markom yang belum diselesaikan minggu ini.', '/markom'
  from public.kpi_tasks t
  join public.employees e
    on e.branch_id = t.branch_id and e.division_id = t.division_id
    and e.deleted_at is null and e.employment_status = 'active'
  where t.status = 'pending' and t.deleted_at is null
    and t.period_year = extract(year from current_date)::smallint
    and t.period_month = extract(month from current_date)::smallint;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Thursday 02:00 UTC = 10:00 WITA, a mid-week nudge before the week closes out.
select cron.schedule(
  'markom-weekly-reminder',
  '0 2 * * 4',
  $$select public.markom_weekly_reminder();$$
);
