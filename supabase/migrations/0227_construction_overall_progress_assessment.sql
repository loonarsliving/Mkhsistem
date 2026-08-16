-- Owner's request: show the AI photo-progress assessment inside the
-- Keuangan Proyek Pembangunan module itself (not just the existing
-- Saturday WhatsApp report, 0199), as one overall building-progress
-- percentage -- refreshed (overwritten, not logged) every Saturday,
-- combining the block-level data already in the module (construction_
-- progress_photos' per-photo AI readings, same data
-- construction_send_progress_report already aggregates) with a second AI
-- synthesis pass across all blocks together.

create table public.construction_progress_assessments (
  project_code text primary key,
  assessed_at timestamptz not null default now(),
  overall_progress_pct int not null,
  summary text not null default '',
  concerns text[] not null default '{}',
  block_count int not null default 0,
  block_count_with_photos int not null default 0,
  block_snapshot jsonb not null default '[]'
);

alter table public.construction_progress_assessments enable row level security;
create policy construction_progress_assessments_select on public.construction_progress_assessments for select
  using (public.app_has_permission('construction_finance.manage'));
-- Written by the new cron-triggered route below with the service role
-- (bypasses RLS); read from the Construction Finance page via the normal
-- session-scoped client, gated by this select policy.

comment on table public.construction_progress_assessments is
  'One row per project_code, overwritten every Saturday -- AI-synthesized overall building progress %, combining all blocks'' latest per-photo Gemini Vision readings. Advisory only, shown on /construction-finance. See construction_dispatch_progress_assessment (0227) and app/api/ai/construction-progress-assessment.';

create or replace function public.construction_dispatch_progress_assessment()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.automation_post('/api/ai/construction-progress-assessment', '{}'::jsonb, 20000);
end;
$$;

comment on function public.construction_dispatch_progress_assessment is
  'Weekly (Saturday, before the 13:00 WIB progress WA report) trigger for the AI overall-progress synthesis route.';

-- Saturday 05:00 UTC = 12:00 WIB, ahead of the existing 06:00 UTC / 13:00 WIB
-- WhatsApp progress report (0199) so that report could eventually reference
-- this synthesis too.
select cron.schedule(
  'construction-progress-assessment-dispatch',
  '0 5 * * 6',
  $$select public.construction_dispatch_progress_assessment();$$
);
