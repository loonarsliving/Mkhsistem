-- ============================================================================
-- MK Connect — 0124: AI comparative analysis vs leasehold competitor content
--
-- Phase 2 of the Content Planner roadmap (Zernio integration, see 0122's
-- header): compare our own real recent Instagram/TikTok content
-- (lib/social/zernio.ts) against the registered leasehold competitors
-- (social_competitor_accounts, 0085) -- AI researches their public content
-- itself via Google Search grounding when no manual log exists yet (same
-- resilience pattern already used by researchAndGenerateChecklist), and
-- also uses any real social_competitor_content_logs entries when present.
-- Output feeds two places: its own card on the Content Planner's Leasehold
-- tab, and (via ContentPlannerContext.competitorComparison in markom.ts)
-- straight into the next leasehold_sales checklist generation, closing the
-- loop the owner originally asked for: "perbandingan2 dgan konten leasehold
-- lain ... untuk menghasilkan checklist konten baru yg lebih powerfull."
-- ============================================================================

create table public.social_leasehold_competitor_comparisons (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  narrative text not null,
  comparison jsonb not null,
  created_at timestamptz not null default now()
);
create index social_leasehold_competitor_comparisons_generated_at_idx
  on public.social_leasehold_competitor_comparisons (generated_at desc);

alter table public.social_leasehold_competitor_comparisons enable row level security;

create policy social_leasehold_competitor_comparisons_select on public.social_leasehold_competitor_comparisons for select to authenticated
  using (public.app_has_permission('content_planner.view'));

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison'
  ));

-- Automatic weekly dispatch -- Monday 01:15 UTC (09:15 WITA), 15 minutes
-- after social-weekly-evaluation-dispatch (0086) so this run can reference
-- that week's just-generated audit scores too.
create or replace function public.social_run_leasehold_competitor_comparison_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_job_queue (job_type, payload) values ('leasehold_competitor_comparison', '{}'::jsonb);
end;
$$;

select cron.schedule('leasehold-competitor-comparison-dispatch', '15 1 * * 1', $$select public.social_run_leasehold_competitor_comparison_dispatch();$$);

-- Manual trigger (button on the Content Planner's Leasehold tab) -- same
-- SECURITY DEFINER wrapper pattern as markom_request_ads_research (0082)
-- and loonars_beauty_request_weekly_evaluation (0112), since ai_job_queue
-- has no authenticated-role RLS policy of its own.
create or replace function public.markom_request_leasehold_competitor_comparison()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('content_planner.manage') then
    raise exception 'permission denied';
  end if;

  insert into public.ai_job_queue (job_type, payload) values ('leasehold_competitor_comparison', '{}'::jsonb);
end;
$$;

grant execute on function public.markom_request_leasehold_competitor_comparison() to authenticated;
