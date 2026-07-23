-- ============================================================================
-- MK Connect — 0143: Content Studio's Beauty tab gets a real brief picker
--
-- Beauty content isn't checklist-less -- it has its own content plan,
-- loonars_content_items ("Rencana Konten" on /markom/content-planner's
-- Beauty tab, migration 0126), just not kpi_tasks (Beauty has no branch/
-- division-scoped checklist -- it's one national product line). 0142
-- treated Beauty submissions as always brief-less; this links a submission
-- back to the loonars_content_items row it was made for, same role
-- task_id plays for Leasehold/Villa, so the AI review gets a real brief
-- (title/hook/script notes/CTA) instead of "Konten mandiri (tanpa checklist)".
-- ============================================================================

alter table public.markom_content_submissions
  add column beauty_content_item_id uuid references public.loonars_content_items(id) on delete set null;

comment on column public.markom_content_submissions.beauty_content_item_id is 'Brief this Beauty submission was made for, from loonars_content_items -- the Beauty-tab equivalent of task_id.';
