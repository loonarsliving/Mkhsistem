-- ============================================================================
-- MK Connect — 0291: Loonars Connect, Phase 1 (Hospitality)
--
-- Owner's ask (2026-10-23): replace the internal Hospitality WhatsApp group
-- with an in-app operational group ("Hospitality Loonars") that carries
-- structured work (cleaning checklists, FO room inspection, security
-- reports, issues/incidents), plus a SEPARATE owner-facing feed that only
-- receives consolidated report cards and critical alerts -- never the raw
-- conversation.
--
-- Shape (department-extensible, Hospitality is the only department seeded):
--   department -> operational group (members only) -> structured records
--              -> consolidation (app code, lib/hospitality/report.ts)
--              -> owner feed (hospitality.owner_report permission, NOT
--                 membership)
--
-- Source of truth stays where it is. Rooms, reservations, housekeeping and
-- Cloudbeds belong to the villa app (tables units / bookings / housekeeping /
-- villa_room_checks / villa_room_maintenance in this same shared Supabase
-- project, all service_role-only RLS). Nothing here copies them:
--   * A room task is created only for an EXISTING villa housekeeping row
--     (jenis 'bersih', status 'pending') whose unit is EXISTING status
--     'dirty' -- the villa app's own checkout (villa_commit_checkout) is what
--     makes a room eligible.
--   * The only write back into villa tables is mkc_hosp_fo_inspect() with
--     decision 'ready', and it performs EXACTLY the villa-api
--     PATCH /housekeeping/done transition for a 'bersih' task
--     (housekeeping -> done, units 'dirty' -> 'available'), but only after
--     cleaning submitted a checklist and FO passed every inspection item
--     with the required photos. villa-api accepts only villa_users sessions,
--     so MK Connect cannot call that endpoint; mirroring its two UPDATEs
--     (and nothing more -- no Cloudbeds call is involved in that endpoint
--     either) is the narrowest faithful option. See docs/HOSPITALITY_CONNECT.md.
--   * If the Front Desk marks the room done in the villa app instead, the
--     task closes as completion_source 'villa_app' and the owner report shows
--     it as "selesai tanpa verifikasi FO" -- never silently as verified.
--
-- Roles: no parallel permission system. Module-level access is RBAC
-- (hospitality.owner_report -> super_admin). In-group responsibilities
-- (manager / front_office / cleaning / security) are group-membership
-- roles derived from DATA: LPL divisions (mkc_chat_division_roles) or an
-- explicit assignment row (mkc_chat_role_assignments, e.g. the Hospitality
-- Manager whose employee record sits in another branch). No staff identity
-- is hardcoded here; assignments are inserted against the live DB.
--
-- Evidence files: private bucket 'hospitality-evidence', expires_at set by
-- trigger (30 days, client cannot choose), deleted by
-- /api/hospitality/retention (Storage API, real object deletion). Messages,
-- checklists, issues and reports outlive the files.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('hospitality.owner_report', 'Read the owner-facing Hospitality report feed (consolidated report cards, critical alerts) and the supporting operational records, without joining the operational group')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'hospitality.owner_report'
where r.key = 'super_admin'
on conflict do nothing;

-- Cleaning has no division yet; without one, cleaning staff cannot
-- self-register into the LPL branch (same pattern as 0282).
insert into public.divisions (branch_id, code, name, description, is_active)
select b.id, 'LPL-CLN', 'Cleaning', 'Housekeeping / kebersihan kamar villa Loonars Private Living', true
from public.branches b
where b.code = 'LPL'
on conflict (branch_id, name) do nothing;

-- ----------------------------------------------------------------------------
-- Departments, conversations, membership
-- ----------------------------------------------------------------------------
create table public.mkc_chat_departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  branch_id uuid references public.branches(id),
  timezone text not null default 'Asia/Jakarta',
  -- Tunable without a deploy. Read by app code and by the functions below.
  settings jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mkc_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  kind text not null check (kind in ('operational_group', 'owner_feed')),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (department_id, kind)
);

create table public.mkc_chat_division_roles (
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete cascade,
  member_role text not null check (member_role in ('manager', 'front_office', 'cleaning', 'security')),
  primary key (department_id, division_id)
);

create table public.mkc_chat_role_assignments (
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  member_role text not null check (member_role in ('manager', 'front_office', 'cleaning', 'security')),
  note text,
  assigned_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (department_id, employee_id)
);

create table public.mkc_chat_members (
  conversation_id uuid not null references public.mkc_chat_conversations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  member_role text not null check (member_role in ('manager', 'front_office', 'cleaning', 'security')),
  source text not null check (source in ('division', 'assignment')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (conversation_id, employee_id)
);
create index mkc_chat_members_employee_idx on public.mkc_chat_members (employee_id) where removed_at is null;

create table public.mkc_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.mkc_chat_conversations(id) on delete cascade,
  -- null = system-generated
  sender_id uuid references public.employees(id),
  kind text not null check (kind in (
    'text', 'checklist', 'task', 'room_readiness', 'incident', 'work_report',
    'system', 'record_link', 'report_card', 'alert'
  )),
  body text not null default '' check (length(body) <= 4000),
  ref_table text check (ref_table in ('room_task', 'issue', 'checklist', 'report')),
  ref_id uuid,
  -- snapshot for history; cards render the LIVE status of ref_id, never this
  payload jsonb not null default '{}'::jsonb,
  -- one system message per meaningful state change (no duplicate spam)
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (conversation_id, dedupe_key)
);
create index mkc_chat_messages_conv_idx on public.mkc_chat_messages (conversation_id, created_at desc);
create index mkc_chat_messages_ref_idx on public.mkc_chat_messages (ref_table, ref_id) where ref_id is not null;

create table public.mkc_chat_reads (
  conversation_id uuid not null references public.mkc_chat_conversations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, employee_id)
);

-- ----------------------------------------------------------------------------
-- Hospitality operational records
-- ----------------------------------------------------------------------------
create table public.mkc_hosp_room_tasks (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  -- The villa app's own housekeeping row this task tracks (never created here).
  housekeeping_id uuid unique references public.housekeeping(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  unit_nomor text not null,
  status text not null default 'pending' check (status in (
    'pending', 'in_progress', 'awaiting_inspection', 'completed', 'blocked', 'cancelled'
  )),
  assigned_to uuid references public.employees(id),
  started_by uuid references public.employees(id),
  started_at timestamptz,
  submitted_by uuid references public.employees(id),
  submitted_at timestamptz,
  inspected_by uuid references public.employees(id),
  inspected_at timestamptz,
  rework_count integer not null default 0,
  completed_at timestamptz,
  -- fo_verified: FO passed inspection here and the room was released.
  -- villa_app:   marked done in the villa Front Desk, no FO inspection here.
  completion_source text check (completion_source in ('fo_verified', 'villa_app')),
  blocked_reason text,
  -- set by the sync when villa data no longer matches this open task
  conflict_note text,
  target_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mkc_hosp_room_tasks_open_idx on public.mkc_hosp_room_tasks (department_id, status)
  where status not in ('completed', 'cancelled');

create table public.mkc_hosp_checklists (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  conversation_id uuid not null references public.mkc_chat_conversations(id) on delete cascade,
  kind text not null check (kind in (
    'cleaning', 'fo_inspection', 'security_shift_start', 'security_late_checkin',
    'security_patrol', 'security_shift_end'
  )),
  room_task_id uuid references public.mkc_hosp_room_tasks(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  unit_nomor text,
  submitted_by uuid not null references public.employees(id),
  submitted_at timestamptz not null default now(),
  -- local (department timezone) calendar date, for "missing report" checks
  report_date date not null,
  items jsonb not null,
  notes text check (length(notes) <= 2000),
  result text not null check (result in ('pass', 'fail', 'ok', 'issue')),
  decision text check (decision in ('ready', 'needs_recleaning', 'needs_maintenance')),
  -- structured, non-identifying extras (arrival time, verification flags)
  details jsonb not null default '{}'::jsonb,
  message_id uuid references public.mkc_chat_messages(id) on delete set null
);
create index mkc_hosp_checklists_dept_date_idx on public.mkc_hosp_checklists (department_id, report_date, kind);
create index mkc_hosp_checklists_task_idx on public.mkc_hosp_checklists (room_task_id) where room_task_id is not null;

create sequence public.mkc_hosp_issue_seq;

create table public.mkc_hosp_issues (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('HSP-' || lpad(nextval('public.mkc_hosp_issue_seq')::text, 4, '0')),
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  conversation_id uuid not null references public.mkc_chat_conversations(id) on delete cascade,
  category text not null check (category in ('room', 'facility', 'security', 'guest_complaint', 'cleaning', 'other')),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  unit_id uuid references public.units(id) on delete set null,
  unit_nomor text,
  location text check (length(location) <= 200),
  title text not null check (length(trim(title)) between 3 and 200),
  description text not null check (length(trim(description)) between 3 and 4000),
  occurred_at timestamptz not null default now(),
  action_taken text check (length(action_taken) <= 2000),
  reporter_id uuid not null references public.employees(id),
  assigned_to uuid references public.employees(id),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'cancelled')),
  target_at timestamptz,
  resolution_notes text,
  resolved_by uuid references public.employees(id),
  resolved_at timestamptz,
  cancel_reason text,
  cancelled_by uuid references public.employees(id),
  cancelled_at timestamptz,
  room_task_id uuid references public.mkc_hosp_room_tasks(id) on delete set null,
  source_checklist_id uuid references public.mkc_hosp_checklists(id) on delete set null,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- "resolved" must carry notes; "cancelled" must carry an authorized reason
  check (status <> 'resolved' or (resolved_at is not null and length(trim(coalesce(resolution_notes, ''))) > 0)),
  check (status <> 'cancelled' or (cancelled_at is not null and length(trim(coalesce(cancel_reason, ''))) > 0))
);
create index mkc_hosp_issues_open_idx on public.mkc_hosp_issues (department_id, status) where status in ('open', 'in_progress');

create table public.mkc_hosp_issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.mkc_hosp_issues(id) on delete cascade,
  actor_id uuid references public.employees(id),
  event text not null check (event in ('created', 'assigned', 'status_changed', 'note', 'escalated')),
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create index mkc_hosp_issue_events_issue_idx on public.mkc_hosp_issue_events (issue_id, created_at);

create table public.mkc_hosp_reports (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  period_kind text not null check (period_kind in ('morning', 'afternoon', 'end_of_day', 'manual')),
  report_date date not null,
  status text not null default 'generating' check (status in ('generating', 'success', 'failed')),
  attempts integer not null default 0,
  data jsonb,
  -- per source: { ok, fetched_at, error } -- what was and wasn't available
  sources jsonb,
  error text,
  started_at timestamptz,
  generated_at timestamptz,
  generated_by uuid references public.employees(id),
  message_id uuid references public.mkc_chat_messages(id) on delete set null,
  acknowledged_by uuid references public.employees(id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
-- Idempotency: one scheduled report per department / date / period.
create unique index mkc_hosp_reports_period_uidx on public.mkc_hosp_reports (department_id, report_date, period_kind)
  where period_kind <> 'manual';
create index mkc_hosp_reports_recent_idx on public.mkc_hosp_reports (department_id, created_at desc);

create table public.mkc_chat_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.mkc_chat_conversations(id) on delete cascade,
  message_id uuid references public.mkc_chat_messages(id) on delete set null,
  room_task_id uuid references public.mkc_hosp_room_tasks(id) on delete set null,
  issue_id uuid references public.mkc_hosp_issues(id) on delete set null,
  checklist_id uuid references public.mkc_hosp_checklists(id) on delete set null,
  evidence_slot text check (evidence_slot in ('bed', 'bathroom', 'main_room', 'problem', 'other')),
  bucket text not null default 'hospitality-evidence' check (bucket = 'hospitality-evidence'),
  object_path text not null unique,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid not null references public.employees(id),
  uploaded_at timestamptz not null default now(),
  -- trusted server-side: always uploaded_at + department retention (trigger)
  expires_at timestamptz not null,
  retention_hold_until timestamptz,
  retention_hold_reason text,
  retention_hold_by uuid references public.employees(id),
  retention_hold_at timestamptz,
  deleted_at timestamptz,
  delete_attempts integer not null default 0,
  last_delete_error text,
  last_delete_attempt_at timestamptz
);
create index mkc_chat_attachments_expiry_idx on public.mkc_chat_attachments (expires_at) where deleted_at is null;
create index mkc_chat_attachments_message_idx on public.mkc_chat_attachments (message_id) where message_id is not null;
create index mkc_chat_attachments_task_idx on public.mkc_chat_attachments (room_task_id) where room_task_id is not null;
create index mkc_chat_attachments_issue_idx on public.mkc_chat_attachments (issue_id) where issue_id is not null;
create index mkc_chat_attachments_checklist_idx on public.mkc_chat_attachments (checklist_id) where checklist_id is not null;

-- Retention cleanup outcomes (one row per run).
create table public.mkc_chat_retention_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  candidates integer not null default 0,
  deleted integer not null default 0,
  failed integer not null default 0,
  error text
);

create trigger set_updated_at before update on public.mkc_chat_departments
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.mkc_hosp_room_tasks
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.mkc_hosp_issues
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Seed: Hospitality department + its two conversations + division mapping
-- ----------------------------------------------------------------------------
insert into public.mkc_chat_departments (code, name, branch_id, timezone, settings)
select 'hospitality', 'Hospitality', b.id, 'Asia/Jakarta', jsonb_build_object(
  'report_times', jsonb_build_object('morning', '08:00', 'afternoon', '14:00', 'end_of_day', '21:00'),
  'retention_days', 30,
  'max_retention_hold_days', 180,
  'cleaning_target_minutes', 180,
  'inspection_target_minutes', 60,
  'inspection_photos_required', true,
  'inspection_photo_slots', jsonb_build_array('bed', 'bathroom', 'main_room'),
  'cleaning_photos_required', false,
  'issue_target_hours', jsonb_build_object('critical', 2, 'high', 8, 'medium', 24, 'low', 72),
  'alert_severities', jsonb_build_array('critical'),
  'stale_data_minutes', 30,
  'required_reports', jsonb_build_array(
    jsonb_build_object('kind', 'security_shift_start', 'min_per_day', 1, 'due_after', '09:00'),
    jsonb_build_object('kind', 'security_shift_end', 'min_per_day', 1, 'due_after', '22:00')
  )
)
from public.branches b where b.code = 'LPL'
on conflict (code) do nothing;

insert into public.mkc_chat_conversations (department_id, kind, name, description)
select d.id, 'operational_group', 'Hospitality Loonars', 'Grup operasional Hospitality: Front Office, Cleaning, Security, Hospitality Manager'
from public.mkc_chat_departments d where d.code = 'hospitality'
on conflict (department_id, kind) do nothing;

insert into public.mkc_chat_conversations (department_id, kind, name, description)
select d.id, 'owner_feed', 'Laporan Hospitality', 'Laporan konsolidasi & peringatan kritis Hospitality untuk owner'
from public.mkc_chat_departments d where d.code = 'hospitality'
on conflict (department_id, kind) do nothing;

insert into public.mkc_chat_division_roles (department_id, division_id, member_role)
select d.id, dv.id, v.member_role
from public.mkc_chat_departments d
join public.branches b on b.code = 'LPL'
join (values ('LPL-FO', 'front_office'), ('LPL-SEC', 'security'), ('LPL-HEAD', 'manager'), ('LPL-CLN', 'cleaning'))
  as v(division_code, member_role) on true
join public.divisions dv on dv.branch_id = b.id and dv.code = v.division_code
where d.code = 'hospitality'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Checklist definitions. MUST match lib/hospitality/checklists.ts
-- (tests/unit/lib/hospitality-checklists.test.ts parses this function).
-- ----------------------------------------------------------------------------
create or replace function public.mkc_hosp_checklist_items(p_kind text)
returns text[]
language sql
immutable
as $$
  select case p_kind
    when 'cleaning' then array['sampah_dibuang', 'linen_diganti', 'kamar_mandi_dibersihkan', 'lantai_disapu_dipel', 'debu_permukaan', 'amenities_diisi', 'handuk_diganti', 'kolam_dicek', 'ac_lampu_dimatikan']
    when 'fo_inspection' then array['kebersihan_aroma', 'tempat_tidur_linen', 'kamar_mandi_air_pembuangan', 'amenities_handuk', 'ac_lampu_fasilitas', 'kolam_renang', 'pintu_kunci_keamanan']
    when 'security_shift_start' then array['akses_gerbang', 'cctv', 'lampu', 'parkir_area_umum', 'kunci_akses', 'serah_terima_shift']
    when 'security_late_checkin' then array['reservasi_terverifikasi', 'kunci_akses_diserahkan', 'tamu_diantar_ke_unit']
    when 'security_patrol' then array['gerbang', 'area_parkir', 'area_umum', 'perimeter', 'lampu_area']
    when 'security_shift_end' then array['area_aman', 'cctv', 'kunci_akses', 'catatan_serah_terima']
  end
$$;

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function public.mkc_hosp_setting(p_department_id uuid, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select settings -> p_key from public.mkc_chat_departments where id = p_department_id
$$;

create or replace function public.mkc_hosp_local_date(p_department_id uuid, p_at timestamptz default now())
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (p_at at time zone coalesce((select timezone from public.mkc_chat_departments where id = p_department_id), 'Asia/Jakarta'))::date
$$;

-- An employee counts only while approved, active and not deleted.
create or replace function public.mkc_chat_employee_eligible(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee_id and e.deleted_at is null and e.is_active
      and e.approval_status = 'approved' and e.employment_status = 'active'
  )
$$;

-- Caller's role in a conversation, or null when not an active member.
create or replace function public.mkc_chat_my_role(p_conversation_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.member_role
  from public.mkc_chat_members m
  where m.conversation_id = p_conversation_id and m.employee_id = auth.uid() and m.removed_at is null
    and public.mkc_chat_employee_eligible(auth.uid())
$$;

create or replace function public.mkc_chat_can_read(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mkc_chat_conversations c
    where c.id = p_conversation_id
      and (
        (c.kind = 'operational_group' and public.mkc_chat_my_role(c.id) is not null)
        or (c.kind = 'owner_feed' and public.app_has_permission('hospitality.owner_report'))
      )
  )
$$;

-- Operational records of a department: its group members, or the owner.
create or replace function public.mkc_hosp_can_view_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_has_permission('hospitality.owner_report')
      or exists (
        select 1 from public.mkc_chat_conversations c
        where c.department_id = p_department_id and c.kind = 'operational_group'
          and public.mkc_chat_my_role(c.id) is not null
      )
$$;

create or replace function public.mkc_hosp_group_id(p_department_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.mkc_chat_conversations where department_id = p_department_id and kind = 'operational_group'
$$;

create or replace function public.mkc_hosp_feed_id(p_department_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.mkc_chat_conversations where department_id = p_department_id and kind = 'owner_feed'
$$;

-- Posts a system/structured message once per dedupe key. Returns the message id
-- (existing one on a duplicate). Internal: not granted to clients.
create or replace function public.mkc_chat_post(
  p_conversation_id uuid, p_kind text, p_body text, p_ref_table text, p_ref_id uuid,
  p_payload jsonb, p_dedupe_key text, p_sender_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.mkc_chat_messages (conversation_id, sender_id, kind, body, ref_table, ref_id, payload, dedupe_key)
  values (p_conversation_id, p_sender_id, p_kind, left(coalesce(p_body, ''), 4000), p_ref_table, p_ref_id, coalesce(p_payload, '{}'::jsonb), p_dedupe_key)
  on conflict (conversation_id, dedupe_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.mkc_chat_messages where conversation_id = p_conversation_id and dedupe_key = p_dedupe_key;
  end if;
  return v_id;
end;
$$;

create or replace function public.mkc_hosp_notify(
  p_employee_ids uuid[], p_title text, p_body text, p_link text, p_category text, p_metadata jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.mkc_notifications (user_id, type, title, body, link, category, metadata)
  select distinct u, 'info', p_title, p_body, p_link, p_category, coalesce(p_metadata, '{}'::jsonb)
  from unnest(p_employee_ids) as u
  where u is not null and public.mkc_chat_employee_eligible(u);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Active members of a department group holding one of the given roles.
create or replace function public.mkc_hosp_members_with_role(p_department_id uuid, p_roles text[])
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(m.employee_id), '{}')
  from public.mkc_chat_members m
  join public.mkc_chat_conversations c on c.id = m.conversation_id
  where c.department_id = p_department_id and c.kind = 'operational_group'
    and m.removed_at is null and m.member_role = any (p_roles)
    and public.mkc_chat_employee_eligible(m.employee_id)
$$;

create or replace function public.mkc_hosp_owner_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct e.id), '{}')
  from public.employees e
  join public.role_permissions rp on rp.role_id = e.role_id
  join public.permissions p on p.id = rp.permission_id and p.key = 'hospitality.owner_report'
  where public.mkc_chat_employee_eligible(e.id)
$$;

create or replace function public.mkc_hosp_audit(p_table text, p_record_id uuid, p_action text, p_data jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (table_name, record_id, action, new_data, changed_by)
  values (p_table, p_record_id, p_action, p_data, auth.uid())
$$;

-- Attaches the caller's own, still-unlinked uploads in this conversation.
create or replace function public.mkc_chat_link_attachments(
  p_attachment_ids uuid[], p_conversation_id uuid, p_message_id uuid,
  p_room_task_id uuid, p_issue_id uuid, p_checklist_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_attachment_ids is null or cardinality(p_attachment_ids) = 0 then
    return 0;
  end if;
  update public.mkc_chat_attachments a
     set message_id = coalesce(p_message_id, a.message_id),
         room_task_id = coalesce(p_room_task_id, a.room_task_id),
         issue_id = coalesce(p_issue_id, a.issue_id),
         checklist_id = coalesce(p_checklist_id, a.checklist_id)
   where a.id = any (p_attachment_ids)
     and a.conversation_id = p_conversation_id
     and a.uploaded_by = auth.uid()
     and a.deleted_at is null
     and a.message_id is null and a.checklist_id is null;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(p_attachment_ids) then
    raise exception 'Lampiran tidak valid atau sudah dipakai';
  end if;
  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- Membership sync (idempotent). Eligible = approved/active employee whose
-- division is mapped for the department, or an active explicit assignment
-- (assignment wins). Members that stop qualifying get removed_at, never a
-- hard delete, so history keeps their identity.
-- ----------------------------------------------------------------------------
create or replace function public.mkc_chat_desired_members()
returns table (conversation_id uuid, employee_id uuid, member_role text, source text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (c.id, x.employee_id) c.id, x.employee_id, x.member_role, x.source
  from public.mkc_chat_conversations c
  join public.mkc_chat_departments d on d.id = c.department_id and d.is_active
  join lateral (
    select a.employee_id, a.member_role, 'assignment'::text as source, 0 as prio
    from public.mkc_chat_role_assignments a
    where a.department_id = d.id and a.revoked_at is null
    union all
    select e.id, dr.member_role, 'division', 1
    from public.mkc_chat_division_roles dr
    join public.employees e on e.division_id = dr.division_id
    where dr.department_id = d.id
  ) x on public.mkc_chat_employee_eligible(x.employee_id)
  where c.kind = 'operational_group'
  order by c.id, x.employee_id, x.prio
$$;

create or replace function public.mkc_chat_sync_members()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed integer := 0;
  v_n integer;
begin
  insert into public.mkc_chat_members (conversation_id, employee_id, member_role, source)
  select d.conversation_id, d.employee_id, d.member_role, d.source from public.mkc_chat_desired_members() d
  on conflict (conversation_id, employee_id) do update
    set member_role = excluded.member_role,
        source = excluded.source,
        removed_at = null,
        joined_at = case when mkc_chat_members.removed_at is not null then now() else mkc_chat_members.joined_at end
    where mkc_chat_members.removed_at is not null
       or mkc_chat_members.member_role <> excluded.member_role
       or mkc_chat_members.source <> excluded.source;
  get diagnostics v_n = row_count;
  v_changed := v_changed + v_n;

  update public.mkc_chat_members m set removed_at = now()
  where m.removed_at is null
    and not exists (
      select 1 from public.mkc_chat_desired_members() d where d.conversation_id = m.conversation_id and d.employee_id = m.employee_id
    );
  get diagnostics v_n = row_count;
  v_changed := v_changed + v_n;

  return v_changed;
end;
$$;

-- Keep membership current when an employee is approved, moved, deactivated
-- or deleted. Never blocks the employee write itself.
create or replace function public.mkc_chat_sync_members_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.mkc_chat_sync_members();
  exception when others then
    raise warning 'mkc_chat_sync_members failed: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger mkc_chat_sync_members_on_employees
  after insert or update of division_id, branch_id, approval_status, is_active, employment_status, deleted_at
  on public.employees
  for each statement execute function public.mkc_chat_sync_members_trigger();

create trigger mkc_chat_sync_members_on_assignments
  after insert or update or delete on public.mkc_chat_role_assignments
  for each statement execute function public.mkc_chat_sync_members_trigger();

create trigger mkc_chat_sync_members_on_division_roles
  after insert or update or delete on public.mkc_chat_division_roles
  for each statement execute function public.mkc_chat_sync_members_trigger();

-- ----------------------------------------------------------------------------
-- Attachments: expiry is always computed here, never by the client.
-- ----------------------------------------------------------------------------
create or replace function public.mkc_chat_attachments_set_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  select coalesce((d.settings ->> 'retention_days')::integer, 30) into v_days
  from public.mkc_chat_conversations c join public.mkc_chat_departments d on d.id = c.department_id
  where c.id = new.conversation_id;
  new.uploaded_at := now();
  new.expires_at := new.uploaded_at + make_interval(days => coalesce(v_days, 30));
  return new;
end;
$$;

create trigger mkc_chat_attachments_expiry before insert on public.mkc_chat_attachments
  for each row execute function public.mkc_chat_attachments_set_expiry();

-- Path convention: <conversation_id>/<uploader uid>/<file>. The storage
-- object must already exist and belong to the caller.
create or replace function public.mkc_chat_register_attachment(
  p_conversation_id uuid, p_object_path text, p_evidence_slot text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_obj record;
  v_id uuid;
begin
  if public.mkc_chat_my_role(p_conversation_id) is null then
    raise exception 'Anda bukan anggota grup ini' using errcode = '42501';
  end if;
  if split_part(p_object_path, '/', 1) <> p_conversation_id::text
     or split_part(p_object_path, '/', 2) <> auth.uid()::text then
    raise exception 'Lokasi file tidak valid';
  end if;
  select o.name, o.owner_id, o.metadata into v_obj
  from storage.objects o where o.bucket_id = 'hospitality-evidence' and o.name = p_object_path;
  if not found or v_obj.owner_id is distinct from auth.uid()::text then
    raise exception 'File belum terunggah';
  end if;

  insert into public.mkc_chat_attachments (conversation_id, evidence_slot, object_path, mime_type, size_bytes, uploaded_by, expires_at)
  values (p_conversation_id, p_evidence_slot, p_object_path, v_obj.metadata ->> 'mimetype',
          nullif(v_obj.metadata ->> 'size', '')::bigint, auth.uid(), now())
  returning id into v_id;
  return v_id;
end;
$$;

-- Controlled exception to the 30-day rule: only for evidence tied to an
-- issue, with a reason, capped, by the owner or the Hospitality Manager.
create or replace function public.mkc_chat_set_retention_hold(p_attachment_id uuid, p_until date, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.mkc_chat_attachments%rowtype;
  v_dept uuid;
  v_max integer;
begin
  select * into v_att from public.mkc_chat_attachments where id = p_attachment_id;
  if not found or v_att.deleted_at is not null then
    raise exception 'Lampiran tidak ditemukan atau sudah dihapus';
  end if;
  select department_id into v_dept from public.mkc_chat_conversations where id = v_att.conversation_id;
  if not (public.app_has_permission('hospitality.owner_report')
          or public.mkc_chat_my_role(public.mkc_hosp_group_id(v_dept)) = 'manager') then
    raise exception 'Hanya owner atau Hospitality Manager' using errcode = '42501';
  end if;
  if v_att.issue_id is null then
    raise exception 'Penahanan hanya untuk bukti yang terkait laporan insiden/masalah';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Tulis alasan penahanan (minimal 10 karakter)';
  end if;
  v_max := coalesce((public.mkc_hosp_setting(v_dept, 'max_retention_hold_days'))::text::integer, 180);
  if p_until is null or p_until <= current_date or p_until > current_date + v_max then
    raise exception 'Tanggal penahanan harus di masa depan dan paling lama % hari', v_max;
  end if;

  update public.mkc_chat_attachments
     set retention_hold_until = p_until::timestamptz, retention_hold_reason = trim(p_reason),
         retention_hold_by = auth.uid(), retention_hold_at = now()
   where id = p_attachment_id;
  perform public.mkc_hosp_audit('mkc_chat_attachments', p_attachment_id, 'UPDATE',
    jsonb_build_object('event', 'retention_hold', 'until', p_until, 'reason', trim(p_reason)));
end;
$$;

-- ----------------------------------------------------------------------------
-- Conversation list + reads + text messages
-- ----------------------------------------------------------------------------
create or replace function public.mkc_chat_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.last_at desc nulls last), '[]'::jsonb)
  from (
    select c.id, c.kind, c.name, c.description, d.code as department_code, d.name as department_name,
           public.mkc_chat_my_role(c.id) as my_role,
           (select count(*) from public.mkc_chat_members m where m.conversation_id = c.id and m.removed_at is null) as member_count,
           lm.created_at as last_at, lm.body as last_body, lm.kind as last_kind,
           (select e.full_name from public.employees e where e.id = lm.sender_id) as last_sender,
           (select count(*) from public.mkc_chat_messages x
             where x.conversation_id = c.id and x.sender_id is distinct from auth.uid()
               and x.created_at > coalesce((select r.last_read_at from public.mkc_chat_reads r
                                            where r.conversation_id = c.id and r.employee_id = auth.uid()), '-infinity'::timestamptz)
           ) as unread
    from public.mkc_chat_conversations c
    join public.mkc_chat_departments d on d.id = c.department_id and d.is_active
    left join lateral (
      select * from public.mkc_chat_messages m where m.conversation_id = c.id order by m.created_at desc limit 1
    ) lm on true
    where public.mkc_chat_can_read(c.id)
  ) t
$$;

create or replace function public.mkc_chat_mark_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mkc_chat_can_read(p_conversation_id) then
    raise exception 'Tidak punya akses' using errcode = '42501';
  end if;
  insert into public.mkc_chat_reads (conversation_id, employee_id, last_read_at)
  values (p_conversation_id, auth.uid(), now())
  on conflict (conversation_id, employee_id) do update set last_read_at = now();
end;
$$;

create or replace function public.mkc_chat_send_text(p_conversation_id uuid, p_body text, p_attachment_ids uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_kind text;
begin
  select kind into v_kind from public.mkc_chat_conversations where id = p_conversation_id;
  if v_kind is distinct from 'operational_group' or public.mkc_chat_my_role(p_conversation_id) is null then
    raise exception 'Anda bukan anggota grup ini' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 and coalesce(cardinality(p_attachment_ids), 0) = 0 then
    raise exception 'Pesan kosong';
  end if;
  insert into public.mkc_chat_messages (conversation_id, sender_id, kind, body)
  values (p_conversation_id, auth.uid(), 'text', left(trim(coalesce(p_body, '')), 4000))
  returning id into v_id;
  perform public.mkc_chat_link_attachments(p_attachment_ids, p_conversation_id, v_id, null, null, null);
  perform public.mkc_chat_mark_read(p_conversation_id);
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Room tasks: sync from the villa app's own records (idempotent)
-- ----------------------------------------------------------------------------
create or replace function public.mkc_hosp_sync_room_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept record;
  v_row record;
  v_task_id uuid;
  v_group uuid;
  v_changed integer := 0;
  v_today date;
  v_cleaners uuid[];
begin
  for v_dept in select * from public.mkc_chat_departments where code = 'hospitality' and is_active loop
    v_group := public.mkc_hosp_group_id(v_dept.id);
    v_today := public.mkc_hosp_local_date(v_dept.id);

    -- 1. New: a pending 'bersih' housekeeping row for a unit the villa app
    --    has marked dirty (i.e. after a real checkout).
    for v_row in
      select h.id as hk_id, h.unit_id, coalesce(h.unit_nomor, u.nomor) as unit_nomor, h.created_at
      from public.housekeeping h
      join public.units u on u.id = h.unit_id
      where h.status = 'pending' and h.jenis = 'bersih' and h.tgl <= v_today and u.status = 'dirty'
        and not exists (select 1 from public.mkc_hosp_room_tasks t where t.housekeeping_id = h.id)
    loop
      insert into public.mkc_hosp_room_tasks (department_id, housekeeping_id, unit_id, unit_nomor, target_at)
      values (v_dept.id, v_row.hk_id, v_row.unit_id, v_row.unit_nomor,
              now() + make_interval(mins => coalesce((v_dept.settings ->> 'cleaning_target_minutes')::integer, 180)))
      on conflict (housekeeping_id) do nothing
      returning id into v_task_id;
      if v_task_id is not null then
        v_changed := v_changed + 1;
        perform public.mkc_chat_post(v_group, 'task', format('🧹 Unit %s perlu dibersihkan (setelah check-out)', v_row.unit_nomor),
          'room_task', v_task_id, jsonb_build_object('unit_nomor', v_row.unit_nomor, 'status', 'pending'),
          'task_created:' || v_task_id);
        v_cleaners := public.mkc_hosp_members_with_role(v_dept.id, array['cleaning']);
        perform public.mkc_hosp_notify(v_cleaners, format('Unit %s perlu dibersihkan', v_row.unit_nomor),
          'Tugas kebersihan baru di grup Hospitality Loonars', '/chat?c=' || v_group, 'hospitality_task',
          jsonb_build_object('room_task_id', v_task_id));
      end if;
    end loop;

    -- 2. Closed in the villa Front Desk (housekeeping done) without FO
    --    inspection here: close, but say so.
    for v_row in
      select t.id, t.unit_nomor from public.mkc_hosp_room_tasks t
      join public.housekeeping h on h.id = t.housekeeping_id
      where t.department_id = v_dept.id and t.status not in ('completed', 'cancelled') and h.status = 'done'
    loop
      update public.mkc_hosp_room_tasks
         set status = 'completed', completed_at = now(), completion_source = 'villa_app', conflict_note = null
       where id = v_row.id;
      v_changed := v_changed + 1;
      perform public.mkc_chat_post(v_group, 'system',
        format('⚠️ Unit %s ditandai bersih di Front Desk villa tanpa pemeriksaan FO di sini', v_row.unit_nomor),
        'room_task', v_row.id, jsonb_build_object('completion_source', 'villa_app'), 'task_closed_villa:' || v_row.id);
    end loop;

    -- 3. Open tasks whose villa records no longer line up: flag (and clear
    --    the flag once they line up again), never guess a resolution.
    update public.mkc_hosp_room_tasks t
       set conflict_note = c.note
      from (
        select t2.id,
               case
                 when t2.housekeeping_id is null then 'Tugas housekeeping villa sudah dihapus'
                 when u.id is null then 'Unit tidak ditemukan di sistem villa'
                 when u.status <> 'dirty' then format('Status unit di sistem villa sekarang "%s", bukan "dirty"', u.status)
               end as note
        from public.mkc_hosp_room_tasks t2
        left join public.units u on u.id = t2.unit_id
        where t2.department_id = v_dept.id and t2.status not in ('completed', 'cancelled')
      ) c
     where c.id = t.id and t.conflict_note is distinct from c.note;
  end loop;
  return v_changed;
end;
$$;

-- Caller's role in the hospitality group owning this task; raises if not allowed.
create or replace function public.mkc_hosp_require_role(p_department_id uuid, p_roles text[])
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.mkc_chat_my_role(public.mkc_hosp_group_id(p_department_id));
begin
  if v_role is null or not (v_role = any (p_roles)) then
    raise exception 'Peran Anda di grup tidak diizinkan untuk tindakan ini' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

create or replace function public.mkc_hosp_task_start(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.mkc_hosp_room_tasks%rowtype;
  v_name text;
begin
  select * into v_task from public.mkc_hosp_room_tasks where id = p_task_id for update;
  if not found then raise exception 'Tugas tidak ditemukan'; end if;
  perform public.mkc_hosp_require_role(v_task.department_id, array['cleaning', 'manager']);
  if v_task.status not in ('pending', 'blocked') then
    raise exception 'Tugas tidak bisa dimulai dari status %', v_task.status;
  end if;
  select full_name into v_name from public.employees where id = auth.uid();
  update public.mkc_hosp_room_tasks
     set status = 'in_progress', started_by = auth.uid(), started_at = coalesce(started_at, now()),
         assigned_to = coalesce(assigned_to, auth.uid()), blocked_reason = null
   where id = p_task_id;
  perform public.mkc_chat_post(public.mkc_hosp_group_id(v_task.department_id), 'system',
    format('▶️ %s mulai membersihkan unit %s', v_name, v_task.unit_nomor), 'room_task', p_task_id,
    jsonb_build_object('status', 'in_progress'), format('task_started:%s:%s', p_task_id, v_task.rework_count));
end;
$$;

create or replace function public.mkc_hosp_task_assign(p_task_id uuid, p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.mkc_hosp_room_tasks%rowtype;
  v_group uuid;
  v_target_role text;
  v_name text;
begin
  select * into v_task from public.mkc_hosp_room_tasks where id = p_task_id for update;
  if not found then raise exception 'Tugas tidak ditemukan'; end if;
  perform public.mkc_hosp_require_role(v_task.department_id, array['manager', 'front_office']);
  if v_task.status in ('completed', 'cancelled') then raise exception 'Tugas sudah ditutup'; end if;
  v_group := public.mkc_hosp_group_id(v_task.department_id);
  select member_role into v_target_role from public.mkc_chat_members
   where conversation_id = v_group and employee_id = p_employee_id and removed_at is null;
  if v_target_role is null or v_target_role not in ('cleaning', 'manager') then
    raise exception 'Petugas harus anggota grup dengan peran Cleaning';
  end if;
  select full_name into v_name from public.employees where id = p_employee_id;
  update public.mkc_hosp_room_tasks set assigned_to = p_employee_id where id = p_task_id;
  perform public.mkc_chat_post(v_group, 'system', format('👤 Unit %s ditugaskan ke %s', v_task.unit_nomor, v_name),
    'room_task', p_task_id, jsonb_build_object('assigned_to', p_employee_id), null);
  perform public.mkc_hosp_notify(array[p_employee_id], format('Tugas unit %s untuk Anda', v_task.unit_nomor),
    'Buka grup Hospitality Loonars', '/chat?c=' || v_group, 'hospitality_task', jsonb_build_object('room_task_id', p_task_id));
end;
$$;

create or replace function public.mkc_hosp_task_block(p_task_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.mkc_hosp_room_tasks%rowtype;
  v_name text;
  v_group uuid;
begin
  select * into v_task from public.mkc_hosp_room_tasks where id = p_task_id for update;
  if not found then raise exception 'Tugas tidak ditemukan'; end if;
  perform public.mkc_hosp_require_role(v_task.department_id, array['cleaning', 'manager', 'front_office']);
  if v_task.status not in ('pending', 'in_progress') then raise exception 'Tugas tidak bisa ditandai terkendala dari status %', v_task.status; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Tulis kendalanya'; end if;
  select full_name into v_name from public.employees where id = auth.uid();
  v_group := public.mkc_hosp_group_id(v_task.department_id);
  update public.mkc_hosp_room_tasks set status = 'blocked', blocked_reason = left(trim(p_reason), 500) where id = p_task_id;
  perform public.mkc_chat_post(v_group, 'system', format('⛔ Unit %s terkendala: %s (%s)', v_task.unit_nomor, left(trim(p_reason), 500), v_name),
    'room_task', p_task_id, jsonb_build_object('status', 'blocked'), null);
  perform public.mkc_hosp_notify(public.mkc_hosp_members_with_role(v_task.department_id, array['manager']),
    format('Unit %s terkendala', v_task.unit_nomor), left(trim(p_reason), 200), '/chat?c=' || v_group, 'hospitality_task',
    jsonb_build_object('room_task_id', p_task_id));
end;
$$;

create or replace function public.mkc_hosp_validate_items(p_kind text, p_items jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_keys text[] := public.mkc_hosp_checklist_items(p_kind);
  v_out jsonb := '{}'::jsonb;
  v_k text;
begin
  if v_keys is null then raise exception 'Jenis checklist tidak dikenal'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object' then raise exception 'Checklist tidak valid'; end if;
  foreach v_k in array v_keys loop
    -- coalesce: a MISSING key gives jsonb_typeof(null) = null, and
    -- "null <> 'boolean'" is null, which IF treats as false.
    if coalesce(jsonb_typeof(p_items -> v_k), 'missing') <> 'boolean' then
      raise exception 'Poin checklist "%" belum diisi', v_k;
    end if;
    v_out := v_out || jsonb_build_object(v_k, (p_items ->> v_k)::boolean);
  end loop;
  return v_out;
end;
$$;

create or replace function public.mkc_hosp_task_submit_cleaning(
  p_task_id uuid, p_items jsonb, p_notes text, p_attachment_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.mkc_hosp_room_tasks%rowtype;
  v_items jsonb;
  v_group uuid;
  v_checklist uuid;
  v_msg uuid;
  v_name text;
  v_all boolean;
begin
  select * into v_task from public.mkc_hosp_room_tasks where id = p_task_id for update;
  if not found then raise exception 'Tugas tidak ditemukan'; end if;
  perform public.mkc_hosp_require_role(v_task.department_id, array['cleaning', 'manager']);
  if v_task.status <> 'in_progress' then raise exception 'Mulai tugas dulu sebelum mengirim checklist'; end if;
  v_items := public.mkc_hosp_validate_items('cleaning', p_items);
  select bool_and(value::boolean) into v_all from jsonb_each_text(v_items);
  if not v_all then
    raise exception 'Semua poin kebersihan harus selesai. Jika ada kendala, tandai tugas "Terkendala".';
  end if;
  if coalesce((public.mkc_hosp_setting(v_task.department_id, 'cleaning_photos_required'))::text::boolean, false)
     and coalesce(cardinality(p_attachment_ids), 0) = 0 then
    raise exception 'Foto hasil kebersihan wajib dilampirkan';
  end if;

  v_group := public.mkc_hosp_group_id(v_task.department_id);
  select full_name into v_name from public.employees where id = auth.uid();

  insert into public.mkc_hosp_checklists (department_id, conversation_id, kind, room_task_id, unit_id, unit_nomor,
    submitted_by, report_date, items, notes, result)
  values (v_task.department_id, v_group, 'cleaning', p_task_id, v_task.unit_id, v_task.unit_nomor,
    auth.uid(), public.mkc_hosp_local_date(v_task.department_id), v_items, nullif(trim(coalesce(p_notes, '')), ''), 'pass')
  returning id into v_checklist;

  v_msg := public.mkc_chat_post(v_group, 'checklist', format('✅ %s selesai membersihkan unit %s — menunggu pemeriksaan FO', v_name, v_task.unit_nomor),
    'checklist', v_checklist, jsonb_build_object('kind', 'cleaning', 'unit_nomor', v_task.unit_nomor), null, auth.uid());
  update public.mkc_hosp_checklists set message_id = v_msg where id = v_checklist;
  perform public.mkc_chat_link_attachments(p_attachment_ids, v_group, v_msg, p_task_id, null, v_checklist);

  update public.mkc_hosp_room_tasks
     set status = 'awaiting_inspection', submitted_by = auth.uid(), submitted_at = now(),
         target_at = now() + make_interval(mins => coalesce((public.mkc_hosp_setting(v_task.department_id, 'inspection_target_minutes'))::text::integer, 60))
   where id = p_task_id;

  perform public.mkc_hosp_notify(public.mkc_hosp_members_with_role(v_task.department_id, array['front_office']),
    format('Unit %s siap diperiksa', v_task.unit_nomor), 'Cleaning sudah selesai — lakukan pemeriksaan kamar',
    '/chat?c=' || v_group, 'hospitality_task', jsonb_build_object('room_task_id', p_task_id));
  return v_checklist;
end;
$$;

-- FO inspection. 'ready' releases the room in the villa app (see header);
-- anything else keeps it unsellable.
create or replace function public.mkc_hosp_fo_inspect(
  p_task_id uuid, p_items jsonb, p_notes text, p_decision text, p_attachment_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.mkc_hosp_room_tasks%rowtype;
  v_items jsonb;
  v_all boolean;
  v_group uuid;
  v_checklist uuid;
  v_msg uuid;
  v_name text;
  v_slots text[];
  v_missing text[];
  v_hk record;
  v_issue uuid;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  select * into v_task from public.mkc_hosp_room_tasks where id = p_task_id for update;
  if not found then raise exception 'Tugas tidak ditemukan'; end if;
  perform public.mkc_hosp_require_role(v_task.department_id, array['front_office', 'manager']);
  if v_task.status <> 'awaiting_inspection' then
    raise exception 'Unit belum diserahkan Cleaning untuk diperiksa';
  end if;
  if coalesce(p_decision, '') not in ('ready', 'needs_recleaning', 'needs_maintenance') then
    raise exception 'Keputusan tidak valid';
  end if;
  v_items := public.mkc_hosp_validate_items('fo_inspection', p_items);
  select bool_and(value::boolean) into v_all from jsonb_each_text(v_items);
  if p_decision = 'ready' and not v_all then
    raise exception 'Kamar hanya bisa dinyatakan siap jika semua poin pemeriksaan baik';
  end if;
  if p_decision <> 'ready' and v_notes is null then
    raise exception 'Tulis masalah yang ditemukan';
  end if;

  v_group := public.mkc_hosp_group_id(v_task.department_id);

  -- Required photos per slot (bed / bathroom / main_room by default).
  if p_decision = 'ready' and coalesce((public.mkc_hosp_setting(v_task.department_id, 'inspection_photos_required'))::text::boolean, true) then
    select array(select jsonb_array_elements_text(coalesce(public.mkc_hosp_setting(v_task.department_id, 'inspection_photo_slots'), '[]'::jsonb)))
      into v_slots;
    select array(
      select s from unnest(v_slots) s
      where not exists (
        select 1 from public.mkc_chat_attachments a
        where a.id = any (coalesce(p_attachment_ids, '{}')) and a.evidence_slot = s
          and a.uploaded_by = auth.uid() and a.conversation_id = v_group and a.deleted_at is null
      )
    ) into v_missing;
    if cardinality(v_missing) > 0 then
      raise exception 'Foto wajib belum lengkap: %', array_to_string(v_missing, ', ');
    end if;
  end if;

  select full_name into v_name from public.employees where id = auth.uid();

  insert into public.mkc_hosp_checklists (department_id, conversation_id, kind, room_task_id, unit_id, unit_nomor,
    submitted_by, report_date, items, notes, result, decision)
  values (v_task.department_id, v_group, 'fo_inspection', p_task_id, v_task.unit_id, v_task.unit_nomor,
    auth.uid(), public.mkc_hosp_local_date(v_task.department_id), v_items, v_notes,
    case when p_decision = 'ready' then 'pass' else 'fail' end, p_decision)
  returning id into v_checklist;

  if p_decision = 'ready' then
    -- Same transition as villa-api PATCH /housekeeping/done (jenis 'bersih'),
    -- guarded so it can only move a still-pending task on a still-dirty unit.
    select h.id, h.status, u.status as unit_status into v_hk
    from public.housekeeping h join public.units u on u.id = h.unit_id
    where h.id = v_task.housekeeping_id for update of h, u;
    if not found then
      raise exception 'Data housekeeping/unit di sistem villa tidak ditemukan — cek Front Desk villa';
    end if;
    if v_hk.status <> 'pending' then
      raise exception 'Tugas ini sudah ditandai selesai di Front Desk villa';
    end if;
    if v_hk.unit_status <> 'dirty' then
      raise exception 'Status unit di sistem villa sekarang "%", bukan "dirty" — tidak diubah', v_hk.unit_status;
    end if;
    update public.housekeeping set status = 'done', done_at = now(), done_by = v_name where id = v_task.housekeeping_id;
    update public.units set status = 'available' where id = v_task.unit_id and status = 'dirty';

    update public.mkc_hosp_room_tasks
       set status = 'completed', inspected_by = auth.uid(), inspected_at = now(), completed_at = now(),
           completion_source = 'fo_verified', conflict_note = null
     where id = p_task_id;
    v_msg := public.mkc_chat_post(v_group, 'room_readiness',
      format('🟢 Unit %s SIAP DIJUAL — diperiksa %s', v_task.unit_nomor, v_name),
      'checklist', v_checklist, jsonb_build_object('kind', 'fo_inspection', 'decision', 'ready', 'unit_nomor', v_task.unit_nomor),
      'room_ready:' || p_task_id, auth.uid());
  elsif p_decision = 'needs_recleaning' then
    update public.mkc_hosp_room_tasks
       set status = 'pending', inspected_by = auth.uid(), inspected_at = now(), rework_count = rework_count + 1,
           submitted_at = null, started_at = null,
           target_at = now() + make_interval(mins => coalesce((public.mkc_hosp_setting(v_task.department_id, 'cleaning_target_minutes'))::text::integer, 180))
     where id = p_task_id;
    v_msg := public.mkc_chat_post(v_group, 'room_readiness',
      format('🔁 Unit %s perlu dibersihkan ulang: %s (%s)', v_task.unit_nomor, v_notes, v_name),
      'checklist', v_checklist, jsonb_build_object('kind', 'fo_inspection', 'decision', p_decision, 'unit_nomor', v_task.unit_nomor),
      null, auth.uid());
    perform public.mkc_hosp_notify(
      array_cat(coalesce(array[v_task.assigned_to], '{}'), public.mkc_hosp_members_with_role(v_task.department_id, array['manager'])),
      format('Unit %s perlu dibersihkan ulang', v_task.unit_nomor), left(v_notes, 200), '/chat?c=' || v_group,
      'hospitality_task', jsonb_build_object('room_task_id', p_task_id));
  else
    update public.mkc_hosp_room_tasks
       set status = 'blocked', inspected_by = auth.uid(), inspected_at = now(), blocked_reason = left(v_notes, 500)
     where id = p_task_id;
    insert into public.mkc_hosp_issues (department_id, conversation_id, category, severity, unit_id, unit_nomor,
      title, description, reporter_id, room_task_id, source_checklist_id, target_at)
    values (v_task.department_id, v_group, 'room', 'high', v_task.unit_id, v_task.unit_nomor,
      format('Unit %s butuh perbaikan', v_task.unit_nomor), v_notes, auth.uid(), p_task_id, v_checklist,
      now() + make_interval(hours => coalesce((public.mkc_hosp_setting(v_task.department_id, 'issue_target_hours') ->> 'high')::integer, 8)))
    returning id into v_issue;
    insert into public.mkc_hosp_issue_events (issue_id, actor_id, event, to_status, note)
    values (v_issue, auth.uid(), 'created', 'open', 'Dari pemeriksaan FO');
    v_msg := public.mkc_chat_post(v_group, 'room_readiness',
      format('🛠️ Unit %s TIDAK SIAP — perlu perbaikan: %s (%s). Tutup kamar lewat menu Kamar Maintenance di sistem villa bila perlu.', v_task.unit_nomor, v_notes, v_name),
      'checklist', v_checklist, jsonb_build_object('kind', 'fo_inspection', 'decision', p_decision, 'unit_nomor', v_task.unit_nomor, 'issue_id', v_issue),
      null, auth.uid());
    perform public.mkc_hosp_notify(public.mkc_hosp_members_with_role(v_task.department_id, array['manager']),
      format('Unit %s butuh perbaikan', v_task.unit_nomor), left(v_notes, 200), '/chat?c=' || v_group,
      'hospitality_task', jsonb_build_object('issue_id', v_issue));
  end if;

  update public.mkc_hosp_checklists set message_id = v_msg where id = v_checklist;
  perform public.mkc_chat_link_attachments(p_attachment_ids, v_group, v_msg, p_task_id, v_issue, v_checklist);
  return jsonb_build_object('checklist_id', v_checklist, 'issue_id', v_issue, 'decision', p_decision);
end;
$$;

-- ----------------------------------------------------------------------------
-- Issues / incidents
-- ----------------------------------------------------------------------------
create or replace function public.mkc_hosp_issue_create(
  p_department_code text, p_category text, p_severity text, p_title text, p_description text,
  p_unit_id uuid default null, p_location text default null, p_occurred_at timestamptz default null,
  p_action_taken text default null, p_attachment_ids uuid[] default '{}', p_assigned_to uuid default null,
  p_source_checklist_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype;
  v_group uuid;
  v_issue public.mkc_hosp_issues%rowtype;
  v_unit_nomor text;
  v_msg uuid;
  v_name text;
  v_alert boolean;
  v_recipients uuid[];
begin
  select * into v_dept from public.mkc_chat_departments where code = p_department_code and is_active;
  if not found then raise exception 'Departemen tidak ditemukan'; end if;
  perform public.mkc_hosp_require_role(v_dept.id, array['manager', 'front_office', 'cleaning', 'security']);
  v_group := public.mkc_hosp_group_id(v_dept.id);
  if p_unit_id is not null then
    select nomor into v_unit_nomor from public.units where id = p_unit_id;
    if v_unit_nomor is null then raise exception 'Unit tidak ditemukan'; end if;
  end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.mkc_chat_members where conversation_id = v_group and employee_id = p_assigned_to and removed_at is null
  ) then
    raise exception 'Penanggung jawab harus anggota grup';
  end if;
  select full_name into v_name from public.employees where id = auth.uid();

  insert into public.mkc_hosp_issues (department_id, conversation_id, category, severity, unit_id, unit_nomor, location,
    title, description, occurred_at, action_taken, reporter_id, assigned_to, source_checklist_id, target_at)
  values (v_dept.id, v_group, p_category, p_severity, p_unit_id, v_unit_nomor, nullif(trim(coalesce(p_location, '')), ''),
    trim(p_title), trim(p_description), coalesce(p_occurred_at, now()), nullif(trim(coalesce(p_action_taken, '')), ''),
    auth.uid(), p_assigned_to, p_source_checklist_id,
    now() + make_interval(hours => coalesce((v_dept.settings -> 'issue_target_hours' ->> p_severity)::integer, 24)))
  returning * into v_issue;

  insert into public.mkc_hosp_issue_events (issue_id, actor_id, event, to_status, note)
  values (v_issue.id, auth.uid(), 'created', 'open', null);

  v_msg := public.mkc_chat_post(v_group, 'incident',
    format('%s %s · %s%s — %s', case p_severity when 'critical' then '🚨' when 'high' then '🔴' when 'medium' then '🟠' else '🟡' end,
      v_issue.code, v_issue.title, coalesce(' (unit ' || v_unit_nomor || ')', ''), v_name),
    'issue', v_issue.id, jsonb_build_object('severity', p_severity, 'category', p_category, 'code', v_issue.code),
    'issue_created:' || v_issue.id, auth.uid());
  perform public.mkc_chat_link_attachments(p_attachment_ids, v_group, v_msg, null, v_issue.id, null);

  if p_assigned_to is not null then
    perform public.mkc_hosp_notify(array[p_assigned_to], format('%s ditugaskan ke Anda', v_issue.code), v_issue.title,
      '/chat?c=' || v_group, 'hospitality_task', jsonb_build_object('issue_id', v_issue.id));
  end if;

  -- Immediate escalation: does not wait for the next scheduled report.
  v_alert := coalesce(v_dept.settings -> 'alert_severities', '["critical"]'::jsonb) ? p_severity;
  if v_alert then
    v_recipients := array_cat(public.mkc_hosp_members_with_role(v_dept.id, array['manager']), public.mkc_hosp_owner_ids());
    perform public.mkc_hosp_notify(v_recipients,
      format('🚨 %s: %s', v_issue.code, v_issue.title),
      left(format('%s%s. Dilaporkan %s.', coalesce('Unit ' || v_unit_nomor || '. ', ''), v_issue.description, v_name), 300),
      '/chat?c=' || public.mkc_hosp_feed_id(v_dept.id), 'hospitality_critical_alert', jsonb_build_object('issue_id', v_issue.id));
    perform public.mkc_chat_post(public.mkc_hosp_feed_id(v_dept.id), 'alert',
      format('🚨 Insiden %s: %s%s', p_severity, v_issue.title, coalesce(' (unit ' || v_unit_nomor || ')', '')),
      'issue', v_issue.id, jsonb_build_object('severity', p_severity, 'code', v_issue.code), 'alert_issue:' || v_issue.id);
    update public.mkc_hosp_issues set escalated_at = now() where id = v_issue.id;
    insert into public.mkc_hosp_issue_events (issue_id, actor_id, event, note)
    values (v_issue.id, auth.uid(), 'escalated', 'Diteruskan langsung ke Hospitality Manager dan owner');
  end if;

  perform public.mkc_hosp_audit('mkc_hosp_issues', v_issue.id, 'INSERT',
    jsonb_build_object('event', 'issue_created', 'severity', p_severity, 'category', p_category));
  return v_issue.id;
end;
$$;

-- p_action: assign | start | resolve | cancel | note
create or replace function public.mkc_hosp_issue_update(p_issue_id uuid, p_action text, p_assignee uuid default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue public.mkc_hosp_issues%rowtype;
  v_role text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_name text;
  v_new_status text;
  v_text text;
begin
  select * into v_issue from public.mkc_hosp_issues where id = p_issue_id for update;
  if not found then raise exception 'Masalah tidak ditemukan'; end if;
  v_role := public.mkc_hosp_require_role(v_issue.department_id, array['manager', 'front_office', 'cleaning', 'security']);
  if v_issue.status in ('resolved', 'cancelled') and p_action <> 'note' then
    raise exception 'Masalah ini sudah ditutup';
  end if;
  select full_name into v_name from public.employees where id = auth.uid();

  if p_action = 'assign' then
    if v_role not in ('manager', 'front_office') then raise exception 'Hanya Hospitality Manager atau FO yang menugaskan' using errcode = '42501'; end if;
    if not exists (select 1 from public.mkc_chat_members where conversation_id = v_issue.conversation_id and employee_id = p_assignee and removed_at is null) then
      raise exception 'Penanggung jawab harus anggota grup';
    end if;
    update public.mkc_hosp_issues set assigned_to = p_assignee where id = p_issue_id;
    insert into public.mkc_hosp_issue_events (issue_id, actor_id, event, note) values (p_issue_id, auth.uid(), 'assigned', v_note);
    v_text := format('👤 %s ditugaskan ke %s', v_issue.code, (select full_name from public.employees where id = p_assignee));
    perform public.mkc_hosp_notify(array[p_assignee], format('%s ditugaskan ke Anda', v_issue.code), v_issue.title,
      '/chat?c=' || v_issue.conversation_id, 'hospitality_task', jsonb_build_object('issue_id', p_issue_id));
  elsif p_action = 'start' then
    if not (v_role = 'manager' or v_issue.assigned_to is null or v_issue.assigned_to is not distinct from auth.uid()) then
      raise exception 'Hanya penanggung jawab atau Hospitality Manager' using errcode = '42501';
    end if;
    v_new_status := 'in_progress';
    update public.mkc_hosp_issues set status = 'in_progress', assigned_to = coalesce(assigned_to, auth.uid()) where id = p_issue_id;
    v_text := format('🔧 %s sedang ditangani %s', v_issue.code, v_name);
  elsif p_action = 'resolve' then
    -- "is not distinct from": with no assignee, "=" would be null and let anyone through.
    if not (v_role = 'manager' or (v_issue.assigned_to is not null and v_issue.assigned_to is not distinct from auth.uid())) then
      raise exception 'Hanya penanggung jawab atau Hospitality Manager yang menyelesaikan' using errcode = '42501';
    end if;
    if v_note is null then raise exception 'Tulis catatan penyelesaian'; end if;
    v_new_status := 'resolved';
    update public.mkc_hosp_issues set status = 'resolved', resolution_notes = v_note, resolved_by = auth.uid(), resolved_at = now() where id = p_issue_id;
    v_text := format('✅ %s selesai: %s (%s)', v_issue.code, v_note, v_name);
  elsif p_action = 'cancel' then
    if v_role <> 'manager' then raise exception 'Hanya Hospitality Manager yang dapat membatalkan' using errcode = '42501'; end if;
    if v_note is null or length(v_note) < 5 then raise exception 'Tulis alasan pembatalan'; end if;
    v_new_status := 'cancelled';
    update public.mkc_hosp_issues set status = 'cancelled', cancel_reason = v_note, cancelled_by = auth.uid(), cancelled_at = now() where id = p_issue_id;
    v_text := format('🚫 %s dibatalkan: %s (%s)', v_issue.code, v_note, v_name);
  elsif p_action = 'note' then
    if v_note is null then raise exception 'Catatan kosong'; end if;
    insert into public.mkc_hosp_issue_events (issue_id, actor_id, event, note) values (p_issue_id, auth.uid(), 'note', v_note);
    v_text := format('📝 %s: %s (%s)', v_issue.code, v_note, v_name);
  else
    raise exception 'Tindakan tidak dikenal';
  end if;

  if v_new_status is not null then
    insert into public.mkc_hosp_issue_events (issue_id, actor_id, event, from_status, to_status, note)
    values (p_issue_id, auth.uid(), 'status_changed', v_issue.status, v_new_status, v_note);
    perform public.mkc_hosp_audit('mkc_hosp_issues', p_issue_id, 'UPDATE',
      jsonb_build_object('event', 'status_changed', 'from', v_issue.status, 'to', v_new_status, 'note', v_note));
  end if;
  perform public.mkc_chat_post(v_issue.conversation_id, 'system', v_text, 'issue', p_issue_id,
    jsonb_build_object('action', p_action, 'status', coalesce(v_new_status, v_issue.status)), null);
  -- Closing a critical incident is owner-relevant too.
  if v_new_status in ('resolved', 'cancelled') and v_issue.escalated_at is not null then
    perform public.mkc_chat_post(public.mkc_hosp_feed_id(v_issue.department_id), 'alert', v_text, 'issue', p_issue_id,
      jsonb_build_object('status', v_new_status), 'alert_issue_closed:' || p_issue_id);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Security reports (routine checkboxes; detail only when something is wrong)
-- ----------------------------------------------------------------------------
create or replace function public.mkc_hosp_submit_security(
  p_department_code text, p_kind text, p_items jsonb, p_notes text, p_details jsonb default '{}',
  p_unit_id uuid default null, p_severity text default 'medium', p_attachment_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype;
  v_group uuid;
  v_items jsonb;
  v_all boolean;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_checklist uuid;
  v_msg uuid;
  v_name text;
  v_issue uuid;
  v_unit_nomor text;
  v_details jsonb := '{}'::jsonb;
  v_label text;
begin
  if coalesce(p_kind, '') not in ('security_shift_start', 'security_late_checkin', 'security_patrol', 'security_shift_end') then
    raise exception 'Jenis laporan tidak dikenal';
  end if;
  select * into v_dept from public.mkc_chat_departments where code = p_department_code and is_active;
  if not found then raise exception 'Departemen tidak ditemukan'; end if;
  perform public.mkc_hosp_require_role(v_dept.id, case when p_kind = 'security_late_checkin'
    then array['security', 'front_office', 'manager'] else array['security', 'manager'] end);
  v_group := public.mkc_hosp_group_id(v_dept.id);
  v_items := public.mkc_hosp_validate_items(p_kind, p_items);
  select bool_and(value::boolean) into v_all from jsonb_each_text(v_items);
  if not v_all and v_notes is null then
    raise exception 'Ada poin yang tidak baik — tulis keterangannya';
  end if;
  if p_unit_id is not null then
    select nomor into v_unit_nomor from public.units where id = p_unit_id;
  end if;
  if p_kind = 'security_late_checkin' then
    if v_unit_nomor is null then raise exception 'Pilih unit'; end if;
    -- Only non-identifying operational facts; guest identity stays in the villa app.
    v_details := jsonb_build_object('arrival_time', left(coalesce(p_details ->> 'arrival_time', ''), 5));
  end if;
  select full_name into v_name from public.employees where id = auth.uid();
  v_label := case p_kind
    when 'security_shift_start' then 'Cek awal shift'
    when 'security_late_checkin' then 'Bantuan check-in malam'
    when 'security_patrol' then 'Patroli'
    else 'Serah terima akhir shift' end;

  insert into public.mkc_hosp_checklists (department_id, conversation_id, kind, unit_id, unit_nomor, submitted_by,
    report_date, items, notes, result, details)
  values (v_dept.id, v_group, p_kind, p_unit_id, v_unit_nomor, auth.uid(), public.mkc_hosp_local_date(v_dept.id),
    v_items, v_notes, case when v_all then 'ok' else 'issue' end, v_details)
  returning id into v_checklist;

  v_msg := public.mkc_chat_post(v_group, 'work_report',
    format('%s %s%s — %s', case when v_all then '🛡️' else '⚠️' end, v_label, coalesce(' (unit ' || v_unit_nomor || ')', ''), v_name),
    'checklist', v_checklist, jsonb_build_object('kind', p_kind, 'result', case when v_all then 'ok' else 'issue' end),
    null, auth.uid());
  update public.mkc_hosp_checklists set message_id = v_msg where id = v_checklist;
  perform public.mkc_chat_link_attachments(p_attachment_ids, v_group, v_msg, null, null, v_checklist);

  -- A problem never stays only inside a checklist: it becomes a tracked issue.
  if not v_all then
    v_issue := public.mkc_hosp_issue_create(p_department_code, 'security',
      coalesce(nullif(p_severity, ''), 'medium'), format('%s: ada masalah', v_label), v_notes, p_unit_id, null, now(),
      null, '{}', null, v_checklist);
  end if;
  return jsonb_build_object('checklist_id', v_checklist, 'issue_id', v_issue);
end;
$$;

-- ----------------------------------------------------------------------------
-- Room picker / overview for forms: unit number + status only, no guests.
-- ----------------------------------------------------------------------------
create or replace function public.mkc_hosp_units(p_department_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dept uuid;
begin
  select id into v_dept from public.mkc_chat_departments where code = p_department_code;
  if v_dept is null or not public.mkc_hosp_can_view_department(v_dept) then
    raise exception 'Tidak punya akses' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nomor', u.nomor, 'status', u.status) order by u.nomor) from public.units u), '[]'::jsonb);
end;
$$;

-- Names behind sender / assignee ids. employees_select only lets staff read
-- their own row, so this exposes exactly: id, full name and group role of
-- people who are or were in the department group (+ report owners). Nothing else.
create or replace function public.mkc_hosp_people(p_department_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dept uuid;
begin
  select id into v_dept from public.mkc_chat_departments where code = p_department_code;
  if v_dept is null or not public.mkc_hosp_can_view_department(v_dept) then
    raise exception 'Tidak punya akses' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.full_name, 'role', x.member_role, 'active', x.active) order by e.full_name)
    from (
      select m.employee_id, m.member_role, (m.removed_at is null and public.mkc_chat_employee_eligible(m.employee_id)) as active
      from public.mkc_chat_members m
      join public.mkc_chat_conversations c on c.id = m.conversation_id
      where c.department_id = v_dept
      union
      select o, null, true from unnest(public.mkc_hosp_owner_ids()) o
    ) x
    join public.employees e on e.id = x.employee_id
  ), '[]'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- Reports (generation itself runs server-side with the service role; see
-- app/api/hospitality/reports/dispatch). These RPCs make it idempotent.
-- ----------------------------------------------------------------------------
-- Claims a period. Returns the report id to fill, or null when that period
-- already succeeded / is being generated right now.
create or replace function public.mkc_hosp_report_begin(p_department_id uuid, p_report_date date, p_period_kind text, p_generated_by uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.mkc_hosp_reports%rowtype;
begin
  if p_period_kind = 'manual' then
    insert into public.mkc_hosp_reports (department_id, period_kind, report_date, status, attempts, started_at, generated_by)
    values (p_department_id, 'manual', p_report_date, 'generating', 1, now(), p_generated_by)
    returning * into v_row;
    return v_row.id;
  end if;

  insert into public.mkc_hosp_reports (department_id, period_kind, report_date, status, attempts, started_at)
  values (p_department_id, p_period_kind, p_report_date, 'generating', 1, now())
  on conflict (department_id, report_date, period_kind) where period_kind <> 'manual' do nothing
  returning * into v_row;
  if v_row.id is not null then return v_row.id; end if;

  -- Existing row: retry only a failure (max 3 attempts) or a stuck run.
  update public.mkc_hosp_reports
     set status = 'generating', attempts = attempts + 1, started_at = now(), error = null
   where department_id = p_department_id and report_date = p_report_date and period_kind = p_period_kind
     and ((status = 'failed' and attempts < 3 and started_at < now() - interval '10 minutes')
          or (status = 'generating' and started_at < now() - interval '15 minutes'))
  returning * into v_row;
  return v_row.id;
end;
$$;

-- Read-only snapshot of the villa app's authoritative records for one report
-- window. Every section is independent: a failing source comes back as
-- { ok: false, error } and is shown as unavailable -- never as zero.
-- Only unit numbers / statuses / timestamps; no guest data.
create or replace function public.mkc_hosp_report_villa_snapshot(p_from timestamptz, p_to timestamptz, p_local_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
begin
  begin
    v := v || jsonb_build_object('units', jsonb_build_object('ok', true, 'fetched_at', now(), 'data',
      coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nomor', u.nomor, 'status', u.status) order by u.nomor) from public.units u), '[]'::jsonb)));
  exception when others then
    v := v || jsonb_build_object('units', jsonb_build_object('ok', false, 'error', sqlerrm));
  end;

  begin
    v := v || jsonb_build_object('maintenance', jsonb_build_object('ok', true, 'fetched_at', now(), 'data',
      coalesce((select jsonb_agg(jsonb_build_object('unit_id', m.unit_id, 'from', m.tutup_mulai, 'to', m.tutup_sampai, 'reason', m.alasan))
                from public.villa_room_maintenance m where m.tutup_mulai <= p_local_date and m.tutup_sampai >= p_local_date), '[]'::jsonb)));
  exception when others then
    v := v || jsonb_build_object('maintenance', jsonb_build_object('ok', false, 'error', sqlerrm));
  end;

  begin
    v := v || jsonb_build_object('bookings', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', jsonb_build_object(
      'in_house_unit_ids', coalesce((select jsonb_agg(distinct b.unit_id) from public.bookings b where b.status = 'checkin' and b.unit_id is not null), '[]'::jsonb),
      'checkins', coalesce((select jsonb_agg(coalesce(b.unit_nomor, '?')) from public.bookings b
                            where b.checkin_at >= p_from and b.checkin_at < p_to and b.status <> 'batal'), '[]'::jsonb),
      'checkouts', coalesce((select jsonb_agg(coalesce(b.unit_nomor, '?')) from public.bookings b
                             where b.checkout_at >= p_from and b.checkout_at < p_to and b.status <> 'batal'), '[]'::jsonb)
    )));
  exception when others then
    v := v || jsonb_build_object('bookings', jsonb_build_object('ok', false, 'error', sqlerrm));
  end;

  -- Freshness of the sync jobs the numbers depend on.
  begin
    v := v || jsonb_build_object('jobs', jsonb_build_object('ok', true, 'fetched_at', now(), 'data',
      coalesce((select jsonb_object_agg(j.jobname, jsonb_build_object('last_run', r.start_time, 'status', r.status))
                from cron.job j
                left join lateral (select d.start_time, d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) r on true
                where j.jobname in ('villa-sync-cloudbeds-reservations', 'hospitality-sync-room-tasks', 'villa-auto-checkout')), '{}'::jsonb)));
  exception when others then
    v := v || jsonb_build_object('jobs', jsonb_build_object('ok', false, 'error', sqlerrm));
  end;

  return v;
end;
$$;

create or replace function public.mkc_hosp_report_finish(p_report_id uuid, p_data jsonb, p_sources jsonb, p_summary text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.mkc_hosp_reports%rowtype;
  v_msg uuid;
begin
  select * into v_rep from public.mkc_hosp_reports where id = p_report_id for update;
  if not found then raise exception 'Laporan tidak ditemukan'; end if;
  if v_rep.status = 'success' then return v_rep.message_id; end if;
  v_msg := public.mkc_chat_post(public.mkc_hosp_feed_id(v_rep.department_id), 'report_card', p_summary, 'report', p_report_id,
    jsonb_build_object('period_kind', v_rep.period_kind, 'report_date', v_rep.report_date), 'report:' || p_report_id);
  update public.mkc_hosp_reports
     set status = 'success', data = p_data, sources = p_sources, generated_at = now(), message_id = v_msg, error = null
   where id = p_report_id;
  perform public.mkc_hosp_notify(public.mkc_hosp_owner_ids(), 'Laporan Hospitality', left(p_summary, 200),
    '/chat?c=' || public.mkc_hosp_feed_id(v_rep.department_id), 'hospitality_report', jsonb_build_object('report_id', p_report_id));
  return v_msg;
end;
$$;

create or replace function public.mkc_hosp_report_fail(p_report_id uuid, p_error text, p_sources jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.mkc_hosp_reports%rowtype;
begin
  update public.mkc_hosp_reports set status = 'failed', error = left(p_error, 1000), sources = coalesce(p_sources, sources)
   where id = p_report_id and status <> 'success'
  returning * into v_rep;
  if v_rep.id is null then return; end if;
  -- A missing report must be visible, never silent.
  perform public.mkc_chat_post(public.mkc_hosp_feed_id(v_rep.department_id), 'alert',
    format('⚠️ Laporan %s %s gagal dibuat (percobaan %s): %s', v_rep.period_kind, to_char(v_rep.report_date, 'DD-MM-YYYY'), v_rep.attempts, left(p_error, 300)),
    'report', p_report_id, jsonb_build_object('status', 'failed'), format('report_failed:%s:%s', p_report_id, v_rep.attempts));
end;
$$;

create or replace function public.mkc_hosp_report_acknowledge(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('hospitality.owner_report') then
    raise exception 'Hanya owner' using errcode = '42501';
  end if;
  update public.mkc_hosp_reports set acknowledged_by = auth.uid(), acknowledged_at = now()
   where id = p_report_id and status = 'success' and acknowledged_at is null;
  if found then
    perform public.mkc_hosp_audit('mkc_hosp_reports', p_report_id, 'UPDATE', jsonb_build_object('event', 'acknowledged'));
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.mkc_chat_departments enable row level security;
alter table public.mkc_chat_conversations enable row level security;
alter table public.mkc_chat_division_roles enable row level security;
alter table public.mkc_chat_role_assignments enable row level security;
alter table public.mkc_chat_members enable row level security;
alter table public.mkc_chat_messages enable row level security;
alter table public.mkc_chat_reads enable row level security;
alter table public.mkc_chat_attachments enable row level security;
alter table public.mkc_chat_retention_runs enable row level security;
alter table public.mkc_hosp_room_tasks enable row level security;
alter table public.mkc_hosp_checklists enable row level security;
alter table public.mkc_hosp_issues enable row level security;
alter table public.mkc_hosp_issue_events enable row level security;
alter table public.mkc_hosp_reports enable row level security;

-- All writes go through the security-definer functions above (or the
-- service role); there are deliberately NO insert/update/delete policies.
create policy mkc_chat_departments_select on public.mkc_chat_departments for select
  using (public.mkc_hosp_can_view_department(id));
create policy mkc_chat_conversations_select on public.mkc_chat_conversations for select
  using (public.mkc_chat_can_read(id));
create policy mkc_chat_members_select on public.mkc_chat_members for select
  using (public.mkc_chat_can_read(conversation_id)
         or public.mkc_hosp_can_view_department((select c.department_id from public.mkc_chat_conversations c where c.id = conversation_id)));
create policy mkc_chat_role_assignments_select on public.mkc_chat_role_assignments for select
  using (public.mkc_hosp_can_view_department(department_id));
create policy mkc_chat_division_roles_select on public.mkc_chat_division_roles for select
  using (public.mkc_hosp_can_view_department(department_id));
create policy mkc_chat_messages_select on public.mkc_chat_messages for select
  using (public.mkc_chat_can_read(conversation_id));
create policy mkc_chat_reads_select on public.mkc_chat_reads for select
  using (employee_id = auth.uid());
create policy mkc_chat_attachments_select on public.mkc_chat_attachments for select
  using (public.mkc_chat_can_read(conversation_id)
         or public.mkc_hosp_can_view_department((select c.department_id from public.mkc_chat_conversations c where c.id = conversation_id)));
create policy mkc_hosp_room_tasks_select on public.mkc_hosp_room_tasks for select
  using (public.mkc_hosp_can_view_department(department_id));
create policy mkc_hosp_checklists_select on public.mkc_hosp_checklists for select
  using (public.mkc_hosp_can_view_department(department_id));
create policy mkc_hosp_issues_select on public.mkc_hosp_issues for select
  using (public.mkc_hosp_can_view_department(department_id));
create policy mkc_hosp_issue_events_select on public.mkc_hosp_issue_events for select
  using (exists (select 1 from public.mkc_hosp_issues i where i.id = issue_id and public.mkc_hosp_can_view_department(i.department_id)));
create policy mkc_hosp_reports_select on public.mkc_hosp_reports for select
  using (public.app_has_permission('hospitality.owner_report')
         or public.mkc_chat_my_role(public.mkc_hosp_group_id(department_id)) = 'manager');
-- mkc_chat_retention_runs: service role only.

-- ----------------------------------------------------------------------------
-- Function grants: client-callable RPCs only. Internal helpers and the report
-- writers are service-role only.
-- ----------------------------------------------------------------------------
revoke execute on function
  public.mkc_chat_post(uuid, text, text, text, uuid, jsonb, text, uuid),
  public.mkc_hosp_notify(uuid[], text, text, text, text, jsonb),
  public.mkc_hosp_audit(text, uuid, text, jsonb),
  public.mkc_chat_link_attachments(uuid[], uuid, uuid, uuid, uuid, uuid),
  public.mkc_chat_desired_members(),
  public.mkc_chat_sync_members(),
  public.mkc_chat_sync_members_trigger(),
  public.mkc_chat_attachments_set_expiry(),
  public.mkc_hosp_sync_room_tasks(),
  public.mkc_hosp_report_begin(uuid, date, text, uuid),
  public.mkc_hosp_report_villa_snapshot(timestamptz, timestamptz, date),
  public.mkc_hosp_report_finish(uuid, jsonb, jsonb, text),
  public.mkc_hosp_report_fail(uuid, text, jsonb),
  public.mkc_hosp_members_with_role(uuid, text[]),
  public.mkc_hosp_owner_ids()
from public, anon, authenticated;

revoke execute on function
  public.mkc_chat_list(),
  public.mkc_chat_mark_read(uuid),
  public.mkc_chat_send_text(uuid, text, uuid[]),
  public.mkc_chat_register_attachment(uuid, text, text),
  public.mkc_chat_set_retention_hold(uuid, date, text),
  public.mkc_hosp_task_start(uuid),
  public.mkc_hosp_task_assign(uuid, uuid),
  public.mkc_hosp_task_block(uuid, text),
  public.mkc_hosp_task_submit_cleaning(uuid, jsonb, text, uuid[]),
  public.mkc_hosp_fo_inspect(uuid, jsonb, text, text, uuid[]),
  public.mkc_hosp_issue_create(text, text, text, text, text, uuid, text, timestamptz, text, uuid[], uuid, uuid),
  public.mkc_hosp_issue_update(uuid, text, uuid, text),
  public.mkc_hosp_submit_security(text, text, jsonb, text, jsonb, uuid, text, uuid[]),
  public.mkc_hosp_units(text),
  public.mkc_hosp_people(text),
  public.mkc_hosp_report_acknowledge(uuid)
from public, anon;

grant execute on function
  public.mkc_chat_list(),
  public.mkc_chat_mark_read(uuid),
  public.mkc_chat_send_text(uuid, text, uuid[]),
  public.mkc_chat_register_attachment(uuid, text, text),
  public.mkc_chat_set_retention_hold(uuid, date, text),
  public.mkc_hosp_task_start(uuid),
  public.mkc_hosp_task_assign(uuid, uuid),
  public.mkc_hosp_task_block(uuid, text),
  public.mkc_hosp_task_submit_cleaning(uuid, jsonb, text, uuid[]),
  public.mkc_hosp_fo_inspect(uuid, jsonb, text, text, uuid[]),
  public.mkc_hosp_issue_create(text, text, text, text, text, uuid, text, timestamptz, text, uuid[], uuid, uuid),
  public.mkc_hosp_issue_update(uuid, text, uuid, text),
  public.mkc_hosp_submit_security(text, text, jsonb, text, jsonb, uuid, text, uuid[]),
  public.mkc_hosp_units(text),
  public.mkc_hosp_people(text),
  public.mkc_hosp_report_acknowledge(uuid)
to authenticated;

-- ----------------------------------------------------------------------------
-- Storage: private evidence bucket. Path <conversation_id>/<uid>/<file>.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hospitality-evidence', 'hospitality-evidence', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy hospitality_evidence_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'hospitality-evidence'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.mkc_chat_my_role(((storage.foldername(name))[1])::uuid) is not null
  );
create policy hospitality_evidence_select on storage.objects for select to authenticated
  using (
    bucket_id = 'hospitality-evidence'
    and exists (
      select 1 from public.mkc_chat_attachments a
      where a.object_path = name and a.deleted_at is null
        and (public.mkc_chat_can_read(a.conversation_id)
             or public.mkc_hosp_can_view_department((select c.department_id from public.mkc_chat_conversations c where c.id = a.conversation_id)))
    )
  );
-- The uploader can read back an object it has not registered yet (preview).
create policy hospitality_evidence_select_own_unregistered on storage.objects for select to authenticated
  using (bucket_id = 'hospitality-evidence' and owner_id = auth.uid()::text
         and (storage.foldername(name))[2] = auth.uid()::text);
-- No update/delete policy: deletion is the retention job (service role).

-- ----------------------------------------------------------------------------
-- Realtime: new messages and live card status
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.mkc_chat_messages;
alter publication supabase_realtime add table public.mkc_hosp_room_tasks;
alter publication supabase_realtime add table public.mkc_hosp_issues;

-- ----------------------------------------------------------------------------
-- Notification categories: live constraint (as of 0290) + this migration's.
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
    'stuck_prospect_reminder', 'stuck_prospect_alert', 'branch_target_reminder',
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation',
    'task_pending_verification',
    'daily_motivation', 'daily_report', 'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'new_ad_lead',
    'content_published', 'content_publish_reminder',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning', 'meta_ads_balance_low', 'content_publish_failed', 'database_followup_push',
    'lead_wants_info', 'loonars_fee_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled',
    'disciplinary_warning', 'employee_terminated', 'content_review_pending',
    'salary_transfer_request', 'salary_transferred', 'salary_transfer_summary',
    'construction_expense_submitted', 'construction_weekly_report', 'material_purchase_missing_photo',
    'construction_progress_report', 'approval_request_submitted', 'approval_request_decided',
    'lead_hot_handoff', 'pending_question_timeout',
    'construction_cost_request_submitted', 'construction_cost_request_decided', 'construction_project_weekly_report',
    'occupancy_campaign_launched', 'occupancy_campaign_failed',
    'refund_reminder', 'refund_customer_message',
    -- This migration
    'hospitality_task', 'hospitality_report', 'hospitality_critical_alert'
  ]));

-- WhatsApp relay allowlist, restated VERBATIM from the live function plus
-- hospitality_critical_alert: a critical incident must reach the Hospitality
-- Manager and the owner even when nobody has the app open. Routine
-- hospitality notifications stay in-app + web push.
create or replace function public.mkc_notifications_whatsapp_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if new.category = any (array[
    -- Keuangan (finance)
    'finance_expense_alert', 'finance_expense_pending_verification',
    'finance_expense_duplicate_rejected', 'branch_balance_alert',
    'salary_transfer_summary', 'salary_transferred',
    'labor_payment_pending_approval', 'material_purchase_missing_photo',
    -- Siteplan unit purchase + fee claim alerts -- a fee claim is a real
    -- payout, so this is a finance matter too (0276, owner's explicit call).
    'loonars_fee_alert',
    -- Refund customer -- pengingat dari Refund & Customer Relation (0287).
    'refund_reminder',
    -- Hospitality -- insiden kritis (0291).
    'hospitality_critical_alert',
    -- Konstruksi (construction)
    'construction_expense_submitted', 'construction_weekly_report',
    'construction_progress_report', 'construction_cost_request_submitted',
    'construction_cost_request_decided', 'construction_project_weekly_report',
    -- Ulang tahun (birthday) -- explicit exception
    'birthday_wish',
    -- System/ops health, not an employee notification -- see 0260's header comment
    'whatsapp_webhook_silence_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- Schedules (pg_cron, UTC). Report times themselves live in
-- mkc_chat_departments.settings.report_times (local time); the dispatcher
-- runs every 15 minutes and only generates what is due and not yet done.
-- ----------------------------------------------------------------------------
select cron.schedule('hospitality-sync-room-tasks', '*/5 * * * *', $$select public.mkc_hosp_sync_room_tasks();$$);
select cron.schedule('hospitality-report-dispatch', '7,22,37,52 * * * *', $$select public.automation_post('/api/hospitality/reports/dispatch', '{}'::jsonb, 60000);$$);
select cron.schedule('hospitality-evidence-retention', '40 * * * *', $$select public.automation_post('/api/hospitality/retention', '{}'::jsonb, 60000);$$);

-- Initial membership from current employee data.
select public.mkc_chat_sync_members();
