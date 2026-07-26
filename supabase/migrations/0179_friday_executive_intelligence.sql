-- ============================================================================
-- MK Connect — 0179: FRIDAY, the Executive Intelligence Layer
--
-- MK Connect already answers questions. LEON (lib/ai/domains/prompts.ts) routes
-- an inbound WhatsApp message to one domain prompt — HR, Markom, CRM, Loonars —
-- and answers it well, inside that domain. data-queries.ts grounds those
-- answers in real numbers. Three intelligence banks (investor, cashflow,
-- occupancy) research their own subject weekly and feed their own teaching
-- engine.
--
-- What none of that does is look at the company as one thing. Ad spend rising
-- while lead quality falls is two healthy-looking domain reports and one real
-- problem; nobody currently reads both in the same sentence. That is the gap
-- FRIDAY fills: one layer above the domains that reads across all of them,
-- reasons about cause rather than value, and writes down what it would do.
--
-- FRIDAY PROPOSES. PEOPLE DECIDE. THE SYSTEM EXECUTES.
--
-- This separation is the whole design, and it is deliberate — the same call
-- made in 0177, where private_assistant was given company-wide visibility and
-- zero approval authority, for the reason stated there: if the assistant could
-- approve, the audit trail would record decisions under a principal who never
-- saw them. FRIDAY reads further and reasons harder than any role in the
-- system, which makes that reasoning *more* important to keep separable from
-- the authority to act, not less. So:
--
--   * friday_briefings holds analysis. Analysis is never an instruction.
--   * friday_actions rows are born 'proposed'. Only a human holding
--     friday.action_decide moves one to 'approved', and only then does
--     anything execute.
--   * every action must name a key from the code-side catalog
--     (lib/ai/friday/action-catalog.ts). A model that invents an action name
--     produces a row that fails its own check constraint. The set of things
--     FRIDAY can ask for is fixed by engineers, not by a prompt.
--
-- Scheduling note: the daily briefing runs 22:30 UTC (06:30 WITA), chosen to
-- sit clear of the Monday 01:00–02:00 UTC weekly burst documented as T5 in
-- docs/AUTOMATION.md, where ~33 AI jobs already queue behind one Gemini key
-- and one global circuit breaker. Adding the executive briefing to that window
-- would have made the one report leadership reads first the most likely one to
-- fail.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Permissions
--
-- Split in two on purpose. Reading FRIDAY's analysis and authorizing FRIDAY's
-- actions are different powers, and the second one is the one that spends
-- money and sends messages to customers.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('friday.view', 'View FRIDAY executive briefings, cross-domain analysis, and proposed actions'),
  ('friday.action_decide', 'Approve or reject an action proposed by FRIDAY'),
  ('friday.run', 'Trigger an on-demand FRIDAY analysis outside the daily schedule')
on conflict (key) do nothing;

-- Decision-makers: read, run, and decide.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'friday.view', 'friday.action_decide', 'friday.run'
) where r.key in ('super_admin', 'direktur_utama', 'direktur_operasional')
on conflict do nothing;

-- The private assistant reads and may run an analysis, but decides nothing --
-- consistent with every other permission that role holds (0177).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'friday.view', 'friday.run'
) where r.key = 'private_assistant'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- friday_briefings — one executive analysis.
--
-- The seven columns situasi..hasil_diharapkan are the output contract FRIDAY
-- is held to, stored as columns rather than one blob so that a briefing which
-- came back missing its risk section is a visibly broken row instead of a
-- paragraph nobody notices is absent.
--
-- `signals` keeps the raw cross-domain snapshot the analysis was computed
-- from. Without it, a briefing from three weeks ago is an unfalsifiable
-- opinion; with it, anyone can check whether FRIDAY read the numbers right.
-- ----------------------------------------------------------------------------
create table if not exists public.friday_briefings (
  id uuid primary key default gen_random_uuid(),

  -- 'company' reads every branch; a branch-scoped briefing narrows every
  -- signal to one branch so a Kepala Cabang view stays possible later without
  -- a schema change.
  scope text not null default 'company' check (scope in ('company', 'branch')),
  branch_id uuid references public.branches(id) on delete set null,

  trigger_source text not null default 'scheduled' check (trigger_source in ('scheduled', 'manual')),
  requested_by uuid references public.employees(id) on delete set null,

  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),

  -- Populated only when status = 'ready'.
  headline text,
  severity text check (severity in ('normal', 'perhatian', 'kritis')),
  situasi text,
  analisa text,
  risiko text,
  solusi jsonb not null default '[]'::jsonb,
  rekomendasi text,
  hasil_diharapkan text,

  signals jsonb not null default '{}'::jsonb,
  model_note text,
  error_detail text,

  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A 'ready' briefing with no situasi is a silent failure wearing a success
  -- label. Refuse it at the database rather than render an empty card.
  constraint friday_briefings_ready_is_complete check (
    status <> 'ready'
    or (situasi is not null and analisa is not null and risiko is not null and rekomendasi is not null)
  ),
  constraint friday_briefings_branch_scope check (scope <> 'branch' or branch_id is not null)
);

create index if not exists friday_briefings_recent_idx
  on public.friday_briefings (created_at desc);
create index if not exists friday_briefings_status_idx
  on public.friday_briefings (status, created_at desc);

-- ----------------------------------------------------------------------------
-- friday_actions — what FRIDAY would do, and what a human said about it.
--
-- action_key is constrained to the catalog in lib/ai/friday/action-catalog.ts.
-- Keeping the list in a check constraint (rather than validating only in TypeScript)
-- means an action can never be persisted by any path -- server action, job
-- processor, future integration -- that the catalog does not know how to run.
-- When the catalog gains an entry, this constraint is amended in the same
-- migration; the drift is caught by tests/unit/lib/friday-action-catalog.test.ts.
-- ----------------------------------------------------------------------------
create table if not exists public.friday_actions (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.friday_briefings(id) on delete cascade,

  action_key text not null check (action_key in (
    'notify_leadership_whatsapp',
    'notify_branch_head_whatsapp',
    'enqueue_cashflow_action_plan',
    'enqueue_sales_coaching',
    'enqueue_markom_checklist_draft',
    'enqueue_meta_ads_research',
    'enqueue_content_performance_broadcast',
    'enqueue_occupancy_teaching',
    'create_assistant_followup'
  )),

  title text not null check (length(trim(title)) > 0),
  rationale text not null check (length(trim(rationale)) > 0),

  -- 'low' runs a read/draft/notify path; 'medium' writes something a person
  -- will act on; 'high' spends money or reaches a customer. The UI orders and
  -- warns by this, and nothing but a human ever sets an action moving.
  risk_tier text not null default 'medium' check (risk_tier in ('low', 'medium', 'high')),

  payload jsonb not null default '{}'::jsonb,

  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'rejected', 'executed', 'failed')),
  decided_by uuid references public.employees(id) on delete set null,
  decided_at timestamptz,
  executed_at timestamptz,
  execution_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Anything past 'proposed' must name the person who moved it. This is the
  -- column that makes the audit trail mean something.
  constraint friday_actions_decision_is_attributed check (
    status = 'proposed' or (decided_by is not null and decided_at is not null)
  )
);

create index if not exists friday_actions_briefing_idx
  on public.friday_actions (briefing_id, created_at);
create index if not exists friday_actions_open_idx
  on public.friday_actions (status, created_at desc) where status = 'proposed';

-- ----------------------------------------------------------------------------
-- RLS
--
-- Reads are gated on friday.view. Writes are not granted to anyone through
-- RLS at all: briefings are written by the job processor and actions are
-- transitioned by server actions, both of which run as service_role and
-- bypass these policies. There is deliberately no client-side insert path --
-- a briefing that a browser could create is a briefing that did not come from
-- the analysis pipeline.
-- ----------------------------------------------------------------------------
alter table public.friday_briefings enable row level security;
alter table public.friday_actions enable row level security;

drop policy if exists friday_briefings_select on public.friday_briefings;
create policy friday_briefings_select on public.friday_briefings
  for select using (public.app_has_permission('friday.view'));

drop policy if exists friday_actions_select on public.friday_actions;
create policy friday_actions_select on public.friday_actions
  for select using (public.app_has_permission('friday.view'));

drop trigger if exists friday_briefings_set_updated_at on public.friday_briefings;
create trigger friday_briefings_set_updated_at
  before update on public.friday_briefings
  for each row execute function public.set_updated_at();

drop trigger if exists friday_actions_set_updated_at on public.friday_actions;
create trigger friday_actions_set_updated_at
  before update on public.friday_actions
  for each row execute function public.set_updated_at();

comment on table public.friday_briefings is
  'FRIDAY executive intelligence briefings — cross-domain analysis (situasi/analisa/risiko/solusi/rekomendasi/hasil) plus the raw signal snapshot it was computed from. Written only by the AI job processor.';
comment on table public.friday_actions is
  'Actions FRIDAY proposed off a briefing. Born ''proposed''; only a human holding friday.action_decide approves one, and only an approved row ever executes. action_key is constrained to lib/ai/friday/action-catalog.ts.';
comment on column public.friday_briefings.signals is
  'Raw cross-domain snapshot (CRM/ads/finance/HR/markom/automation) the analysis was based on — kept so a past briefing can be audited against the numbers it actually saw.';

-- ----------------------------------------------------------------------------
-- Job type + daily schedule
-- ----------------------------------------------------------------------------
alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check check (job_type in (
  'whatsapp_ai_reply',
  'crm_sp1_draft',
  'markom_checklist_draft',
  'meta_ads_launch',
  'meta_ads_research',
  'social_weekly_evaluation',
  'crm_sales_coaching',
  'loonars_beauty_weekly_evaluation',
  'knowledge_bank_refresh',
  'sales_closing_tips_broadcast',
  'leasehold_competitor_comparison',
  'competitor_discovery',
  'loonars_beauty_competitor_comparison',
  'loonars_beauty_content_ideas_draft',
  'investor_intelligence_refresh',
  'cashflow_intelligence_refresh',
  'sales_teaching_weekly',
  'cashflow_action_plan',
  'loonars_beauty_weekly_content_audit',
  'markom_content_performance_broadcast',
  'occupancy_intelligence_refresh',
  'occupancy_teaching_biweekly',
  'content_submission_review',
  'kontenai_auto_produce',
  'kontenai_auto_bridge_to_studio',
  'zernio_publish_reconcile',
  'friday_executive_briefing'
));

/**
 * Creates the pending briefing row first, then queues the job that fills it.
 *
 * Row-first is what makes a failed analysis visible: if the AI job dies in
 * dead_letter, the briefing is still there in 'pending'/'failed' and the
 * console shows leadership that today's read did not happen. Queue-first
 * would have made a lost job indistinguishable from a quiet day.
 */
create or replace function public.friday_enqueue_daily_briefing()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_briefing_id uuid;
begin
  -- Guard against a double-schedule or a manual re-run landing on top of the
  -- scheduled one: if today's company briefing already exists, do nothing.
  if exists (
    select 1 from public.friday_briefings
    where scope = 'company'
      and trigger_source = 'scheduled'
      and created_at >= date_trunc('day', now() at time zone 'Asia/Makassar') at time zone 'Asia/Makassar'
  ) then
    return;
  end if;

  insert into public.friday_briefings (scope, trigger_source, status)
  values ('company', 'scheduled', 'pending')
  returning id into v_briefing_id;

  insert into public.ai_job_queue (job_type, payload)
  values ('friday_executive_briefing', jsonb_build_object('briefing_id', v_briefing_id));
end;
$$;

grant execute on function public.friday_enqueue_daily_briefing() to service_role;

select cron.schedule(
  'friday-executive-briefing-daily',
  '30 22 * * *',
  $$select public.friday_enqueue_daily_briefing();$$
);
