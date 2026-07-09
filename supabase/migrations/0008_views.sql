-- ============================================================================
-- MK Connect — 0008: Reporting views
-- ============================================================================

create or replace view public.v_employee_directory as
select
  e.id,
  e.employee_code,
  e.full_name,
  e.email,
  e.phone,
  e.avatar_url,
  e.employment_status,
  e.gender,
  e.birth_date,
  e.address,
  e.join_date,
  e.branch_id,
  b.name as branch_name,
  e.division_id,
  d.name as division_name,
  e.position_id,
  p.name as position_name,
  e.role_id,
  r.key as role_key,
  r.name as role_name,
  e.created_at,
  e.deleted_at
from public.employees e
join public.branches b on b.id = e.branch_id
left join public.divisions d on d.id = e.division_id
left join public.positions p on p.id = e.position_id
join public.roles r on r.id = e.role_id;

create or replace view public.v_attendance_today as
select
  e.id as user_id,
  e.full_name,
  e.avatar_url,
  e.branch_id,
  b.name as branch_name,
  e.division_id,
  e.position_id,
  a.id as attendance_id,
  a.check_in_time,
  a.check_out_time,
  a.status,
  a.check_in_within_radius,
  a.check_out_within_radius
from public.employees e
join public.branches b on b.id = e.branch_id
left join public.attendance a on a.user_id = e.id and a.attendance_date = current_date
where e.deleted_at is null and e.employment_status = 'active';

create or replace view public.v_attendance_monthly_stats as
select
  a.user_id,
  date_trunc('month', a.attendance_date)::date as month,
  count(*) filter (where a.status = 'hadir') as hadir_count,
  count(*) filter (where a.status = 'terlambat') as terlambat_count,
  count(*) filter (where a.status = 'izin') as izin_count,
  count(*) filter (where a.status = 'sakit') as sakit_count,
  count(*) filter (where a.status = 'alpha') as alpha_count,
  count(*) as total_records
from public.attendance a
where a.deleted_at is null
group by a.user_id, date_trunc('month', a.attendance_date);

create or replace view public.v_memo_read_stats as
select
  m.id as memo_id,
  (select count(*) from public.get_memo_audience(m.id)) as audience_count,
  count(mr.user_id) as read_count
from public.memos m
left join public.memo_reads mr on mr.memo_id = m.id
where m.deleted_at is null
group by m.id;
