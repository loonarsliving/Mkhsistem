-- ============================================================================
-- MK Connect — 0315: check-out for shifts that cross midnight
--
-- attendance_check_out (last defined in 0074) only looked at the row for the
-- current WITA date. A security / Front Office night shift checks in on day
-- D and checks out after midnight on D+1, where no row exists, so check-out
-- failed with "You must check in before checking out" and the shift stayed
-- open forever (seen on LPL, 2026-11: many rows with check_in and no
-- check_out).
--
-- Change: if today's row has no open check-in, fall back to the user's most
-- recent open shift (checked in, not checked out, not deleted) whose
-- check-in is at most 14 hours ago. Same window as OPEN_SHIFT_MAX_HOURS in
-- lib/attendance/current-shift.ts, which decides what the card shows —
-- keep the two equal. Everything else (radius, duration, messages) is
-- unchanged from 0074. attendance_check_in is untouched.
-- ============================================================================

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

  if found and v_existing.check_in_time is not null and v_existing.check_out_time is not null then
    raise exception 'Already checked out today';
  end if;

  if not found or v_existing.check_in_time is null then
    -- Night shift: still-open shift from an earlier date.
    select * into v_existing from public.attendance
      where user_id = v_user_id
        and attendance_date < v_local_date
        and check_in_time is not null
        and check_out_time is null
        and deleted_at is null
        and check_in_time >= now() - interval '14 hours'
      order by check_in_time desc
      limit 1;
    if not found then
      raise exception 'You must check in before checking out';
    end if;
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
