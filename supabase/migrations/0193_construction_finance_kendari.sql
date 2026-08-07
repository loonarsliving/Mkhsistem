-- ============================================================================
-- MK Connect — 0193: Construction project finance (dana proyek pembangunan)
--
-- New, branch-scoped module for a Kepala Cabang running a physical
-- construction project (currently Kendari only): tracks the cash allocated
-- to the project (construction_projects + construction_fund_transfers) and
-- the two kinds of spend a Kepala Cabang inputs directly, single simple
-- form:
--   - gaji_tukang: cash paid out of the project's own dana (reduces balance).
--   - pembelian_material: always bought on credit from a hardware store
--     ("utang toko bangunan") -- does NOT reduce cash balance, tracked as a
--     separate payable settled later when the store invoice is actually paid.
--
-- Deliberately separate from hr_expenses/payroll (0056) and salary_input
-- (0189) -- this is project-cash bookkeeping a Kepala Cabang runs for a
-- specific physical build, not company payroll or reimbursement.
--
-- Mirrors the salary_input pattern throughout: RPC-gated writes only (no
-- direct insert/update policy), security definer, branch scope re-checked
-- server-side, Super Admin notified on every fund transfer + new expense.
-- ============================================================================

create table public.construction_projects (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  name text not null,
  total_budget numeric(14, 2) not null check (total_budget > 0),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index construction_projects_branch_idx on public.construction_projects (branch_id);

create table public.construction_fund_transfers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  amount numeric(14, 2) not null check (amount > 0),
  transfer_date date not null default current_date,
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index construction_fund_transfers_project_idx on public.construction_fund_transfers (project_id);

create table public.construction_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  expense_type text not null check (expense_type in ('gaji_tukang', 'pembelian_material')),
  -- gaji_tukang: worker's name. pembelian_material: hardware store name.
  party_name text not null,
  description text,
  amount numeric(14, 2) not null check (amount > 0),
  -- gaji_tukang is always cash out of the project's own dana; pembelian_material
  -- is always utang (credit) to the store -- see header note.
  payment_method text not null check (payment_method in ('cash', 'utang')),
  is_settled boolean not null default false,
  settled_at timestamptz,
  settled_by uuid references public.employees(id),
  expense_date date not null default current_date,
  photo_url text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index construction_expenses_project_idx on public.construction_expenses (project_id);
create index construction_expenses_type_idx on public.construction_expenses (expense_type);

alter table public.construction_projects enable row level security;
alter table public.construction_fund_transfers enable row level security;
alter table public.construction_expenses enable row level security;

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('construction_finance.view_own', 'View own branch''s construction project dana, fund transfers, and expenses'),
  ('construction_finance.submit', 'Input gaji tukang / pembelian material (utang toko) against own branch''s construction project'),
  ('construction_finance.manage', 'Allocate project budget, record fund transfers, and settle utang toko for any branch')
on conflict (key) do nothing;

-- Granted at the role level (every branch shares "Kepala Cabang"), scoped in
-- practice by branch_id checks inside the RPCs below, same pattern as
-- salary_input.submit. Session-level nav visibility is further restricted to
-- Kendari only for now via lib/rbac/session.ts (CONSTRUCTION_FINANCE_BRANCH_IDS).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'kepala_cabang' and p.key in ('construction_finance.view_own', 'construction_finance.submit')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key in ('super_admin', 'direktur_operasional', 'finance') and p.key = 'construction_finance.manage'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key in ('super_admin', 'direktur_operasional', 'finance') and p.key = 'construction_finance.view_own'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS: own branch, or anyone holding the manage permission (sees every branch).
-- No direct insert/update policy -- all writes go through the RPCs below.
-- ----------------------------------------------------------------------------
create policy construction_projects_select on public.construction_projects for select
  using (
    public.app_has_permission('construction_finance.manage')
    or branch_id = (select branch_id from public.employees where id = auth.uid())
  );

create policy construction_fund_transfers_select on public.construction_fund_transfers for select
  using (
    public.app_has_permission('construction_finance.manage')
    or branch_id = (select branch_id from public.employees where id = auth.uid())
  );

create policy construction_expenses_select on public.construction_expenses for select
  using (
    public.app_has_permission('construction_finance.manage')
    or branch_id = (select branch_id from public.employees where id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Notification category additions.
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
    -- This migration
    'construction_expense_submitted'
  ]));

-- Restated verbatim from the live function (as of 0191 -- individual
-- salary_transfer_request/salary_transferred WA pushes were replaced by the
-- batched salary_transfer_summary there) plus this migration's one addition.
create or replace function public.mkc_notifications_whatsapp_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
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
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation',
    'task_pending_verification',
    'daily_motivation', 'daily_report',
    'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning',
    'meta_ads_balance_low',
    'lead_wants_info',
    'loonars_fee_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled',
    'content_review_pending',
    'salary_transfer_summary',
    -- This migration -- Super Admin sees every gaji tukang / utang toko input as it happens.
    'construction_expense_submitted'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- construction_submit_expense(): the Kepala Cabang's one simple form --
-- gaji tukang (cash) or pembelian material (utang toko bangunan).
-- ----------------------------------------------------------------------------
create or replace function public.construction_submit_expense(
  p_project_id uuid,
  p_expense_type text,
  p_party_name text,
  p_amount numeric,
  p_description text default null,
  p_expense_date date default current_date,
  p_photo_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_branch uuid;
  v_project public.construction_projects%rowtype;
  v_id uuid;
  v_payment_method text;
  v_admin record;
begin
  if not public.app_has_permission('construction_finance.submit') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if p_expense_type not in ('gaji_tukang', 'pembelian_material') then
    raise exception 'Jenis pengeluaran tidak valid';
  end if;

  select * into v_project from public.construction_projects where id = p_project_id and status = 'active';
  if not found then
    raise exception 'Proyek tidak ditemukan atau sudah tidak aktif';
  end if;

  select branch_id into v_caller_branch from public.employees where id = v_caller;

  if not public.app_has_permission('construction_finance.manage') and v_project.branch_id is distinct from v_caller_branch then
    raise exception 'Proyek ini bukan bagian dari cabang Anda' using errcode = '42501';
  end if;

  if p_party_name is null or trim(p_party_name) = '' then
    raise exception 'Nama %s wajib diisi', case when p_expense_type = 'gaji_tukang' then 'tukang' else 'toko bangunan' end;
  end if;

  v_payment_method := case when p_expense_type = 'gaji_tukang' then 'cash' else 'utang' end;

  insert into public.construction_expenses (
    project_id, branch_id, expense_type, party_name, description, amount,
    payment_method, expense_date, photo_url, created_by
  )
  values (
    p_project_id, v_project.branch_id, p_expense_type, trim(p_party_name), nullif(trim(p_description), ''), p_amount,
    v_payment_method, coalesce(p_expense_date, current_date), p_photo_url, v_caller
  )
  returning id into v_id;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'construction_expense_submitted',
      case when p_expense_type = 'gaji_tukang' then 'Input Gaji Tukang — ' || v_project.name else 'Input Pembelian Material (Utang) — ' || v_project.name end,
      case when p_expense_type = 'gaji_tukang'
        then '👷 Tukang: ' || trim(p_party_name) || E'\n💰 Nominal: Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        else '🏪 Toko: ' || trim(p_party_name) || E'\n💰 Nominal (utang): Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
      end || coalesce(E'\n📝 ' || nullif(trim(p_description), ''), ''),
      '/construction-finance',
      jsonb_build_object('expense_id', v_id, 'project_id', p_project_id, 'expense_type', p_expense_type)
    );
  end loop;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- construction_settle_expense(): Super Admin/Finance marks a "utang toko"
-- line as actually paid to the store.
-- ----------------------------------------------------------------------------
create or replace function public.construction_settle_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.construction_expenses
    set is_settled = true, settled_by = v_caller, settled_at = now()
    where id = p_id and payment_method = 'utang' and is_settled = false;

  if not found then
    raise exception 'Utang tidak ditemukan atau sudah lunas';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- construction_record_fund_transfer(): Super Admin/Finance records dana that
-- was actually transferred to the branch's construction project.
-- ----------------------------------------------------------------------------
create or replace function public.construction_record_fund_transfer(
  p_project_id uuid,
  p_amount numeric,
  p_transfer_date date default current_date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.construction_projects%rowtype;
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_project from public.construction_projects where id = p_project_id;
  if not found then
    raise exception 'Proyek tidak ditemukan';
  end if;

  insert into public.construction_fund_transfers (project_id, branch_id, amount, transfer_date, note, created_by)
  values (p_project_id, v_project.branch_id, p_amount, coalesce(p_transfer_date, current_date), nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Seed: Kendari construction project -- dana proyek Rp200.000.000
-- disetujui, Rp50.000.000 sudah ditransfer untuk memulai progres.
-- ----------------------------------------------------------------------------
do $$
declare
  v_branch_id uuid;
  v_project_id uuid;
begin
  select id into v_branch_id from public.branches where name = 'Kendari';
  if v_branch_id is null then
    raise exception 'Kendari branch not found';
  end if;

  insert into public.construction_projects (branch_id, name, total_budget, status)
  values (v_branch_id, 'Pembangunan Cabang Kendari', 200000000, 'active')
  returning id into v_project_id;

  insert into public.construction_fund_transfers (project_id, branch_id, amount, transfer_date, note)
  values (v_project_id, v_branch_id, 50000000, current_date, 'Transfer awal untuk memulai progres pembangunan');
end $$;
