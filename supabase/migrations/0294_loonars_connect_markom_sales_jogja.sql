-- ============================================================================
-- MK Connect — 0294: Loonars Connect, Markom Jogja + Sales Jogja
--
-- Owner's decisions (2026-10-24, Jogja only):
--   * Markom builds its content calendar INSIDE the group chat. Markom has no
--     manager: any Markom member plans and moves content forward; the owner
--     sees the result in the report feed.
--   * KOL: room use for a KOL stay is approved by Rebecca (group role
--     room_approver), and her approval alone creates the free-stay voucher.
--     Rebecca joins the Markom group for exactly this.
--   * Sales Jogja sells Loonars 2 units only. Vando (Kepala Cabang Jogja) is
--     the group's manager.
--   * Members: Markom = division "Marketing & Komunikasi" in branch JOG
--     (incl. a staff-role member), Sales = division "Marketing & Sales" in
--     branch JOG. Both divisions are company-wide, so division mappings now
--     carry an optional branch filter.
--
-- Source of truth stays put:
--   * KOL vouchers live in the villa app's villa_kol_vouchers. The villa-api
--     /bridge/kol endpoint accepts only the owner's WhatsApp number; the owner
--     has now delegated this approval to Rebecca, so mkc_mkt_kol_decide()
--     inserts the voucher row exactly as that endpoint does (code
--     KOL-XXXXXX from the same alphabet, 1-7 nights, valid for check-in for
--     3 months, unique code retry) with dibuat_lewat = 'mkconnect'. Redeeming
--     it is unchanged: the KOL books on loonars.id and the villa app checks
--     the code. The resulting booking (bookings.kol_voucher_id) is read back.
--   * Leads and follow-ups stay in the CRM (prospects / prospect_follow_ups)
--     and are written ONLY through the existing CRM RPCs crm_create_prospect
--     / crm_add_follow_up. Chat cards reference them; the phone number is
--     never put in a message or returned to the chat UI.
--   * Loonars 2 bookings (tanda jadi) and fee claims stay in
--     loonars_unit_purchases / loonars_unit_fee_requests; the chat only posts
--     their status changes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Generic: new group roles, branch-scoped division mapping, new card refs
-- ----------------------------------------------------------------------------
alter table public.mkc_chat_division_roles drop constraint mkc_chat_division_roles_member_role_check;
alter table public.mkc_chat_division_roles add constraint mkc_chat_division_roles_member_role_check
  check (member_role in ('manager', 'front_office', 'cleaning', 'security', 'markom', 'sales', 'room_approver'));
alter table public.mkc_chat_role_assignments drop constraint mkc_chat_role_assignments_member_role_check;
alter table public.mkc_chat_role_assignments add constraint mkc_chat_role_assignments_member_role_check
  check (member_role in ('manager', 'front_office', 'cleaning', 'security', 'markom', 'sales', 'room_approver'));
alter table public.mkc_chat_members drop constraint mkc_chat_members_member_role_check;
alter table public.mkc_chat_members add constraint mkc_chat_members_member_role_check
  check (member_role in ('manager', 'front_office', 'cleaning', 'security', 'markom', 'sales', 'room_approver'));

-- null = every branch (Hospitality's LPL divisions are branch-specific already)
alter table public.mkc_chat_division_roles add column branch_id uuid references public.branches(id);

alter table public.mkc_chat_messages drop constraint mkc_chat_messages_ref_table_check;
alter table public.mkc_chat_messages add constraint mkc_chat_messages_ref_table_check
  check (ref_table in ('room_task', 'issue', 'checklist', 'report', 'content_plan', 'kol', 'prospect', 'visit', 'purchase', 'daily_report'));

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
      and (dr.branch_id is null or e.branch_id = dr.branch_id)
  ) x on public.mkc_chat_employee_eligible(x.employee_id)
  where c.kind = 'operational_group'
  order by c.id, x.employee_id, x.prio
$$;

-- Report cards: title/category per department (0291 hardcoded Hospitality).
create or replace function public.mkc_hosp_report_finish(p_report_id uuid, p_data jsonb, p_sources jsonb, p_summary text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.mkc_hosp_reports%rowtype;
  v_dept public.mkc_chat_departments%rowtype;
  v_msg uuid;
begin
  select * into v_rep from public.mkc_hosp_reports where id = p_report_id for update;
  if not found then raise exception 'Laporan tidak ditemukan'; end if;
  if v_rep.status = 'success' then return v_rep.message_id; end if;
  select * into v_dept from public.mkc_chat_departments where id = v_rep.department_id;
  v_msg := public.mkc_chat_post(public.mkc_hosp_feed_id(v_rep.department_id), 'report_card', p_summary, 'report', p_report_id,
    jsonb_build_object('period_kind', v_rep.period_kind, 'report_date', v_rep.report_date), 'report:' || p_report_id);
  update public.mkc_hosp_reports
     set status = 'success', data = p_data, sources = p_sources, generated_at = now(), message_id = v_msg, error = null
   where id = p_report_id;
  perform public.mkc_hosp_notify(public.mkc_hosp_owner_ids(), 'Laporan ' || v_dept.name, left(p_summary, 200),
    '/chat?c=' || public.mkc_hosp_feed_id(v_rep.department_id),
    case when v_dept.code = 'hospitality' then 'hospitality_report' else 'daily_report' end,
    jsonb_build_object('report_id', p_report_id));
  return v_msg;
end;
$$;

-- ----------------------------------------------------------------------------
-- Departments, conversations, membership
-- ----------------------------------------------------------------------------
insert into public.mkc_chat_departments (code, name, branch_id, timezone, settings)
select 'markom_jogja', 'Markom Jogja', b.id, 'Asia/Jakarta', jsonb_build_object(
  'report_times', jsonb_build_object('end_of_day', '20:00'),
  'retention_days', 30,
  'max_retention_hold_days', 180,
  'kol_content_due_days', 7,
  'kol_decision_target_hours', 24
)
from public.branches b where b.code = 'JOG'
on conflict (code) do nothing;

insert into public.mkc_chat_departments (code, name, branch_id, timezone, settings)
select 'sales_jogja', 'Sales Jogja', b.id, 'Asia/Jakarta', jsonb_build_object(
  'report_times', jsonb_build_object('end_of_day', '20:00'),
  'retention_days', 30,
  'max_retention_hold_days', 180,
  'lead_first_contact_hours', 24,
  'lead_stale_days', 3,
  'daily_report_due', '19:00',
  'crm_project_name', 'Loonars living 2',
  'siteplan_project_kode', 'LNR2'
)
from public.branches b where b.code = 'JOG'
on conflict (code) do nothing;

insert into public.mkc_chat_conversations (department_id, kind, name, description)
select d.id, v.kind, v.name, v.description
from public.mkc_chat_departments d
join (values
  ('markom_jogja', 'operational_group', 'Markom Jogja', 'Kalender konten, KOL, dan pemakaian kamar villa untuk KOL'),
  ('markom_jogja', 'owner_feed', 'Laporan Markom Jogja', 'Laporan konsolidasi Markom Jogja untuk owner'),
  ('sales_jogja', 'operational_group', 'Sales Jogja', 'Lead, follow-up, kunjungan, dan tanda jadi Loonars 2'),
  ('sales_jogja', 'owner_feed', 'Laporan Sales Jogja', 'Laporan konsolidasi Sales Jogja untuk owner')
) as v(code, kind, name, description) on v.code = d.code
on conflict (department_id, kind) do nothing;

insert into public.mkc_chat_division_roles (department_id, division_id, member_role, branch_id)
select d.id, dv.id, v.member_role, d.branch_id
from public.mkc_chat_departments d
join (values ('markom_jogja', 'Marketing & Komunikasi', 'markom'), ('sales_jogja', 'Marketing & Sales', 'sales'))
  as v(code, division_name, member_role) on v.code = d.code
join public.divisions dv on dv.name = v.division_name and dv.deleted_at is null
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Markom: KOL collaborations + content calendar
-- ----------------------------------------------------------------------------
create table public.mkc_mkt_kol_collabs (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  conversation_id uuid not null references public.mkc_chat_conversations(id) on delete cascade,
  kol_handle text not null check (length(trim(kol_handle)) between 2 and 80),
  platform text not null check (platform in ('instagram', 'tiktok', 'youtube', 'other')),
  followers integer check (followers >= 0),
  niche text check (length(niche) <= 100),
  compensation text not null default 'barter' check (compensation in ('barter', 'paid', 'barter_paid')),
  requested_checkin date not null,
  nights integer not null check (nights between 1 and 7),
  deliverables text[] not null check (
    cardinality(deliverables) >= 1
    and deliverables <@ array['feed', 'reels', 'story', 'tiktok', 'tag_lokasi', 'link_booking']
  ),
  -- key -> { url, at, by }
  deliverables_done jsonb not null default '{}'::jsonb,
  notes text check (length(notes) <= 2000),
  status text not null default 'requested' check (status in (
    'requested', 'approved', 'rejected', 'booked', 'staying', 'content_due', 'completed', 'cancelled'
  )),
  approved_unit_id uuid references public.units(id) on delete set null,
  approved_unit_nomor text,
  approved_checkin date,
  approved_nights integer check (approved_nights between 1 and 7),
  decided_by uuid references public.employees(id),
  decided_at timestamptz,
  decision_note text,
  voucher_id uuid references public.villa_kol_vouchers(id) on delete set null,
  voucher_kode text,
  voucher_valid_until date,
  booking_id uuid references public.bookings(id) on delete set null,
  booked_unit_nomor text,
  booked_checkin date,
  booked_checkout date,
  content_due_at timestamptz,
  completed_at timestamptz,
  cancel_reason text,
  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'rejected' or length(trim(coalesce(decision_note, ''))) > 0),
  check (status <> 'cancelled' or length(trim(coalesce(cancel_reason, ''))) > 0)
);
create index mkc_mkt_kol_open_idx on public.mkc_mkt_kol_collabs (department_id, status)
  where status not in ('completed', 'cancelled', 'rejected');

create table public.mkc_mkt_content_plans (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  conversation_id uuid not null references public.mkc_chat_conversations(id) on delete cascade,
  planned_date date not null,
  platform text not null check (platform in ('instagram', 'tiktok', 'youtube', 'facebook', 'website', 'other')),
  format text not null check (format in ('feed', 'reels', 'story', 'carousel', 'video', 'live', 'other')),
  topic text not null check (topic in ('villa', 'loonars2', 'kol', 'brand', 'promo', 'other')),
  title text not null check (length(trim(title)) between 3 and 200),
  brief text check (length(brief) <= 2000),
  pic_id uuid not null references public.employees(id),
  kol_id uuid references public.mkc_mkt_kol_collabs(id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'in_production', 'ready', 'published', 'cancelled')),
  published_url text check (published_url ~* '^https?://'),
  published_at timestamptz,
  cancel_reason text,
  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or (published_url is not null and published_at is not null)),
  check (status <> 'cancelled' or length(trim(coalesce(cancel_reason, ''))) > 0)
);
create index mkc_mkt_content_date_idx on public.mkc_mkt_content_plans (department_id, planned_date);

-- ----------------------------------------------------------------------------
-- Sales: site visits + daily reports (leads / follow-ups stay in the CRM)
-- ----------------------------------------------------------------------------
create table public.mkc_sales_visits (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  conversation_id uuid not null references public.mkc_chat_conversations(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  sales_id uuid not null references public.employees(id),
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'no_show', 'cancelled')),
  interest text check (interest in ('cold', 'warm', 'hot')),
  note text check (length(note) <= 1000),
  result_note text check (length(result_note) <= 2000),
  follow_up_id uuid references public.prospect_follow_ups(id) on delete set null,
  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mkc_sales_visits_dept_idx on public.mkc_sales_visits (department_id, scheduled_at);

create table public.mkc_sales_daily_reports (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.mkc_chat_departments(id) on delete cascade,
  conversation_id uuid not null references public.mkc_chat_conversations(id) on delete cascade,
  sales_id uuid not null references public.employees(id),
  report_date date not null,
  items jsonb not null,
  follow_ups integer not null check (follow_ups between 0 and 500),
  visits integer not null check (visits between 0 and 100),
  hot_prospects integer not null check (hot_prospects between 0 and 500),
  notes text check (length(notes) <= 2000),
  message_id uuid references public.mkc_chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (department_id, sales_id, report_date)
);

create trigger set_updated_at before update on public.mkc_mkt_kol_collabs for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.mkc_mkt_content_plans for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.mkc_sales_visits for each row execute function public.set_updated_at();

-- Checklist keys for the sales daily report. MUST match lib/connect/sales-report.ts (SALES_DAILY_ITEMS).
create or replace function public.mkc_sales_daily_items()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array['lead_baru_dihubungi', 'follow_up_dicatat_crm', 'materi_promosi_dibagikan']
$$;

-- Department by code; raises if unknown/inactive.
create or replace function public.mkc_connect_department(p_code text)
returns public.mkc_chat_departments
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.mkc_chat_departments%rowtype;
begin
  select * into v from public.mkc_chat_departments where code = p_code and is_active;
  if not found then raise exception 'Departemen tidak ditemukan'; end if;
  return v;
end;
$$;

-- ----------------------------------------------------------------------------
-- Markom RPCs
-- ----------------------------------------------------------------------------
create or replace function public.mkc_mkt_content_create(
  p_department_code text, p_planned_date date, p_platform text, p_format text, p_topic text,
  p_title text, p_brief text default null, p_pic_id uuid default null, p_kol_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype := public.mkc_connect_department(p_department_code);
  v_group uuid;
  v_pic uuid;
  v_id uuid;
  v_name text;
begin
  perform public.mkc_hosp_require_role(v_dept.id, array['markom']);
  v_group := public.mkc_hosp_group_id(v_dept.id);
  v_pic := coalesce(p_pic_id, auth.uid());
  if not exists (select 1 from public.mkc_chat_members where conversation_id = v_group and employee_id = v_pic
                 and member_role = 'markom' and removed_at is null) then
    raise exception 'PIC harus anggota Markom di grup';
  end if;
  if p_planned_date is null or p_planned_date < public.mkc_hosp_local_date(v_dept.id) - 1 then
    raise exception 'Tanggal tayang tidak boleh di masa lalu';
  end if;
  if p_kol_id is not null and not exists (select 1 from public.mkc_mkt_kol_collabs where id = p_kol_id and department_id = v_dept.id) then
    raise exception 'KOL tidak ditemukan';
  end if;
  insert into public.mkc_mkt_content_plans (department_id, conversation_id, planned_date, platform, format, topic, title, brief, pic_id, kol_id, created_by)
  values (v_dept.id, v_group, p_planned_date, p_platform, p_format, p_topic, trim(p_title), nullif(trim(coalesce(p_brief, '')), ''), v_pic, p_kol_id, auth.uid())
  returning id into v_id;
  select full_name into v_name from public.employees where id = v_pic;
  perform public.mkc_chat_post(v_group, 'task', format('🗓️ Rencana konten %s: %s (PIC %s)', to_char(p_planned_date, 'DD-MM'), trim(p_title), v_name),
    'content_plan', v_id, jsonb_build_object('planned_date', p_planned_date), 'content_created:' || v_id, auth.uid());
  if v_pic <> auth.uid() then
    perform public.mkc_hosp_notify(array[v_pic], 'Konten untuk Anda: ' || left(trim(p_title), 80),
      format('Tayang %s', to_char(p_planned_date, 'DD-MM-YYYY')), '/chat?c=' || v_group, 'markom_new_task', jsonb_build_object('content_plan_id', v_id));
  end if;
  return v_id;
end;
$$;

-- p_action: start | ready | publish (p_url) | reschedule (p_date) | reassign (p_pic) | cancel (p_note)
create or replace function public.mkc_mkt_content_update(
  p_id uuid, p_action text, p_date date default null, p_url text default null, p_pic_id uuid default null, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.mkc_mkt_content_plans%rowtype;
  v_name text;
  v_text text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v from public.mkc_mkt_content_plans where id = p_id for update;
  if not found then raise exception 'Rencana konten tidak ditemukan'; end if;
  perform public.mkc_hosp_require_role(v.department_id, array['markom']);
  if v.status in ('published', 'cancelled') then raise exception 'Konten ini sudah selesai/dibatalkan'; end if;
  select full_name into v_name from public.employees where id = auth.uid();

  if p_action = 'start' then
    update public.mkc_mkt_content_plans set status = 'in_production' where id = p_id;
    v_text := format('🎬 %s mulai produksi: %s', v_name, v.title);
  elsif p_action = 'ready' then
    update public.mkc_mkt_content_plans set status = 'ready' where id = p_id;
    v_text := format('📦 Materi siap tayang: %s (%s)', v.title, v_name);
  elsif p_action = 'publish' then
    if coalesce(p_url, '') !~* '^https?://\S+$' then raise exception 'Masukkan link konten yang sudah tayang'; end if;
    update public.mkc_mkt_content_plans set status = 'published', published_url = p_url, published_at = now() where id = p_id;
    v_text := format('✅ Tayang: %s — %s', v.title, p_url);
  elsif p_action = 'reschedule' then
    if p_date is null or p_date < public.mkc_hosp_local_date(v.department_id) then raise exception 'Tanggal baru tidak valid'; end if;
    update public.mkc_mkt_content_plans set planned_date = p_date where id = p_id;
    v_text := format('🔁 %s dipindah ke %s (%s)%s', v.title, to_char(p_date, 'DD-MM'), v_name, coalesce(': ' || v_note, ''));
  elsif p_action = 'reassign' then
    if not exists (select 1 from public.mkc_chat_members where conversation_id = v.conversation_id and employee_id = p_pic_id
                   and member_role = 'markom' and removed_at is null) then
      raise exception 'PIC harus anggota Markom di grup';
    end if;
    update public.mkc_mkt_content_plans set pic_id = p_pic_id where id = p_id;
    v_text := format('👤 PIC %s: %s', v.title, (select full_name from public.employees where id = p_pic_id));
    perform public.mkc_hosp_notify(array[p_pic_id], 'Konten untuk Anda: ' || left(v.title, 80), 'Anda menjadi PIC',
      '/chat?c=' || v.conversation_id, 'markom_new_task', jsonb_build_object('content_plan_id', p_id));
  elsif p_action = 'cancel' then
    if v_note is null then raise exception 'Tulis alasan pembatalan'; end if;
    update public.mkc_mkt_content_plans set status = 'cancelled', cancel_reason = v_note where id = p_id;
    v_text := format('🚫 Dibatalkan: %s — %s (%s)', v.title, v_note, v_name);
  else
    raise exception 'Tindakan tidak dikenal';
  end if;
  perform public.mkc_chat_post(v.conversation_id, 'system', v_text, 'content_plan', p_id,
    jsonb_build_object('action', p_action), null);
end;
$$;

create or replace function public.mkc_mkt_kol_create(
  p_department_code text, p_kol_handle text, p_platform text, p_followers integer, p_niche text,
  p_compensation text, p_requested_checkin date, p_nights integer, p_deliverables text[], p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype := public.mkc_connect_department(p_department_code);
  v_group uuid;
  v_id uuid;
  v_name text;
begin
  perform public.mkc_hosp_require_role(v_dept.id, array['markom']);
  v_group := public.mkc_hosp_group_id(v_dept.id);
  if p_requested_checkin is null or p_requested_checkin < public.mkc_hosp_local_date(v_dept.id) then
    raise exception 'Tanggal menginap tidak boleh di masa lalu';
  end if;
  insert into public.mkc_mkt_kol_collabs (department_id, conversation_id, kol_handle, platform, followers, niche, compensation,
    requested_checkin, nights, deliverables, notes, created_by)
  values (v_dept.id, v_group, trim(p_kol_handle), p_platform, p_followers, nullif(trim(coalesce(p_niche, '')), ''),
    coalesce(p_compensation, 'barter'), p_requested_checkin, p_nights, p_deliverables, nullif(trim(coalesce(p_notes, '')), ''), auth.uid())
  returning id into v_id;
  select full_name into v_name from public.employees where id = auth.uid();
  perform public.mkc_chat_post(v_group, 'task',
    format('🤝 KOL %s minta %s malam mulai %s — menunggu persetujuan kamar', trim(p_kol_handle), p_nights, to_char(p_requested_checkin, 'DD-MM-YYYY')),
    'kol', v_id, jsonb_build_object('status', 'requested'), 'kol_created:' || v_id, auth.uid());
  perform public.mkc_hosp_notify(public.mkc_hosp_members_with_role(v_dept.id, array['room_approver']),
    'Persetujuan kamar KOL: ' || left(trim(p_kol_handle), 60),
    format('%s malam mulai %s, diajukan %s', p_nights, to_char(p_requested_checkin, 'DD-MM-YYYY'), v_name),
    '/chat?c=' || v_group, 'markom_new_task', jsonb_build_object('kol_id', v_id));
  return v_id;
end;
$$;

-- Rebecca's decision. 'approve' checks the unit is free for those nights in
-- the villa app, then issues the voucher (same rules as villa-api /bridge/kol).
create or replace function public.mkc_mkt_kol_decide(
  p_kol_id uuid, p_decision text, p_unit_id uuid default null, p_checkin date default null,
  p_nights integer default null, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v public.mkc_mkt_kol_collabs%rowtype;
  v_unit record;
  v_checkout date;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_name text;
  v_kode text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_voucher_id uuid;
  v_valid date;
  v_today date;
  i integer;
  attempt integer;
begin
  select * into v from public.mkc_mkt_kol_collabs where id = p_kol_id for update;
  if not found then raise exception 'KOL tidak ditemukan'; end if;
  perform public.mkc_hosp_require_role(v.department_id, array['room_approver']);
  if v.status <> 'requested' then raise exception 'Pengajuan ini sudah diputuskan'; end if;
  select full_name into v_name from public.employees where id = auth.uid();
  v_today := public.mkc_hosp_local_date(v.department_id);

  if p_decision = 'reject' then
    if v_note is null then raise exception 'Tulis alasan penolakan'; end if;
    update public.mkc_mkt_kol_collabs set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = v_note where id = p_kol_id;
    perform public.mkc_chat_post(v.conversation_id, 'system', format('❌ Kamar untuk KOL %s ditolak %s: %s', v.kol_handle, v_name, v_note),
      'kol', p_kol_id, jsonb_build_object('status', 'rejected'), 'kol_decided:' || p_kol_id);
    perform public.mkc_hosp_notify(array[v.created_by], 'KOL ' || left(v.kol_handle, 60) || ' ditolak', v_note,
      '/chat?c=' || v.conversation_id, 'markom_new_task', jsonb_build_object('kol_id', p_kol_id));
    return jsonb_build_object('status', 'rejected');
  elsif coalesce(p_decision, '') <> 'approve' then
    raise exception 'Keputusan tidak dikenal';
  end if;

  if p_checkin is null or p_checkin < v_today then raise exception 'Tanggal check-in tidak valid'; end if;
  if p_nights is null or p_nights < 1 or p_nights > 7 then raise exception 'Jumlah malam 1 sampai 7'; end if;
  select id, nomor, status into v_unit from public.units where id = p_unit_id;
  if not found then raise exception 'Pilih unit'; end if;
  v_checkout := p_checkin + p_nights;

  -- Same unit, overlapping nights, live booking in the villa app.
  if exists (
    select 1 from public.bookings b
    where b.unit_id = p_unit_id and b.status in ('terjadwal', 'checkin')
      and b.tgl_checkin < v_checkout and coalesce(b.tgl_checkout, b.tgl_checkin + 1) > p_checkin
  ) then
    raise exception 'Unit % sudah ada booking pada tanggal itu — pilih unit/tanggal lain', v_unit.nomor;
  end if;
  if exists (
    select 1 from public.villa_room_maintenance m
    where m.unit_id = p_unit_id and m.tutup_mulai < v_checkout and m.tutup_sampai >= p_checkin
  ) then
    raise exception 'Unit % sedang ditutup (maintenance) pada tanggal itu', v_unit.nomor;
  end if;

  -- Voucher: KOL-XXXXXX, valid for check-in up to 3 months from today (or
  -- the approved check-in if later), like villa-api /bridge/kol.
  v_valid := greatest((v_today + interval '3 months')::date, p_checkin);
  for attempt in 1..10 loop
    v_bytes := extensions.gen_random_bytes(6);
    v_kode := 'KOL-';
    for i in 0..5 loop
      v_kode := v_kode || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    begin
      insert into public.villa_kol_vouchers (kode, untuk, malam_gratis, berlaku_sampai, dibuat_lewat, catatan)
      values (v_kode, left(v.kol_handle, 80), p_nights, v_valid, 'mkconnect',
              format('Loonars Connect: disetujui %s untuk unit %s, %s', v_name, v_unit.nomor, to_char(p_checkin, 'DD-MM-YYYY')))
      returning id into v_voucher_id;
      exit;
    exception when unique_violation then
      v_voucher_id := null;
    end;
  end loop;
  if v_voucher_id is null then raise exception 'Gagal membuat kode kupon, coba lagi'; end if;

  update public.mkc_mkt_kol_collabs
     set status = 'approved', approved_unit_id = p_unit_id, approved_unit_nomor = v_unit.nomor, approved_checkin = p_checkin,
         approved_nights = p_nights, decided_by = auth.uid(), decided_at = now(), decision_note = v_note,
         voucher_id = v_voucher_id, voucher_kode = v_kode, voucher_valid_until = v_valid
   where id = p_kol_id;

  perform public.mkc_chat_post(v.conversation_id, 'system',
    format('🟢 Kamar KOL %s disetujui %s: unit %s, %s s/d %s (%s malam). Kupon %s — pesan di loonars.id dengan kode ini.',
      v.kol_handle, v_name, v_unit.nomor, to_char(p_checkin, 'DD-MM-YYYY'), to_char(v_checkout, 'DD-MM-YYYY'), p_nights, v_kode),
    'kol', p_kol_id, jsonb_build_object('status', 'approved'), 'kol_decided:' || p_kol_id);
  perform public.mkc_hosp_notify(array[v.created_by], 'Kamar KOL ' || left(v.kol_handle, 60) || ' disetujui',
    format('Kupon %s, unit %s mulai %s', v_kode, v_unit.nomor, to_char(p_checkin, 'DD-MM-YYYY')),
    '/chat?c=' || v.conversation_id, 'markom_new_task', jsonb_build_object('kol_id', p_kol_id));
  perform public.mkc_hosp_audit('mkc_mkt_kol_collabs', p_kol_id, 'UPDATE',
    jsonb_build_object('event', 'kol_room_approved', 'unit', v_unit.nomor, 'checkin', p_checkin, 'nights', p_nights, 'voucher', v_kode));
  return jsonb_build_object('status', 'approved', 'voucher_kode', v_kode);
end;
$$;

-- p_action: deliverable (p_key + p_url) | cancel (p_note) | note (p_note)
create or replace function public.mkc_mkt_kol_update(p_kol_id uuid, p_action text, p_key text default null, p_url text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.mkc_mkt_kol_collabs%rowtype;
  v_role text;
  v_name text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_done jsonb;
  v_text text;
begin
  select * into v from public.mkc_mkt_kol_collabs where id = p_kol_id for update;
  if not found then raise exception 'KOL tidak ditemukan'; end if;
  v_role := public.mkc_hosp_require_role(v.department_id, array['markom', 'room_approver']);
  select full_name into v_name from public.employees where id = auth.uid();

  if p_action = 'deliverable' then
    if v_role <> 'markom' then raise exception 'Hanya Markom' using errcode = '42501'; end if;
    if v.status not in ('booked', 'staying', 'content_due', 'approved') then raise exception 'Kolaborasi ini tidak aktif'; end if;
    if coalesce(p_key, '') <> all (v.deliverables) then raise exception 'Kewajiban konten tidak dikenal'; end if;
    if coalesce(p_url, '') !~* '^https?://\S+$' then raise exception 'Masukkan link kontennya'; end if;
    v_done := v.deliverables_done || jsonb_build_object(p_key, jsonb_build_object('url', p_url, 'at', now(), 'by', auth.uid()));
    update public.mkc_mkt_kol_collabs set deliverables_done = v_done where id = p_kol_id;
    v_text := format('🔗 KOL %s: %s tayang — %s', v.kol_handle, p_key, p_url);
    if (select bool_and(v_done ? d) from unnest(v.deliverables) d) then
      update public.mkc_mkt_kol_collabs set status = 'completed', completed_at = now() where id = p_kol_id;
      v_text := v_text || E'\n✅ Semua kewajiban konten KOL selesai';
    end if;
  elsif p_action = 'cancel' then
    if v_note is null then raise exception 'Tulis alasan pembatalan'; end if;
    if v.status in ('completed', 'cancelled', 'rejected') then raise exception 'Kolaborasi ini sudah selesai'; end if;
    if v.booking_id is not null and exists (select 1 from public.bookings where id = v.booking_id and status <> 'batal') then
      raise exception 'KOL sudah booking — batalkan bookingnya dulu di sistem villa';
    end if;
    -- Unused voucher: switch it off, like villa-api /bridge/kol "batal".
    if v.voucher_id is not null then
      update public.villa_kol_vouchers set aktif = false
       where id = v.voucher_id
         and not exists (select 1 from public.bookings b where b.kol_voucher_id = v.voucher_id and b.status <> 'batal');
    end if;
    update public.mkc_mkt_kol_collabs set status = 'cancelled', cancel_reason = v_note where id = p_kol_id;
    v_text := format('🚫 KOL %s dibatalkan %s: %s%s', v.kol_handle, v_name, v_note, case when v.voucher_kode is not null then ' (kupon ' || v.voucher_kode || ' dinonaktifkan)' else '' end);
  elsif p_action = 'note' then
    if v_note is null then raise exception 'Catatan kosong'; end if;
    v_text := format('📝 KOL %s: %s (%s)', v.kol_handle, v_note, v_name);
  else
    raise exception 'Tindakan tidak dikenal';
  end if;
  perform public.mkc_chat_post(v.conversation_id, 'system', v_text, 'kol', p_kol_id, jsonb_build_object('action', p_action), null);
end;
$$;

-- Follow approved vouchers into the villa app's bookings (idempotent).
create or replace function public.mkc_mkt_sync_kol()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_b record;
  v_changed integer := 0;
  v_due_days integer;
begin
  for v in
    select k.*, d.settings from public.mkc_mkt_kol_collabs k join public.mkc_chat_departments d on d.id = k.department_id
    where k.voucher_id is not null and k.status in ('approved', 'booked', 'staying')
  loop
    select b.id, b.status, b.unit_nomor, b.tgl_checkin, b.tgl_checkout into v_b
    from public.bookings b where b.kol_voucher_id = v.voucher_id
    order by (b.status = 'batal'), b.created_at desc limit 1;
    v_due_days := coalesce((v.settings ->> 'kol_content_due_days')::integer, 7);

    if v_b.id is null then
      continue;
    elsif v_b.status = 'batal' then
      if v.status in ('booked', 'staying') then
        update public.mkc_mkt_kol_collabs set status = 'approved', booking_id = null, booked_unit_nomor = null, booked_checkin = null, booked_checkout = null where id = v.id;
        perform public.mkc_chat_post(v.conversation_id, 'system', format('⚠️ Booking KOL %s dibatalkan di sistem villa', v.kol_handle),
          'kol', v.id, jsonb_build_object('status', 'approved'), format('kol_booking_cancelled:%s:%s', v.id, v_b.id));
        v_changed := v_changed + 1;
      end if;
    elsif v_b.status = 'terjadwal' and v.status = 'approved' then
      update public.mkc_mkt_kol_collabs set status = 'booked', booking_id = v_b.id, booked_unit_nomor = v_b.unit_nomor,
        booked_checkin = v_b.tgl_checkin, booked_checkout = v_b.tgl_checkout where id = v.id;
      perform public.mkc_chat_post(v.conversation_id, 'system',
        format('📅 KOL %s sudah booking: unit %s, %s s/d %s%s', v.kol_handle, coalesce(v_b.unit_nomor, '?'),
          to_char(v_b.tgl_checkin, 'DD-MM-YYYY'), to_char(v_b.tgl_checkout, 'DD-MM-YYYY'),
          case when v_b.unit_nomor is distinct from v.approved_unit_nomor or v_b.tgl_checkin is distinct from v.approved_checkin
               then format(' ⚠️ berbeda dari yang disetujui (unit %s, %s)', v.approved_unit_nomor, to_char(v.approved_checkin, 'DD-MM-YYYY')) else '' end),
        'kol', v.id, jsonb_build_object('status', 'booked'), 'kol_booked:' || v_b.id);
      v_changed := v_changed + 1;
    elsif v_b.status = 'checkin' and v.status in ('approved', 'booked') then
      update public.mkc_mkt_kol_collabs set status = 'staying', booking_id = v_b.id, booked_unit_nomor = v_b.unit_nomor,
        booked_checkin = v_b.tgl_checkin, booked_checkout = v_b.tgl_checkout where id = v.id;
      perform public.mkc_chat_post(v.conversation_id, 'system', format('🏡 KOL %s sudah check-in di unit %s', v.kol_handle, coalesce(v_b.unit_nomor, '?')),
        'kol', v.id, jsonb_build_object('status', 'staying'), 'kol_checkin:' || v_b.id);
      v_changed := v_changed + 1;
    elsif v_b.status = 'checkout' then
      update public.mkc_mkt_kol_collabs set status = 'content_due', booking_id = v_b.id, booked_unit_nomor = v_b.unit_nomor,
        booked_checkin = v_b.tgl_checkin, booked_checkout = v_b.tgl_checkout,
        content_due_at = (coalesce(v_b.tgl_checkout, current_date) + v_due_days)::timestamptz
      where id = v.id;
      perform public.mkc_chat_post(v.conversation_id, 'system',
        format('📣 KOL %s sudah check-out — konten wajib tayang paling lambat %s', v.kol_handle, to_char(coalesce(v_b.tgl_checkout, current_date) + v_due_days, 'DD-MM-YYYY')),
        'kol', v.id, jsonb_build_object('status', 'content_due'), 'kol_checkout:' || v_b.id);
      perform public.mkc_hosp_notify(public.mkc_hosp_members_with_role(v.department_id, array['markom']),
        'Konten KOL ' || left(v.kol_handle, 60) || ' ditunggu', 'KOL sudah check-out', '/chat?c=' || v.conversation_id,
        'markom_new_task', jsonb_build_object('kol_id', v.id));
      v_changed := v_changed + 1;
    end if;
  end loop;
  return v_changed;
end;
$$;

-- ----------------------------------------------------------------------------
-- Sales RPCs (CRM writes go through the existing crm_* RPCs)
-- ----------------------------------------------------------------------------
-- Caller may act on this prospect: its own lead, or the group manager.
create or replace function public.mkc_sales_prospect_access(p_dept public.mkc_chat_departments, p_prospect_id uuid)
returns public.prospects
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.mkc_hosp_require_role(p_dept.id, array['sales', 'manager']);
  v public.prospects%rowtype;
begin
  select * into v from public.prospects where id = p_prospect_id and deleted_at is null;
  if not found or v.branch_id is distinct from p_dept.branch_id then raise exception 'Prospek tidak ditemukan'; end if;
  if v_role <> 'manager' and v.sales_id is distinct from auth.uid() then
    raise exception 'Ini prospek sales lain' using errcode = '42501';
  end if;
  return v;
end;
$$;

create or replace function public.mkc_sales_post_lead(p_department_code text, p_prospect_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype := public.mkc_connect_department(p_department_code);
  v public.prospects%rowtype := public.mkc_sales_prospect_access(v_dept, p_prospect_id);
  v_group uuid := public.mkc_hosp_group_id(v_dept.id);
  v_sales text;
begin
  select full_name into v_sales from public.employees where id = v.sales_id;
  return public.mkc_chat_post(v_group, 'task',
    format('🆕 Lead baru: %s (%s, %s) — sales %s', v.customer_name, coalesce(v.house_type, '-'), coalesce(v.city, '-'), coalesce(v_sales, '-')),
    'prospect', v.id, jsonb_build_object('lead_source', v.lead_source), 'lead:' || v.id, auth.uid());
end;
$$;

create or replace function public.mkc_sales_follow_up(p_department_code text, p_prospect_id uuid, p_activity_type text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype := public.mkc_connect_department(p_department_code);
  v public.prospects%rowtype := public.mkc_sales_prospect_access(v_dept, p_prospect_id);
  v_fu uuid;
  v_name text;
  v_label text;
begin
  -- existing CRM rule set: permission, ownership, closing guard, status bump
  v_fu := public.crm_add_follow_up(p_prospect_id, p_activity_type, public.mkc_hosp_local_date(v_dept.id), null, nullif(trim(coalesce(p_notes, '')), ''));
  select full_name into v_name from public.employees where id = auth.uid();
  v_label := case p_activity_type when 'phone_call' then 'telepon' when 'whatsapp' then 'WhatsApp' when 'meeting' then 'meeting'
    when 'survey' then 'survei' when 'video_call' then 'video call' when 'site_visit' then 'kunjungan lokasi' when 'negotiation' then 'negosiasi' else p_activity_type end;
  perform public.mkc_chat_post(public.mkc_hosp_group_id(v_dept.id), 'system',
    format('📞 %s follow-up %s via %s%s', v_name, v.customer_name, v_label, coalesce(': ' || left(nullif(trim(coalesce(p_notes, '')), ''), 200), '')),
    'prospect', p_prospect_id, jsonb_build_object('follow_up_id', v_fu), null, auth.uid());
  return v_fu;
end;
$$;

create or replace function public.mkc_sales_visit_schedule(p_department_code text, p_prospect_id uuid, p_scheduled_at timestamptz, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype := public.mkc_connect_department(p_department_code);
  v public.prospects%rowtype := public.mkc_sales_prospect_access(v_dept, p_prospect_id);
  v_group uuid := public.mkc_hosp_group_id(v_dept.id);
  v_id uuid;
begin
  if p_scheduled_at is null or p_scheduled_at < now() - interval '1 hour' then raise exception 'Jadwal kunjungan tidak valid'; end if;
  insert into public.mkc_sales_visits (department_id, conversation_id, prospect_id, sales_id, scheduled_at, note, created_by)
  values (v_dept.id, v_group, p_prospect_id, coalesce(v.sales_id, auth.uid()), p_scheduled_at, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  perform public.mkc_chat_post(v_group, 'task',
    format('📍 Kunjungan lokasi %s: %s', v.customer_name, to_char(p_scheduled_at at time zone v_dept.timezone, 'DD-MM HH24:MI')),
    'visit', v_id, jsonb_build_object('prospect_id', p_prospect_id), 'visit_created:' || v_id, auth.uid());
  perform public.mkc_hosp_notify(public.mkc_hosp_members_with_role(v_dept.id, array['manager']),
    'Kunjungan lokasi dijadwalkan', format('%s, %s', v.customer_name, to_char(p_scheduled_at at time zone v_dept.timezone, 'DD-MM HH24:MI')),
    '/chat?c=' || v_group, 'new_assignment', jsonb_build_object('visit_id', v_id));
  return v_id;
end;
$$;

-- p_outcome: done | no_show | cancelled. 'done' is also logged in the CRM as a site_visit.
create or replace function public.mkc_sales_visit_result(p_visit_id uuid, p_outcome text, p_interest text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.mkc_sales_visits%rowtype;
  v_dept public.mkc_chat_departments%rowtype;
  v_p public.prospects%rowtype;
  v_fu uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_name text;
begin
  select * into v from public.mkc_sales_visits where id = p_visit_id for update;
  if not found then raise exception 'Kunjungan tidak ditemukan'; end if;
  select * into v_dept from public.mkc_chat_departments where id = v.department_id;
  v_p := public.mkc_sales_prospect_access(v_dept, v.prospect_id);
  if v.status <> 'scheduled' then raise exception 'Kunjungan ini sudah diisi'; end if;
  if coalesce(p_outcome, '') not in ('done', 'no_show', 'cancelled') then raise exception 'Hasil tidak dikenal'; end if;
  if p_outcome = 'done' then
    if v_note is null then raise exception 'Tulis hasil kunjungannya'; end if;
    v_fu := public.crm_add_follow_up(v.prospect_id, 'site_visit', (v.scheduled_at at time zone v_dept.timezone)::date,
      (v.scheduled_at at time zone v_dept.timezone)::time,
      format('Kunjungan lokasi%s: %s', case when p_interest is not null then ' (minat ' || p_interest || ')' else '' end, v_note));
  end if;
  update public.mkc_sales_visits set status = p_outcome, interest = p_interest, result_note = v_note, follow_up_id = v_fu where id = p_visit_id;
  select full_name into v_name from public.employees where id = auth.uid();
  perform public.mkc_chat_post(v.conversation_id, 'system',
    format('%s Kunjungan %s: %s%s', case p_outcome when 'done' then '✅' when 'no_show' then '⚠️' else '🚫' end, v_p.customer_name,
      case p_outcome when 'done' then 'selesai' when 'no_show' then 'tidak datang' else 'dibatalkan' end, coalesce(' — ' || left(v_note, 200), '')),
    'visit', p_visit_id, jsonb_build_object('status', p_outcome), 'visit_result:' || p_visit_id, auth.uid());
end;
$$;

create or replace function public.mkc_sales_daily_report_submit(
  p_department_code text, p_items jsonb, p_follow_ups integer, p_visits integer, p_hot integer, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype := public.mkc_connect_department(p_department_code);
  v_group uuid := public.mkc_hosp_group_id(v_dept.id);
  v_items jsonb := '{}'::jsonb;
  v_k text;
  v_id uuid;
  v_msg uuid;
  v_name text;
  v_date date := public.mkc_hosp_local_date(v_dept.id);
begin
  perform public.mkc_hosp_require_role(v_dept.id, array['sales']);
  foreach v_k in array public.mkc_sales_daily_items() loop
    if coalesce(jsonb_typeof(p_items -> v_k), 'missing') <> 'boolean' then raise exception 'Poin "%" belum diisi', v_k; end if;
    v_items := v_items || jsonb_build_object(v_k, (p_items ->> v_k)::boolean);
  end loop;
  if exists (select 1 from public.mkc_sales_daily_reports where department_id = v_dept.id and sales_id = auth.uid() and report_date = v_date) then
    raise exception 'Laporan hari ini sudah dikirim';
  end if;
  insert into public.mkc_sales_daily_reports (department_id, conversation_id, sales_id, report_date, items, follow_ups, visits, hot_prospects, notes)
  values (v_dept.id, v_group, auth.uid(), v_date, v_items, p_follow_ups, p_visits, p_hot, nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_id;
  select full_name into v_name from public.employees where id = auth.uid();
  v_msg := public.mkc_chat_post(v_group, 'work_report',
    format('📝 Laporan harian %s: %s follow-up, %s kunjungan, %s prospek panas', v_name, p_follow_ups, p_visits, p_hot),
    'daily_report', v_id, '{}'::jsonb, 'daily:' || v_id, auth.uid());
  update public.mkc_sales_daily_reports set message_id = v_msg where id = v_id;
  return v_id;
end;
$$;

-- New CRM leads of the branch (ad routing, CRM page) and Loonars 2 booking /
-- fee status changes appear in the group once each (idempotent).
create or replace function public.mkc_sales_sync()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept record;
  v_group uuid;
  r record;
  v_changed integer := 0;
  v_before uuid;
begin
  for v_dept in select * from public.mkc_chat_departments where code = 'sales_jogja' and is_active loop
    v_group := public.mkc_hosp_group_id(v_dept.id);

    for r in
      select p.id, p.customer_name, p.house_type, p.city, p.lead_source, p.sales_id, e.full_name as sales_name
      from public.prospects p left join public.employees e on e.id = p.sales_id
      where p.branch_id = v_dept.branch_id and p.deleted_at is null and p.created_at >= v_dept.created_at
        and not exists (select 1 from public.mkc_chat_messages m where m.conversation_id = v_group and m.dedupe_key = 'lead:' || p.id)
    loop
      perform public.mkc_chat_post(v_group, 'task',
        format('🆕 Lead baru: %s (%s, %s) — sales %s', r.customer_name, coalesce(r.house_type, '-'), coalesce(r.city, '-'), coalesce(r.sales_name, 'belum ada')),
        'prospect', r.id, jsonb_build_object('lead_source', r.lead_source), 'lead:' || r.id);
      perform public.mkc_hosp_notify(array[r.sales_id], 'Lead baru: ' || left(r.customer_name, 60), 'Hubungi dalam 24 jam',
        '/chat?c=' || v_group, 'follow_up_reminder', jsonb_build_object('prospect_id', r.id));
      v_changed := v_changed + 1;
    end loop;

    for r in
      select pu.id, pu.status, pu.transaction_type, pu.reject_reason, u.blok, e.full_name as sales_name, pu.marketing_employee_id
      from public.loonars_unit_purchases pu
      join public.loonars_units u on u.id = pu.unit_id
      join public.loonars_projects pr on pr.id = u.project_id
      left join public.employees e on e.id = pu.marketing_employee_id
      where pr.kode = coalesce(v_dept.settings ->> 'siteplan_project_kode', 'LNR2') and pu.updated_at >= v_dept.created_at
    loop
      select id into v_before from public.mkc_chat_messages where conversation_id = v_group and dedupe_key = format('purchase:%s:%s', r.id, r.status);
      if v_before is null then
        perform public.mkc_chat_post(v_group, case when r.status = 'verified' then 'alert' else 'system' end,
          format('%s Unit %s — %s (%s)%s',
            case r.status when 'verified' then '🎉' when 'rejected' then '❌' else '🧾' end, r.blok,
            case r.status when 'verified' then 'tanda jadi TERVERIFIKASI Finance' when 'rejected' then 'tanda jadi DITOLAK Finance'
                          when 'pending_verification' then 'tanda jadi masuk, menunggu verifikasi Finance' else r.status end,
            coalesce(r.sales_name, '-'), coalesce(': ' || r.reject_reason, '')),
          'purchase', r.id, jsonb_build_object('status', r.status), format('purchase:%s:%s', r.id, r.status));
        v_changed := v_changed + 1;
      end if;
    end loop;
  end loop;
  return v_changed;
end;
$$;

-- ----------------------------------------------------------------------------
-- Card data for the chat UI (no phone numbers, no buyer identity documents)
-- ----------------------------------------------------------------------------
create or replace function public.mkc_sales_cards(p_department_code text, p_prospect_ids uuid[], p_visit_ids uuid[], p_purchase_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype := public.mkc_connect_department(p_department_code);
begin
  if not public.mkc_hosp_can_view_department(v_dept.id) then raise exception 'Tidak punya akses' using errcode = '42501'; end if;
  return jsonb_build_object(
    'prospects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.customer_name, 'city', p.city, 'house_type', p.house_type, 'lead_source', p.lead_source,
        'status', p.status, 'temperature', p.lead_temperature, 'sales_id', p.sales_id, 'created_at', p.created_at,
        'last_follow_up_at', p.last_follow_up_at,
        'follow_ups', (select count(*) from public.prospect_follow_ups f where f.prospect_id = p.id),
        'next_visit_at', (select min(scheduled_at) from public.mkc_sales_visits v where v.prospect_id = p.id and v.status = 'scheduled')))
      from public.prospects p
      where p.id = any (coalesce(p_prospect_ids, '{}')) and p.branch_id = v_dept.branch_id and p.deleted_at is null), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'prospect_id', v.prospect_id, 'prospect_name', p.customer_name, 'sales_id', v.sales_id,
        'scheduled_at', v.scheduled_at, 'status', v.status, 'interest', v.interest, 'note', v.note, 'result_note', v.result_note))
      from public.mkc_sales_visits v join public.prospects p on p.id = v.prospect_id
      where v.id = any (coalesce(p_visit_ids, '{}')) and v.department_id = v_dept.id), '[]'::jsonb),
    'purchases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pu.id, 'blok', u.blok, 'tipe', u.tipe, 'status', pu.status, 'transaction_type', pu.transaction_type,
        'marketing_employee_id', pu.marketing_employee_id, 'transaction_date', pu.transaction_date,
        'booking_fee', pu.booking_fee, 'verified_at', pu.verified_at, 'reject_reason', pu.reject_reason,
        'fee_status', (select fr.status from public.loonars_unit_fee_requests fr where fr.purchase_id = pu.id order by fr.created_at desc limit 1)))
      from public.loonars_unit_purchases pu join public.loonars_units u on u.id = pu.unit_id
      where pu.id = any (coalesce(p_purchase_ids, '{}'))), '[]'::jsonb)
  );
end;
$$;

-- "What needs doing" for the Sales group panel.
create or replace function public.mkc_sales_open_work(p_department_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype := public.mkc_connect_department(p_department_code);
  v_stale integer;
  v_first integer;
begin
  if not public.mkc_hosp_can_view_department(v_dept.id) then raise exception 'Tidak punya akses' using errcode = '42501'; end if;
  v_stale := coalesce((v_dept.settings ->> 'lead_stale_days')::integer, 3);
  v_first := coalesce((v_dept.settings ->> 'lead_first_contact_hours')::integer, 24);
  return jsonb_build_object(
    'leads', coalesce((
      select jsonb_agg(x order by x.overdue desc, x.created_at desc) from (
        select p.id, p.customer_name as name, p.house_type, p.city, p.status, p.lead_temperature as temperature, p.sales_id,
               p.created_at, p.last_follow_up_at,
               case when p.last_follow_up_at is null then p.created_at < now() - make_interval(hours => v_first)
                    else p.last_follow_up_at < now() - make_interval(days => v_stale) end as overdue
        from public.prospects p
        where p.branch_id = v_dept.branch_id and p.deleted_at is null and p.status in ('red', 'yellow', 'green')
          and (p.created_at >= now() - interval '90 days' or p.last_follow_up_at >= now() - interval '90 days')
        limit 150) x), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'prospect_id', v.prospect_id, 'prospect_name', p.customer_name, 'sales_id', v.sales_id,
                                          'scheduled_at', v.scheduled_at, 'status', v.status) order by v.scheduled_at)
      from public.mkc_sales_visits v join public.prospects p on p.id = v.prospect_id
      where v.department_id = v_dept.id and v.status = 'scheduled'), '[]'::jsonb),
    'units', coalesce((
      select jsonb_object_agg(s, n) from (
        select u.status as s, count(*) as n from public.loonars_units u join public.loonars_projects pr on pr.id = u.project_id
        where pr.kode = coalesce(v_dept.settings ->> 'siteplan_project_kode', 'LNR2') group by u.status) t), '{}'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Report snapshots (service role only; computed in lib/connect/*-report.ts)
-- ----------------------------------------------------------------------------
create or replace function public.mkc_mkt_report_snapshot(p_department_id uuid, p_from timestamptz, p_to timestamptz, p_local_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
  v_branch uuid := (select branch_id from public.mkc_chat_departments where id = p_department_id);
begin
  begin
    v := v || jsonb_build_object('content', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'planned_date', c.planned_date, 'title', c.title, 'platform', c.platform, 'format', c.format,
        'topic', c.topic, 'status', c.status, 'pic_id', c.pic_id, 'published_at', c.published_at, 'published_url', c.published_url))
      from public.mkc_mkt_content_plans c
      where c.department_id = p_department_id
        and (c.planned_date between p_local_date - 7 and p_local_date + 14
             or (c.status not in ('published', 'cancelled') and c.planned_date < p_local_date))), '[]'::jsonb)));
  exception when others then v := v || jsonb_build_object('content', jsonb_build_object('ok', false, 'error', sqlerrm)); end;

  begin
    v := v || jsonb_build_object('kols', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'kol_handle', k.kol_handle, 'status', k.status, 'nights', coalesce(k.approved_nights, k.nights),
        'requested_checkin', k.requested_checkin, 'approved_checkin', k.approved_checkin, 'approved_unit_nomor', k.approved_unit_nomor,
        'voucher_kode', k.voucher_kode, 'voucher_valid_until', k.voucher_valid_until, 'booked_checkin', k.booked_checkin,
        'content_due_at', k.content_due_at, 'deliverables', to_jsonb(k.deliverables), 'deliverables_done', k.deliverables_done,
        'created_at', k.created_at, 'decided_at', k.decided_at, 'completed_at', k.completed_at, 'created_by', k.created_by))
      from public.mkc_mkt_kol_collabs k
      where k.department_id = p_department_id
        and (k.status not in ('completed', 'cancelled', 'rejected') or k.updated_at >= p_from)), '[]'::jsonb)));
  exception when others then v := v || jsonb_build_object('kols', jsonb_build_object('ok', false, 'error', sqlerrm)); end;

  -- Existing Markom publishing pipeline (AI review + auto-publish), same branch.
  begin
    v := v || jsonb_build_object('submissions', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', jsonb_build_object(
      'published', (select count(*) from public.markom_content_submissions s where s.branch_id = v_branch and s.deleted_at is null
                     and s.published_at >= p_from and s.published_at < p_to),
      'failed', (select count(*) from public.markom_content_submissions s where s.branch_id = v_branch and s.deleted_at is null
                  and s.status = 'failed' and s.updated_at >= p_from and s.updated_at < p_to)
    )));
  exception when others then v := v || jsonb_build_object('submissions', jsonb_build_object('ok', false, 'error', sqlerrm)); end;
  return v;
end;
$$;

create or replace function public.mkc_sales_report_snapshot(p_department_id uuid, p_from timestamptz, p_to timestamptz, p_local_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb := '{}'::jsonb;
  v_dept public.mkc_chat_departments%rowtype;
  v_group uuid;
  v_month_start date := date_trunc('month', p_local_date)::date;
begin
  select * into v_dept from public.mkc_chat_departments where id = p_department_id;
  v_group := public.mkc_hosp_group_id(p_department_id);

  begin
    v := v || jsonb_build_object('sales', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.employee_id, 'role', m.member_role)) from public.mkc_chat_members m
      where m.conversation_id = v_group and m.removed_at is null), '[]'::jsonb)));
  exception when others then v := v || jsonb_build_object('sales', jsonb_build_object('ok', false, 'error', sqlerrm)); end;

  begin
    v := v || jsonb_build_object('leads', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'sales_id', p.sales_id, 'status', p.status, 'temperature', p.lead_temperature,
        'created_at', p.created_at, 'last_follow_up_at', p.last_follow_up_at, 'lead_source', p.lead_source))
      from public.prospects p
      where p.branch_id = v_dept.branch_id and p.deleted_at is null
        and (p.created_at >= p_from or (p.status in ('red', 'yellow', 'green')
             and (p.created_at >= now() - interval '90 days' or p.last_follow_up_at >= now() - interval '90 days')))), '[]'::jsonb)));
  exception when others then v := v || jsonb_build_object('leads', jsonb_build_object('ok', false, 'error', sqlerrm)); end;

  begin
    v := v || jsonb_build_object('follow_ups', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', coalesce((
      select jsonb_object_agg(created_by, n) from (
        select f.created_by, count(*) n from public.prospect_follow_ups f join public.prospects p on p.id = f.prospect_id
        where p.branch_id = v_dept.branch_id and f.created_at >= p_from and f.created_at < p_to group by f.created_by) t), '{}'::jsonb)));
  exception when others then v := v || jsonb_build_object('follow_ups', jsonb_build_object('ok', false, 'error', sqlerrm)); end;

  begin
    v := v || jsonb_build_object('visits', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', coalesce((
      select jsonb_agg(jsonb_build_object('id', vi.id, 'sales_id', vi.sales_id, 'status', vi.status, 'scheduled_at', vi.scheduled_at, 'interest', vi.interest))
      from public.mkc_sales_visits vi where vi.department_id = p_department_id
        and (vi.scheduled_at >= p_from - interval '1 day' or vi.status = 'scheduled')), '[]'::jsonb)));
  exception when others then v := v || jsonb_build_object('visits', jsonb_build_object('ok', false, 'error', sqlerrm)); end;

  begin
    v := v || jsonb_build_object('daily_reports', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', coalesce((
      select jsonb_agg(jsonb_build_object('sales_id', d.sales_id, 'follow_ups', d.follow_ups, 'visits', d.visits, 'hot', d.hot_prospects))
      from public.mkc_sales_daily_reports d where d.department_id = p_department_id and d.report_date = p_local_date), '[]'::jsonb)));
  exception when others then v := v || jsonb_build_object('daily_reports', jsonb_build_object('ok', false, 'error', sqlerrm)); end;

  begin
    v := v || jsonb_build_object('siteplan', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', jsonb_build_object(
      'units', coalesce((select jsonb_object_agg(s, n) from (
          select u.status s, count(*) n from public.loonars_units u join public.loonars_projects pr on pr.id = u.project_id
          where pr.kode = coalesce(v_dept.settings ->> 'siteplan_project_kode', 'LNR2') group by u.status) t), '{}'::jsonb),
      'purchases', coalesce((select jsonb_agg(jsonb_build_object('id', pu.id, 'status', pu.status, 'marketing_employee_id', pu.marketing_employee_id,
          'transaction_date', pu.transaction_date, 'verified_at', pu.verified_at, 'created_at', pu.created_at, 'blok', u.blok))
        from public.loonars_unit_purchases pu join public.loonars_units u on u.id = pu.unit_id join public.loonars_projects pr on pr.id = u.project_id
        where pr.kode = coalesce(v_dept.settings ->> 'siteplan_project_kode', 'LNR2')
          and (pu.status = 'pending_verification' or pu.created_at >= v_month_start or pu.verified_at >= v_month_start)), '[]'::jsonb)
    )));
  exception when others then v := v || jsonb_build_object('siteplan', jsonb_build_object('ok', false, 'error', sqlerrm)); end;

  begin
    v := v || jsonb_build_object('targets', jsonb_build_object('ok', true, 'fetched_at', now(), 'data', coalesce((
      select jsonb_object_agg(t.sales_id, t.target_units) from public.sales_targets t
      join public.mkc_chat_members m on m.employee_id = t.sales_id and m.conversation_id = v_group and m.removed_at is null
      where t.period_year = extract(year from p_local_date)::int and t.period_month = extract(month from p_local_date)::int), '{}'::jsonb)));
  exception when others then v := v || jsonb_build_object('targets', jsonb_build_object('ok', false, 'error', sqlerrm)); end;
  return v;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS + grants
-- ----------------------------------------------------------------------------
alter table public.mkc_mkt_kol_collabs enable row level security;
alter table public.mkc_mkt_content_plans enable row level security;
alter table public.mkc_sales_visits enable row level security;
alter table public.mkc_sales_daily_reports enable row level security;

create policy mkc_mkt_kol_collabs_select on public.mkc_mkt_kol_collabs for select using (public.mkc_hosp_can_view_department(department_id));
create policy mkc_mkt_content_plans_select on public.mkc_mkt_content_plans for select using (public.mkc_hosp_can_view_department(department_id));
create policy mkc_sales_visits_select on public.mkc_sales_visits for select using (public.mkc_hosp_can_view_department(department_id));
create policy mkc_sales_daily_reports_select on public.mkc_sales_daily_reports for select using (public.mkc_hosp_can_view_department(department_id));

revoke execute on function
  public.mkc_connect_department(text),
  public.mkc_sales_prospect_access(public.mkc_chat_departments, uuid),
  public.mkc_mkt_sync_kol(),
  public.mkc_sales_sync(),
  public.mkc_mkt_report_snapshot(uuid, timestamptz, timestamptz, date),
  public.mkc_sales_report_snapshot(uuid, timestamptz, timestamptz, date),
  public.mkc_sales_daily_items()
from public, anon, authenticated;

revoke execute on function
  public.mkc_mkt_content_create(text, date, text, text, text, text, text, uuid, uuid),
  public.mkc_mkt_content_update(uuid, text, date, text, uuid, text),
  public.mkc_mkt_kol_create(text, text, text, integer, text, text, date, integer, text[], text),
  public.mkc_mkt_kol_decide(uuid, text, uuid, date, integer, text),
  public.mkc_mkt_kol_update(uuid, text, text, text, text),
  public.mkc_sales_post_lead(text, uuid),
  public.mkc_sales_follow_up(text, uuid, text, text),
  public.mkc_sales_visit_schedule(text, uuid, timestamptz, text),
  public.mkc_sales_visit_result(uuid, text, text, text),
  public.mkc_sales_daily_report_submit(text, jsonb, integer, integer, integer, text),
  public.mkc_sales_cards(text, uuid[], uuid[], uuid[]),
  public.mkc_sales_open_work(text)
from public, anon;

grant execute on function
  public.mkc_mkt_content_create(text, date, text, text, text, text, text, uuid, uuid),
  public.mkc_mkt_content_update(uuid, text, date, text, uuid, text),
  public.mkc_mkt_kol_create(text, text, text, integer, text, text, date, integer, text[], text),
  public.mkc_mkt_kol_decide(uuid, text, uuid, date, integer, text),
  public.mkc_mkt_kol_update(uuid, text, text, text, text),
  public.mkc_sales_post_lead(text, uuid),
  public.mkc_sales_follow_up(text, uuid, text, text),
  public.mkc_sales_visit_schedule(text, uuid, timestamptz, text),
  public.mkc_sales_visit_result(uuid, text, text, text),
  public.mkc_sales_daily_report_submit(text, jsonb, integer, integer, integer, text),
  public.mkc_sales_cards(text, uuid[], uuid[], uuid[]),
  public.mkc_sales_open_work(text)
to authenticated;

alter publication supabase_realtime add table public.mkc_mkt_kol_collabs;
alter publication supabase_realtime add table public.mkc_mkt_content_plans;
alter publication supabase_realtime add table public.mkc_sales_visits;

select cron.schedule('connect-markom-sales-sync', '3,13,23,33,43,53 * * * *', $$select public.mkc_mkt_sync_kol(); select public.mkc_sales_sync();$$);

select public.mkc_chat_sync_members();
