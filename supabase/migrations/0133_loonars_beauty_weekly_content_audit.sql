-- ============================================================================
-- MK Connect — 0133: Give Loonars Beauty its own scored Content Audit
--
-- Owner noticed Content Audit only ever covered leasehold -- correct:
-- social_weekly_evaluations/auditWeeklyContentPerformance (0111) is
-- property-only. Beauty's existing loonars_weekly_evaluations
-- (evaluateLoonarsWeeklyPerformance, 0107) is a DIFFERENT thing -- a
-- content-ratio-vs-target + order-performance narrative, not a per-post
-- hook/value/CTA/niche-fit/engagement/platform-optimization SCORE the way
-- Content Audit shows for property. This adds that missing piece for
-- beauty as its own parallel table or growth, scored from Beauty's own
-- real Zernio per-post data (0126) -- never merged with property's table
-- or reasoning, same separation as everywhere else.
-- ============================================================================

create table public.loonars_beauty_weekly_content_audits (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  evaluation text not null,
  audit jsonb not null,
  created_at timestamptz not null default now()
);
create unique index loonars_beauty_weekly_content_audits_week_start_key on public.loonars_beauty_weekly_content_audits (week_start);

alter table public.loonars_beauty_weekly_content_audits enable row level security;
create policy loonars_beauty_weekly_content_audits_select on public.loonars_beauty_weekly_content_audits for select to authenticated
  using (public.app_has_permission('loonars_beauty.view'));

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison', 'competitor_discovery',
    'loonars_beauty_competitor_comparison', 'loonars_beauty_content_ideas_draft',
    'investor_intelligence_refresh', 'cashflow_intelligence_refresh',
    'sales_teaching_weekly', 'cashflow_action_plan',
    'loonars_beauty_weekly_content_audit'
  ));

-- Monday 01:50 UTC (09:50 WITA) -- between loonars-beauty-weekly-evaluation-
-- dispatch (0112, 01:45) and loonars-beauty-competitor-comparison-dispatch
-- (0126, 02:00), same relative ordering property uses (weekly eval, then
-- audit, then comparison).
create or replace function public.loonars_beauty_run_weekly_content_audit_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_job_queue (job_type, payload) values ('loonars_beauty_weekly_content_audit', '{}'::jsonb);
end;
$$;

select cron.schedule('loonars-beauty-weekly-content-audit-dispatch', '50 1 * * 1', $$select public.loonars_beauty_run_weekly_content_audit_dispatch();$$);

create or replace function public.loonars_beauty_request_weekly_content_audit()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('loonars_beauty.manage') then
    raise exception 'permission denied';
  end if;

  insert into public.ai_job_queue (job_type, payload) values ('loonars_beauty_weekly_content_audit', '{}'::jsonb);
end;
$$;

grant execute on function public.loonars_beauty_request_weekly_content_audit() to authenticated;
