-- ============================================================================
-- MK Connect — 0188: Fix Content Studio "gagal menyimpan konten" regression
--
-- 0169 added a table-wide unique index on markom_content_submissions.task_id
-- (excluding deleted rows) meant to stop the KontenAI automation bridge
-- (processContentStudioBridge, app/api/ai/process-job/route.ts) from
-- double-producing a submission for the same kpi_task under concurrent cron
-- ticks. That bridge already re-checks for an existing submission itself
-- before inserting (belt-and-suspenders), so the DB constraint was only
-- ever meant to backstop *that* path.
--
-- Problem: the index was scoped to task_id alone, not to automation-
-- originated rows. Content Studio's own manual upload flow
-- (createContentSubmissionAction) has never deleted a submission before
-- letting Markom upload again for the same brief -- multiple needs_revision
-- attempts stacking up un-deleted for one task was always normal usage.
-- Once 0169 shipped, the very next manual upload for any task that already
-- had one non-deleted submission started failing outright with "duplicate
-- key value violates unique constraint markom_content_submissions_task_id_unique",
-- surfaced to Markom as "Gagal menyimpan konten" -- the file lands in
-- Storage but the row never gets created, so nothing shows up on the board.
--
-- Fix: tag automation-originated rows explicitly and scope the unique
-- index to only those, so manual Markom uploads are never subject to it.
-- ============================================================================

alter table public.markom_content_submissions
  add column is_automation_generated boolean not null default false;

comment on column public.markom_content_submissions.is_automation_generated is
  'True only for rows inserted by the KontenAI Content Studio bridge (processContentStudioBridge). Lets the one-submission-per-task uniqueness guard apply to that automated path only, never to Markom''s manual uploads.';

update public.markom_content_submissions s
set is_automation_generated = true
where exists (
  select 1 from public.kontenai_creative_briefs b
  join public.kontenai_storyboards st on st.creative_brief_id = b.id
  join public.kontenai_render_jobs rj on rj.storyboard_id = st.id
  where b.kpi_task_id = s.task_id and rj.status = 'completed'
);

drop index public.markom_content_submissions_task_id_unique;

create unique index markom_content_submissions_task_id_unique
  on public.markom_content_submissions (task_id)
  where task_id is not null and deleted_at is null and is_automation_generated;
