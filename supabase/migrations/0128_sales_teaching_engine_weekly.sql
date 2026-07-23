-- ============================================================================
-- MK Connect — 0128: AI Knowledge & Teaching Engine (3/4) — Sales Teaching
-- Engine (weekly branch coaching for Kepala Cabang)
--
-- Owner's ask: every week, Gemini evaluates the branch's real performance
-- and produces a Weekly Coaching package Kepala Cabang can use directly as
-- the material for that week's Sales meeting/briefing -- branch condition,
-- biggest opportunity, mistakes to fix, coaching material, an organic-
-- activity checklist, weekly targets, KPIs, and work priorities
-- (generateWeeklySalesTeaching, lib/ai/domains/sales-teaching.ts).
--
-- Deliberately BRANCH-level (one message covering the whole Sales team),
-- not per-sales-rep like crm_run_sales_coaching (0101) -- that one nudges
-- an individual rep with 0 closings; this one gives Kepala Cabang a single
-- weekly briefing for the whole team, grounded in the Investor Intelligence
-- knowledge bank (0126) since Jogja's only real product is villa leasehold
-- investment.
--
-- Scope is explicit and narrow per the owner's ask: ONLY Jogja, ONLY villa
-- leasehold (Jogja/Loonars Living has no rumah subsidi/komersial product).
-- Reuses the exact "does this branch have an active villa project" check
-- markom_run_ai_checklist_dispatch (0121) already uses, rather than
-- hardcoding "Jogja" as a magic string with no underlying business meaning
-- -- today that still resolves to Jogja alone, tomorrow it stays correct
-- automatically if that ever changes.
--
-- No UI anywhere (this module must never appear in any menu, per the
-- owner's explicit ask) -- delivered as a direct WhatsApp text to Kepala
-- Cabang only (sendWhatsAppText, no mkc_notifications row), same
-- zero-UI-trace pattern as sales_closing_tips_broadcast (0117).
-- ============================================================================

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison', 'competitor_discovery', 'investor_intelligence_refresh',
    'cashflow_intelligence_refresh',
    -- This migration
    'sales_teaching_weekly'
  ));

-- ----------------------------------------------------------------------------
-- crm_sales_teaching_log: idempotency guard, mirrors crm_sales_coaching_log
-- (0101) -- one row per branch per dispatch, so a cron rerun in the same
-- window never double-sends the week's briefing.
-- ----------------------------------------------------------------------------
create table public.crm_sales_teaching_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index crm_sales_teaching_log_branch_idx on public.crm_sales_teaching_log (branch_id, created_at desc);
alter table public.crm_sales_teaching_log enable row level security;

comment on table public.crm_sales_teaching_log is
  'One row per Sales Teaching Engine weekly briefing sent (crm_run_sales_teaching_weekly) -- throttles to at most once every 6 days per branch.';

create or replace function public.crm_run_sales_teaching_weekly()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch record;
begin
  for v_branch in
    select distinct b.id, b.name
    from public.branches b
    join public.crm_projects cp on cp.branch_id = b.id
    where b.deleted_at is null and b.is_active = true
      and cp.is_active = true and cp.project_type = 'villa'
  loop
    if not exists (
      select 1 from public.crm_sales_teaching_log
      where branch_id = v_branch.id and created_at >= now() - interval '6 days'
    ) then
      insert into public.ai_job_queue (job_type, payload)
      values ('sales_teaching_weekly', jsonb_build_object('branch_id', v_branch.id, 'branch_name', v_branch.name));

      insert into public.crm_sales_teaching_log (branch_id) values (v_branch.id);
    end if;
  end loop;
end;
$$;

comment on function public.crm_run_sales_teaching_weekly is
  'Weekly: enqueues a sales_teaching_weekly job (branch-wide Weekly Coaching for Kepala Cabang -> generateWeeklySalesTeaching) for every branch with an active villa-leasehold project -- today, only Jogja. Delivered via WhatsApp only, never via mkc_notifications/UI.';

-- Sunday 23:00 UTC (Monday 07:00 WITA) -- lands in Kepala Cabang's WhatsApp
-- before the work week starts, ready to use in Monday's Sales meeting.
select cron.schedule('crm-sales-teaching-weekly', '0 23 * * 0', $$select public.crm_run_sales_teaching_weekly();$$);
