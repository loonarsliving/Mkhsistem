-- ============================================================================
-- MK Connect — 0007: Transactional RPC functions (business logic)
-- All SECURITY DEFINER functions perform their own permission checks since
-- they intentionally bypass RLS to fan out writes (notifications, targets)
-- across rows the calling user could not otherwise write directly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Attendance: check-in
-- ----------------------------------------------------------------------------
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

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Attendance: check-out
-- ----------------------------------------------------------------------------
create or replace function public.attendance_check_out(
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
  v_existing public.attendance%rowtype;
  v_distance double precision;
  v_within_radius boolean;
  v_result public.attendance%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_existing from public.attendance
    where user_id = v_user_id and attendance_date = current_date;
  if not found or v_existing.check_in_time is null then
    raise exception 'You must check in before checking out';
  end if;
  if v_existing.check_out_time is not null then
    raise exception 'Already checked out today';
  end if;

  select * into v_branch from public.branches where id = v_existing.branch_id;

  if v_branch.latitude is not null and v_branch.longitude is not null then
    v_distance := public.calculate_distance_meters(p_latitude, p_longitude, v_branch.latitude, v_branch.longitude);
    v_within_radius := v_distance <= v_branch.radius_meters;
  else
    v_distance := null;
    v_within_radius := true;
  end if;

  update public.attendance set
    check_out_time = now(),
    check_out_latitude = p_latitude,
    check_out_longitude = p_longitude,
    check_out_distance_meters = v_distance,
    check_out_within_radius = v_within_radius,
    check_out_photo_url = p_photo_url,
    check_out_note = p_note,
    work_duration_minutes = extract(epoch from (now() - v_existing.check_in_time)) / 60,
    updated_by = v_user_id
  where id = v_existing.id
  returning * into v_result;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Leave requests: approve / reject, syncing attendance rows on approval
-- ----------------------------------------------------------------------------
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

  insert into public.notifications (user_id, type, title, body, link)
  values (
    v_leave.user_id,
    'leave_request',
    case when p_approve then 'Pengajuan izin/sakit disetujui' else 'Pengajuan izin/sakit ditolak' end,
    case when p_approve then 'Pengajuan Anda telah disetujui.' else coalesce('Alasan: ' || p_rejection_reason, 'Pengajuan Anda ditolak.') end,
    '/attendance/history'
  );

  return v_leave;
end;
$$;

-- ----------------------------------------------------------------------------
-- Memo: create with targets, attachments, and notification fan-out
-- ----------------------------------------------------------------------------
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

  insert into public.notifications (user_id, type, title, body, link)
  select ma.user_id, 'memo', 'Memo baru: ' || p_title, left(p_content, 140), '/memo/' || v_memo_id
  from public.get_memo_audience(v_memo_id) ma
  where ma.user_id <> v_user_id;

  return v_memo_id;
end;
$$;

create or replace function public.mark_memo_read(p_memo_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.memo_reads (memo_id, user_id)
  values (p_memo_id, auth.uid())
  on conflict do nothing;
$$;

-- ----------------------------------------------------------------------------
-- Announcement: create with targets, attachments, and notification fan-out
-- ----------------------------------------------------------------------------
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

  insert into public.notifications (user_id, type, title, body, link)
  select aa.user_id, 'announcement', 'Pengumuman baru: ' || p_title, left(p_content, 140), '/announcements/' || v_announcement_id
  from public.get_announcement_audience(v_announcement_id) aa
  where aa.user_id <> v_user_id;

  return v_announcement_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Notifications helpers
-- ----------------------------------------------------------------------------
create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.notifications
  set is_read = true, read_at = now()
  where id = p_notification_id and user_id = auth.uid();
$$;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security invoker
set search_path = public
as $$
  update public.notifications
  set is_read = true, read_at = now()
  where user_id = auth.uid() and not is_read;
$$;

-- ----------------------------------------------------------------------------
-- Daily alpha marker — to be invoked by a scheduled Edge Function / pg_cron
-- at end-of-day; marks employees with no attendance record as 'alpha' for
-- their branch's working day.
-- ----------------------------------------------------------------------------
create or replace function public.mark_absentees_alpha(p_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.attendance (user_id, branch_id, attendance_date, status)
  select e.id, e.branch_id, p_date, 'alpha'
  from public.employees e
  where e.deleted_at is null
    and e.employment_status = 'active'
    and not exists (
      select 1 from public.attendance a
      where a.user_id = e.id and a.attendance_date = p_date
    )
    and exists (
      select 1 from public.work_schedules ws
      where (ws.branch_id = e.branch_id or ws.branch_id is null)
        and ws.is_default and ws.deleted_at is null
        and extract(dow from p_date)::smallint = any (ws.work_days)
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
