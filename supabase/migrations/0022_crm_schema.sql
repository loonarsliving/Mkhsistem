-- ============================================================================
-- MK Connect — 0022: CRM schema (prospects, follow-ups, payments, targets)
-- Table/column names verified collision-free against 0001-0021 (see
-- supabase/migrations/*.sql). `crm_projects` is prefixed because "project"
-- is a generic word likely to collide with a future Project Management
-- module in this same ERP; `prospects`/`prospect_*`/`sales_targets` are
-- unambiguous and left unprefixed, matching the existing convention that
-- only `mkc_*` tables are prefixed (and only because of a real collision
-- with another app on this shared Supabase project).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- crm_projects: property developments, referenced by the "Project" field on
-- a prospect. Simple reference data, managed by Director / Director of Ops.
-- ----------------------------------------------------------------------------
create table public.crm_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create unique index crm_projects_name_key on public.crm_projects (name);

-- ----------------------------------------------------------------------------
-- prospects: the company's customer database. Never hard-deleted (deleted_at
-- exists only for genuine admin cleanup of bad data) -- a resigning Sales
-- does not remove or orphan their prospects, since sales_id references
-- employees, which are themselves only ever soft-deleted.
-- ----------------------------------------------------------------------------
create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  -- Digits-only projection of `phone`, used for exact duplicate matching
  -- regardless of how the number was formatted on entry.
  phone_normalized text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored,
  project_id uuid references public.crm_projects(id) on delete set null,
  house_type text not null,
  city text not null,
  lead_source text not null check (lead_source in (
    'facebook_ads', 'instagram', 'tiktok', 'walk_in', 'referral', 'whatsapp', 'marketplace', 'other'
  )),
  notes text,
  -- red: new/no follow-up. yellow: actively being followed up.
  -- green: Sales claims ready -- waiting Finance verification, NOT closing.
  -- closing: Finance-approved, real money received. inactive: no follow-up
  -- for 30+ days (system-set).
  status text not null default 'red' check (status in ('red', 'yellow', 'green', 'closing', 'inactive')),
  sales_id uuid not null references public.employees(id) on delete restrict,
  -- Denormalized from employees.branch_id at creation time so branch-scoped
  -- RLS/reporting doesn't need to join through employees on every row.
  branch_id uuid not null references public.branches(id) on delete restrict,
  last_follow_up_at timestamptz,
  last_reminder_sent_at timestamptz,
  -- Both accrue only from Finance-approved payments (crm_approve_payment);
  -- never computed client-side ("no manual calculation").
  total_collection numeric(14,2) not null default 0,
  total_commission numeric(14,2) not null default 0,
  closed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
-- Exact-phone duplicate guard (partial: a soft-deleted record doesn't block
-- re-creating a genuinely new prospect with the same number).
create unique index prospects_phone_normalized_key on public.prospects (phone_normalized) where deleted_at is null;
create index prospects_customer_name_trgm_idx on public.prospects using gin (customer_name gin_trgm_ops);
create index prospects_sales_id_idx on public.prospects (sales_id);
create index prospects_branch_id_idx on public.prospects (branch_id);
create index prospects_status_idx on public.prospects (status);
create index prospects_lead_source_idx on public.prospects (lead_source);
create index prospects_last_follow_up_at_idx on public.prospects (last_follow_up_at);
create index prospects_closed_at_idx on public.prospects (closed_at);

-- ----------------------------------------------------------------------------
-- prospect_follow_ups: append-only activity log. No update/delete policy is
-- granted anywhere -- the Timeline must stay a true history.
-- ----------------------------------------------------------------------------
create table public.prospect_follow_ups (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  activity_type text not null check (activity_type in (
    'phone_call', 'whatsapp', 'meeting', 'survey', 'video_call', 'site_visit', 'negotiation'
  )),
  activity_date date not null default current_date,
  activity_time time,
  notes text,
  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now()
);
create index prospect_follow_ups_prospect_id_idx on public.prospect_follow_ups (prospect_id, created_at desc);

-- ----------------------------------------------------------------------------
-- prospect_payments: Finance-recorded incoming money. `commission_amount` is
-- snapshotted once at approval time (crm_approve_payment) using the sales
-- rep's commission_percent for that period, so every downstream report sums
-- the exact same number instead of re-deriving it differently in each view.
-- ----------------------------------------------------------------------------
create table public.prospect_payments (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  payment_type text not null check (payment_type in ('booking_fee', 'dp', 'installment', 'bank_disbursement')),
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  commission_amount numeric(14,2),
  notes text,
  recorded_by uuid not null references public.employees(id),
  approved_by uuid references public.employees(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);
create index prospect_payments_prospect_id_idx on public.prospect_payments (prospect_id);
create index prospect_payments_status_idx on public.prospect_payments (status);
create index prospect_payments_approved_at_idx on public.prospect_payments (approved_at);

-- ----------------------------------------------------------------------------
-- sales_targets: Director-set monthly unit target + commission % per Sales.
-- Achievement % and Ranking are always derived from this, never units sold.
-- ----------------------------------------------------------------------------
create table public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  sales_id uuid not null references public.employees(id) on delete cascade,
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null check (period_year between 2020 and 2100),
  target_units integer not null default 0 check (target_units >= 0),
  commission_percent numeric(5,2) not null default 0 check (commission_percent >= 0 and commission_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (sales_id, period_month, period_year)
);
create index sales_targets_sales_id_idx on public.sales_targets (sales_id);
create index sales_targets_period_idx on public.sales_targets (period_year, period_month);

-- Hook the new tables into the existing generic updated_at + audit_log
-- triggers (public.set_updated_at / public.audit_log_trigger, see 0006).
do $$
declare
  t text;
begin
  for t in select unnest(array['crm_projects', 'prospects', 'sales_targets']) loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t
    );
  end loop;
  for t in select unnest(array['crm_projects', 'prospects', 'prospect_follow_ups', 'prospect_payments', 'sales_targets']) loop
    execute format(
      'create trigger audit_log after insert or update or delete on public.%I for each row execute function public.audit_log_trigger()', t
    );
  end loop;
end;
$$;
