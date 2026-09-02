-- ============================================================================
-- MK Connect — 0252: Tax Planning
--
-- Reads mkh-properti's real jurnal (its own, separate Supabase project --
-- see lib/tax-planning/mkh-properti-client.ts) and computes an ESTIMATE of
-- PPh Badan (corporate income tax), split correctly between:
--   - revenue from selling land & building (rumah), which is FINAL PPh
--     Pasal 4(2) under PP 34/2016 (2.5% of gross transfer value) and does
--     NOT belong in the normal PPh Badan base, and
--   - everything else, taxed under the normal regime (with the Pasal 31E
--     small-business rate discount) or, if legally eligible, PP 55/2022's
--     0.5% final-turnover regime -- whichever is cheaper.
--
-- Same separation of powers as FRIDAY (0179): every number here is computed
-- deterministically in lib/tax-planning/calculator.ts, never by the AI
-- model (lib/ai/domains/tax-planning.ts only narrates numbers it is handed).
-- A computed analysis produces `proposals` rows born 'proposed' -- nothing
-- is ever filed, submitted, or acted on automatically. Only a human holding
-- tax_planning.decide can mark a proposal accepted/rejected, and even an
-- accepted proposal is explicitly still just planning input for a licensed
-- tax consultant to validate before it touches an actual SPT filing -- this
-- module never talks to DJP/e-Filing or any tax authority system.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Permissions
--
-- Split the same way FRIDAY is: viewing an estimate, running a new one, and
-- deciding what to do with a proposal are different powers. .configure is
-- its own permission because it edits fiscal facts (prior-year loss
-- balance, UMKM facility years used) that directly change every future
-- computation -- a different power from just running one.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('tax_planning.view', 'View Tax Planning analyses and proposed strategies'),
  ('tax_planning.run', 'Trigger a new Tax Planning analysis from mkh-properti''s jurnal'),
  ('tax_planning.decide', 'Accept or reject a proposed Tax Planning strategy'),
  ('tax_planning.configure', 'Edit Tax Planning fiscal configuration (loss carryforward, UMKM facility status)')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'tax_planning.view', 'tax_planning.run', 'tax_planning.decide'
) where r.key in ('super_admin', 'direktur_utama', 'direktur_operasional', 'finance')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'tax_planning.configure'
where r.key in ('super_admin', 'finance')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- tax_planning_fiscal_config — the facts the ledger alone can't tell us.
--
-- Singleton row (fixed id) rather than a real table of rows: there is one
-- company, one set of books, one fiscal position to track. A prior-year
-- fiscal loss balance and how many of the 3 UMKM-facility years have been
-- used are matters of the company's actual filed SPT history, not something
-- derivable from mkh-properti's jurnal -- so this is a manual, reviewed
-- input, not computed.
-- ----------------------------------------------------------------------------
create table if not exists public.tax_planning_fiscal_config (
  id text primary key default 'default' check (id = 'default'),

  fiscal_loss_carryforward_idr numeric not null default 0 check (fiscal_loss_carryforward_idr >= 0),
  fiscal_loss_expiry_note text,

  -- Calendar year the company first became eligible to elect PP 55/2022's
  -- final 0.5% regime; null = unknown/not yet confirmed. Combined with
  -- umkm_final_tax_years_used, calculator.ts derives remaining eligibility
  -- (capped at 3 tax years for a badan usaha).
  umkm_final_tax_first_eligible_year integer,
  umkm_final_tax_years_used integer not null default 0 check (umkm_final_tax_years_used >= 0),

  annual_turnover_threshold_idr numeric not null default 50000000000 check (annual_turnover_threshold_idr > 0),

  notes text,
  updated_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.tax_planning_fiscal_config (id) values ('default') on conflict (id) do nothing;

alter table public.tax_planning_fiscal_config enable row level security;

create policy tax_planning_fiscal_config_select on public.tax_planning_fiscal_config
  for select to authenticated
  using (public.app_has_permission('tax_planning.view'));

-- ----------------------------------------------------------------------------
-- tax_planning_analyses — one run of the calculator against a period.
--
-- computed_result mirrors lib/tax-planning/calculator.ts's TaxComputationResult
-- verbatim, so any figure shown in the UI can be traced back to exactly what
-- was computed and when -- same "keep the raw signal, not just the
-- conclusion" reasoning as friday_briefings.signals.
-- ----------------------------------------------------------------------------
create table if not exists public.tax_planning_analyses (
  id uuid primary key default gen_random_uuid(),

  period_start date not null,
  period_end date not null,

  status text not null default 'ready' check (status in ('ready', 'failed')),
  computed_result jsonb not null default '{}'::jsonb,
  narrative text,
  error_detail text,

  requested_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint tax_planning_analyses_period_valid check (period_end >= period_start),
  constraint tax_planning_analyses_ready_is_complete check (status <> 'ready' or computed_result <> '{}'::jsonb)
);

create index if not exists tax_planning_analyses_recent_idx
  on public.tax_planning_analyses (created_at desc);

alter table public.tax_planning_analyses enable row level security;

create policy tax_planning_analyses_select on public.tax_planning_analyses
  for select to authenticated
  using (public.app_has_permission('tax_planning.view'));

-- ----------------------------------------------------------------------------
-- tax_planning_proposals — one surfaced strategy from one analysis.
--
-- strategy_key is constrained to the fixed candidate set
-- lib/tax-planning/calculator.ts can produce (see its TaxProposalCandidate
-- union type) -- same reasoning as friday_actions.action_key: the set of
-- things this module can ever propose is fixed by code, not by a prompt.
-- requires_professional_review defaults true and nothing in this module
-- ever flips it false -- every strategy here is explicitly framed as input
-- to a licensed tax consultant, never a final answer.
-- ----------------------------------------------------------------------------
create table if not exists public.tax_planning_proposals (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tax_planning_analyses(id) on delete cascade,

  strategy_key text not null check (strategy_key in (
    'final_tax_reclassification',
    'fiscal_loss_carryforward',
    'regime_comparison_31e_umkm',
    'unclassified_account_review',
    'rsh_ppn_exemption_check',
    'depreciation_method_review'
  )),

  title text not null check (length(trim(title)) > 0),
  description text not null check (length(trim(description)) > 0),
  estimated_impact_idr numeric,
  confidence text not null default 'sedang' check (confidence in ('tinggi', 'sedang', 'rendah')),
  requires_professional_review boolean not null default true,

  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'needs_review')),
  decided_by uuid references public.employees(id) on delete set null,
  decided_at timestamptz,
  decision_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tax_planning_proposals_decision_is_attributed check (
    status = 'proposed' or (decided_by is not null and decided_at is not null)
  )
);

create index if not exists tax_planning_proposals_analysis_idx
  on public.tax_planning_proposals (analysis_id, created_at desc);

alter table public.tax_planning_proposals enable row level security;

create policy tax_planning_proposals_select on public.tax_planning_proposals
  for select to authenticated
  using (public.app_has_permission('tax_planning.view'));

-- Writes to all three tables go through the service-role client from
-- features/tax-planning/actions (requirePermission() gates the call
-- server-side first) -- same convention as friday_briefings/friday_actions
-- in 0179, so there is deliberately no RLS insert/update policy for
-- authenticated here.
