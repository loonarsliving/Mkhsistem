-- ============================================================================
-- MK Connect — 0127: AI Knowledge & Teaching Engine (2/4) — Cashflow
-- Intelligence knowledge bank
--
-- Mirror of 0126 (Investor Intelligence) for the company's cashflow-under-
-- pressure playbook: cashflow management, crisis management, burn rate
-- control, cost efficiency, payment prioritization, cash management,
-- revenue-growth tactics, staying operational on limited cash, and real
-- best practice from companies that survived financial pressure. Feeds the
-- Cashflow Teaching Engine (0129), which drafts the actual low-balance
-- Action Plan for Kepala Cabang Jogja -- this table only holds the
-- distilled general knowledge, not branch-specific numbers.
--
-- Same isolated shape as ai_investor_intelligence_bank: own table (not more
-- ai_knowledge_bank rows -- this is financial-strategy knowledge, not
-- marketing/platform knowledge, and is never read by the markom/crm chat
-- prompts), service-role only, one job per topic.
-- ============================================================================

create table public.ai_cashflow_intelligence_bank (
  id uuid primary key default gen_random_uuid(),
  topic text not null unique,
  title text not null,
  content text not null,
  researched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_cashflow_intelligence_bank is
  'Distilled cashflow/crisis-management knowledge (cashflow management, crisis management, burn rate control, cost efficiency, payment priority, revenue growth, staying operational on limited cash, resilience best practice), refreshed weekly via Gemini + Google Search grounding. Feeds the Cashflow Teaching Engine (finance_cashflow_action_plan_log / cashflow_action_plan job, 0129) -- never read by any chat prompt or UI.';

alter table public.ai_cashflow_intelligence_bank enable row level security;

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison', 'competitor_discovery', 'investor_intelligence_refresh',
    -- This migration
    'cashflow_intelligence_refresh'
  ));

create or replace function public.ai_run_cashflow_intelligence_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic text;
  v_topics text[] := array[
    'cashflow_management_strategy', 'financial_crisis_management', 'burn_rate_control',
    'cost_efficiency_strategy', 'payment_priority_strategy', 'cash_management_practice',
    'revenue_growth_strategy', 'operational_continuity_low_cash', 'cash_crisis_resilience_best_practice'
  ];
begin
  foreach v_topic in array v_topics loop
    insert into public.ai_job_queue (job_type, payload)
    values ('cashflow_intelligence_refresh', jsonb_build_object('topic', v_topic));
  end loop;
end;
$$;

comment on function public.ai_run_cashflow_intelligence_dispatch is
  'Enqueues one cashflow_intelligence_refresh job per topic -- each job does its own Gemini + Google Search call and upserts ai_cashflow_intelligence_bank, isolated so one topic failing does not block the others.';

-- Weekly, Monday 01:45 UTC (09:45 WITA) -- same morning as the investor
-- intelligence refresh (0126), offset 15 minutes to avoid both hammering
-- Gemini in the exact same instant.
select cron.schedule('ai-cashflow-intelligence-weekly-refresh', '45 1 * * 1', $$select public.ai_run_cashflow_intelligence_dispatch();$$);
