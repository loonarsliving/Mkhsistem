-- ============================================================================
-- MK Connect — 0003: Attendance domain
-- work_schedules, attendance, leave_requests
-- ============================================================================

create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  name text not null,
  start_time time not null default '08:00',
  end_time time not null default '17:00',
  late_tolerance_minutes smallint not null default 15 check (late_tolerance_minutes >= 0),
  work_days smallint[] not null default '{1,2,3,4,5}', -- 0=Sunday .. 6=Saturday
  is_default boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index work_schedules_branch_id_idx on public.work_schedules (branch_id);
-- Only one default schedule per branch (partial unique index; branch_id null = global default)
create unique index work_schedules_one_default_per_branch
  on public.work_schedules (coalesce(branch_id, '00000000-0000-0000-0000-000000000000'))
  where is_default and deleted_at is null;

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  work_schedule_id uuid references public.work_schedules(id) on delete set null,
  attendance_date date not null default current_date,

  check_in_time timestamptz,
  check_in_latitude double precision,
  check_in_longitude double precision,
  check_in_distance_meters double precision,
  check_in_within_radius boolean,
  check_in_photo_url text,
  check_in_note text,

  check_out_time timestamptz,
  check_out_latitude double precision,
  check_out_longitude double precision,
  check_out_distance_meters double precision,
  check_out_within_radius boolean,
  check_out_photo_url text,
  check_out_note text,

  status text not null default 'alpha'
    check (status in ('hadir', 'terlambat', 'izin', 'sakit', 'alpha')),
  work_duration_minutes integer,
  leave_request_id uuid,

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,

  unique (user_id, attendance_date)
);
create index attendance_user_id_idx on public.attendance (user_id);
create index attendance_branch_id_idx on public.attendance (branch_id);
create index attendance_date_idx on public.attendance (attendance_date);
create index attendance_status_idx on public.attendance (status);
create index attendance_branch_date_idx on public.attendance (branch_id, attendance_date);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.employees(id) on delete cascade,
  type text not null check (type in ('izin', 'sakit')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  reason text not null,
  attachment_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references public.employees(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index leave_requests_user_id_idx on public.leave_requests (user_id);
create index leave_requests_status_idx on public.leave_requests (status);
create index leave_requests_date_range_idx on public.leave_requests (start_date, end_date);

alter table public.attendance
  add constraint attendance_leave_request_id_fkey
  foreign key (leave_request_id) references public.leave_requests(id) on delete set null;
