-- ============================================================================
-- MK Connect — 0126: Loonars Beauty gets its own Zernio account + full pipeline
--
-- Owner is connecting a SECOND Zernio account (separate ZERNIO_BEAUTY_API_KEY
-- env var, set directly in Vercel) dedicated to Loonars Beauty's own
-- Instagram/TikTok -- keeps both product lines on Zernio's free tier (2
-- connected accounts each) instead of sharing one account's allowance.
--
-- This wires Beauty into the EXACT SAME pipeline property already has:
-- account snapshot capture -> AI competitor comparison -> AI content-idea
-- generation informed by real performance + the comparison's gaps. Property
-- and beauty stay fully separate (own Zernio client, own comparison table,
-- own AI domain module/system prompt) -- only the pattern is shared, never
-- the data or reasoning, same separation already enforced everywhere else
-- (knowledge bank 0117, competitor accounts 0125).
-- ============================================================================

-- social_account_snapshots now holds both product lines' own-account
-- performance -- product_line splits them so a property query never
-- accidentally averages in beauty's numbers or vice versa.
alter table public.social_account_snapshots
  add column product_line text not null default 'property'
    check (product_line in ('property', 'beauty'));

drop policy social_account_snapshots_select on public.social_account_snapshots;
create policy social_account_snapshots_select on public.social_account_snapshots for select to authenticated
  using (
    (product_line = 'beauty' and public.app_has_permission('loonars_beauty.view'))
    or (product_line <> 'beauty' and public.app_has_permission('content_planner.view'))
  );

-- ----------------------------------------------------------------------------
-- loonars_beauty_competitor_comparisons: Beauty's own version of
-- social_leasehold_competitor_comparisons (0124) -- our real Loonars Beauty
-- content vs registered beauty competitors (social_competitor_accounts,
-- content_focus='beauty', 0125).
-- ----------------------------------------------------------------------------
create table public.loonars_beauty_competitor_comparisons (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  narrative text not null,
  comparison jsonb not null,
  created_at timestamptz not null default now()
);
create index loonars_beauty_competitor_comparisons_generated_at_idx
  on public.loonars_beauty_competitor_comparisons (generated_at desc);

alter table public.loonars_beauty_competitor_comparisons enable row level security;
create policy loonars_beauty_competitor_comparisons_select on public.loonars_beauty_competitor_comparisons for select to authenticated
  using (public.app_has_permission('loonars_beauty.view'));

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison', 'competitor_discovery',
    'loonars_beauty_competitor_comparison', 'loonars_beauty_content_ideas_draft'
  ));

-- Automatic weekly dispatch -- Monday 02:00 UTC (10:00 WITA), after
-- loonars-beauty-weekly-evaluation-dispatch (0112, 01:45 UTC) and well after
-- competitor-discovery-dispatch (0125, Sunday) so fresh competitors exist.
create or replace function public.loonars_beauty_run_competitor_comparison_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_job_queue (job_type, payload) values ('loonars_beauty_competitor_comparison', '{}'::jsonb);
end;
$$;

select cron.schedule('loonars-beauty-competitor-comparison-dispatch', '0 2 * * 1', $$select public.loonars_beauty_run_competitor_comparison_dispatch();$$);

create or replace function public.loonars_beauty_request_competitor_comparison()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('loonars_beauty.manage') then
    raise exception 'permission denied';
  end if;

  insert into public.ai_job_queue (job_type, payload) values ('loonars_beauty_competitor_comparison', '{}'::jsonb);
end;
$$;

grant execute on function public.loonars_beauty_request_competitor_comparison() to authenticated;

-- Content-idea generation -- Beauty's equivalent of markom_checklist_draft
-- (0070/0121): real Zernio performance + the freshly-generated competitor
-- comparison feed straight into 3 concrete content ideas, inserted directly
-- into loonars_content_items (status='idea') for the team to pick up.
-- Monday 02:15 UTC, 15 min after the comparison above so it can use that
-- run's gaps/recommendations.
create or replace function public.loonars_beauty_run_content_ideas_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_job_queue (job_type, payload) values ('loonars_beauty_content_ideas_draft', '{}'::jsonb);
end;
$$;

select cron.schedule('loonars-beauty-content-ideas-dispatch', '15 2 * * 1', $$select public.loonars_beauty_run_content_ideas_dispatch();$$);

create or replace function public.loonars_beauty_request_content_ideas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('loonars_beauty.manage') then
    raise exception 'permission denied';
  end if;

  insert into public.ai_job_queue (job_type, payload) values ('loonars_beauty_content_ideas_draft', '{}'::jsonb);
end;
$$;

grant execute on function public.loonars_beauty_request_content_ideas() to authenticated;
