-- ============================================================================
-- MK Connect — 0074: Fix attendance check-in/out using UTC date instead of
-- WITA-local date
--
-- attendance_check_in already correctly computes v_local_time via
-- `now() at time zone v_tz` (company_settings.timezone, default
-- 'Asia/Makassar' / WITA), but both it and attendance_check_out still
-- matched/inserted attendance rows using plain `current_date` -- which
-- resolves in the database SESSION's timezone (UTC; no migration has ever
-- run `SET timezone`), not the company's WITA business day. For any
-- check-in/out between 00:00-07:59 WITA (= 16:00-23:59 UTC the *previous*
-- day), `current_date` still returns yesterday's UTC date, so an
-- early-morning check-in could silently be filed under the wrong day --
-- related to the "jam tidak sesuai" report even though it's a date, not a
-- clock-face, bug. Fixed by using the same WITA-local date everywhere
-- attendance_date is matched or written.
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
  v_local_date date;
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

  select timezone into v_tz from public.company_settings limit 1;
  v_tz := coalesce(v_tz, 'Asia/Makassar');
  v_local_date := (now() at time zone v_tz)::date;
  v_local_time := (now() at time zone v_tz)::time;

  select * into v_existing from public.attendance
    where user_id = v_user_id and attendance_date = v_local_date;
  if found and v_existing.check_in_time is not null then
    raise exception 'Already checked in today' using errcode = 'P0001';
  end if;

  select ws.* into v_schedule from public.work_schedules ws
    where ws.is_default and ws.deleted_at is null
      and (ws.branch_id = v_branch.id or ws.branch_id is null)
    order by ws.branch_id nulls last
    limit 1;

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
    v_user_id, v_branch.id, v_schedule.id, v_local_date,
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
  v_tz text;
  v_local_date date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select timezone into v_tz from public.company_settings limit 1;
  v_tz := coalesce(v_tz, 'Asia/Makassar');
  v_local_date := (now() at time zone v_tz)::date;

  select * into v_existing from public.attendance
    where user_id = v_user_id and attendance_date = v_local_date;
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
