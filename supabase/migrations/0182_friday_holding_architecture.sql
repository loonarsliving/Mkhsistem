-- ============================================================================
-- MK Connect — 0182: FRIDAY Holding Architecture (multi-business)
--
-- FRIDAY was built reading one company. This makes it read a group, without
-- changing anything about how it reads the first one.
--
-- The premise, stated so a future migration does not quietly violate it:
-- every business in the holding keeps its own dashboard, its own database,
-- its own automations, its own users, and its own choice of operational
-- system. Villa may run a PMS, Kos a dashboard, Developer runs MK Connect, and
-- a hotel will run whatever a hotel runs. FRIDAY is the executive layer ABOVE
-- them. It is NOT the source of truth, NOT an ERP, and must never become the
-- system a business is forced to adopt in order to be visible to leadership.
--
-- Three deliberate choices in this schema, each protecting that premise:
--
-- 1. NO OPERATIONAL DATA LIVES HERE. holding_businesses stores how to REACH a
--    business, never what the business contains. There is no revenue table, no
--    bookings table, no per-unit ledger. The moment FRIDAY starts storing a
--    business's records, that business can no longer leave, and the
--    independence above becomes a slogan.
--
-- 2. THE GROUP BRIEFING REUSES friday_briefings. A holding briefing is a
--    briefing -- same seven sections, same check constraint requiring them,
--    same actions table, same console. Only `scope` widens and one jsonb
--    column is added. A separate friday_holding_briefings table would have
--    doubled every future change to the briefing contract for no gain.
--
-- 3. CREDENTIALS ARE NAMED, NOT STORED. connector_config carries the NAME of
--    an environment variable (authEnvVar), never a token. Every holder of
--    holding.view can read this table; a bearer token written into that jsonb
--    would be a credential published to all of them. See lib/ai/friday/
--    connectors/http.ts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Permissions
--
-- Split for the same reason friday.view and friday.action_decide are split:
-- reading the group's performance and being able to point FRIDAY at a new
-- endpoint are different powers. holding.manage can change what URL this
-- server fetches on a schedule, which is why it is not bundled into view.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('holding.view', 'View the holding group view: business registry, group briefings, cross-business comparison'),
  ('holding.manage', 'Register, edit, activate or deactivate a business unit and its connector configuration')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('holding.view', 'holding.manage')
where r.key in ('super_admin', 'direktur_utama')
on conflict do nothing;

-- Direktur Operasional reads the group but does not re-wire it.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'holding.view'
where r.key = 'direktur_operasional'
on conflict do nothing;

-- Consistent with 0177/0179: the private assistant sees everything the
-- principal sees and changes nothing.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'holding.view'
where r.key = 'private_assistant'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- holding_businesses — the registry. One row per business unit in the group.
--
-- This table is the whole of "1 business or 1000". Onboarding a new unit is an
-- INSERT; it is not a schema change, not a Brain change, and for any business
-- that can serve JSON, not a code change either.
-- ----------------------------------------------------------------------------
create table if not exists public.holding_businesses (
  id uuid primary key default gen_random_uuid(),

  -- Stable machine key. This is what FRIDAY's analysis refers to a unit by, so
  -- it is immutable in practice: renaming it orphans the business_health
  -- entries of every past briefing.
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (length(trim(name)) > 0),

  -- Open-ended on purpose. The vision names Developer/Villa/Homestay/Kos/
  -- Hotel/Coffee Shop and then says "bisnis masa depan" -- a check constraint
  -- listing today's types would make the next business a migration.
  business_type text not null check (length(trim(business_type)) > 0),

  -- Human-readable note about which system actually owns this unit's data.
  -- Documentation, not configuration -- but the single most useful thing to
  -- have written down when someone asks "where does this number come from".
  source_system text,

  status text not null default 'active' check (status in ('active', 'inactive')),

  connector_kind text not null check (connector_kind in ('internal_mkh', 'http')),
  connector_config jsonb not null default '{}'::jsonb,

  display_order int not null default 100,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An http connector with no baseUrl is a business that silently never
  -- reports. Refuse it at write time rather than discover it in a briefing.
  constraint holding_businesses_http_needs_base_url check (
    connector_kind <> 'http' or (connector_config ? 'baseUrl')
  )
);

create index if not exists holding_businesses_active_idx
  on public.holding_businesses (status, display_order);

comment on table public.holding_businesses is
  'Registry of business units in the holding. Stores how to REACH a business (connector), never what the business contains -- each unit keeps its own source of truth. Adding a unit is an INSERT, not a schema or Brain change.';
comment on column public.holding_businesses.connector_config is
  'Per-kind connector settings. For http: baseUrl, snapshotPath, automationsPath, runAutomationPath, authEnvVar, timeoutMs. authEnvVar is the NAME of an env var -- never the token itself; this column is readable by every holding.view holder.';

drop trigger if exists holding_businesses_set_updated_at on public.holding_businesses;
create trigger holding_businesses_set_updated_at
  before update on public.holding_businesses
  for each row execute function public.set_updated_at();

alter table public.holding_businesses enable row level security;

drop policy if exists holding_businesses_select on public.holding_businesses;
create policy holding_businesses_select on public.holding_businesses
  for select using (public.app_has_permission('holding.view'));

-- Writes go through server actions running as service_role, which bypass RLS.
-- No client-side insert/update path exists, deliberately: connector_config
-- decides what URL this server fetches on a schedule, so it is changed through
-- a permission-checked server action or not at all.

-- ----------------------------------------------------------------------------
-- friday_briefings: widen scope, add the group dimension.
--
-- Existing rows are untouched and existing behaviour is unchanged -- 'company'
-- remains the default and still means "MKH System, all branches", exactly as
-- migration 0179 defined it.
-- ----------------------------------------------------------------------------
alter table public.friday_briefings drop constraint if exists friday_briefings_scope_check;
alter table public.friday_briefings add constraint friday_briefings_scope_check
  check (scope in ('company', 'branch', 'business', 'holding'));

alter table public.friday_briefings
  add column if not exists business_id uuid references public.holding_businesses(id) on delete set null;

-- Per-unit verdicts for a holding briefing: one entry per business, including
-- the ones whose data could not be read.
alter table public.friday_briefings
  add column if not exists business_health jsonb not null default '[]'::jsonb;

comment on column public.friday_briefings.business_health is
  'Holding-scope only: one entry per business unit ({business_key, status, ringkasan, temuan_utama, prioritas}). A unit whose connector was unreachable is recorded as data_tidak_tersedia, never as a failing unit.';

alter table public.friday_briefings drop constraint if exists friday_briefings_business_scope;
alter table public.friday_briefings add constraint friday_briefings_business_scope
  check (scope <> 'business' or business_id is not null);

create index if not exists friday_briefings_scope_recent_idx
  on public.friday_briefings (scope, created_at desc);

-- ----------------------------------------------------------------------------
-- Register the first business: MK Connect itself.
--
-- The Developer unit reaches FRIDAY through the same connector interface every
-- future unit will (lib/ai/friday/connectors/internal-mkh.ts). That is what
-- makes the abstraction real rather than a wrapper written in anticipation --
-- unit #1 already goes through it.
-- ----------------------------------------------------------------------------
insert into public.holding_businesses (key, name, business_type, source_system, connector_kind, connector_config, display_order, notes)
values (
  'developer',
  'Developer — PT Maha Karya Haluoleo',
  'developer',
  'MK Connect (MKH System)',
  'internal_mkh',
  '{}'::jsonb,
  10,
  'Unit pertama. Dibaca langsung dari database MK Connect lewat InternalMkhConnector, bukan lewat HTTP.'
)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Job type + schedule
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
  'friday_executive_briefing',
  'friday_holding_briefing'
));

/**
 * Row first, then the job -- same ordering and same reason as
 * friday_enqueue_daily_briefing() (0179): a job lost to dead_letter must leave
 * a visible failed briefing rather than an empty page indistinguishable from a
 * quiet day.
 */
create or replace function public.friday_enqueue_holding_briefing()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_briefing_id uuid;
begin
  -- No active business, nothing to compare. Returning quietly is right here:
  -- an empty registry is a setup state, not a failure worth alerting on.
  if not exists (select 1 from public.holding_businesses where status = 'active') then
    return;
  end if;

  if exists (
    select 1 from public.friday_briefings
    where scope = 'holding'
      and trigger_source = 'scheduled'
      and created_at >= date_trunc('day', now() at time zone 'Asia/Makassar') at time zone 'Asia/Makassar'
  ) then
    return;
  end if;

  insert into public.friday_briefings (scope, trigger_source, status)
  values ('holding', 'scheduled', 'pending')
  returning id into v_briefing_id;

  insert into public.ai_job_queue (job_type, payload)
  values ('friday_holding_briefing', jsonb_build_object('briefing_id', v_briefing_id));
end;
$$;

-- Same lesson as T10 (0181): the default PUBLIC execute grant would expose
-- this as an anonymous PostgREST RPC that enqueues an AI job.
revoke all on function public.friday_enqueue_holding_briefing() from public, anon, authenticated;
grant execute on function public.friday_enqueue_holding_briefing() to service_role;

-- 23:15 UTC = 07:15 WITA -- 45 minutes after the unit-level briefing, so the
-- group report is read second and the two never contend for the same Gemini
-- window. Still clear of the Monday 01:00-02:00 UTC burst (T5).
select cron.schedule(
  'friday-holding-briefing-daily',
  '15 23 * * *',
  $$select public.friday_enqueue_holding_briefing();$$
);
