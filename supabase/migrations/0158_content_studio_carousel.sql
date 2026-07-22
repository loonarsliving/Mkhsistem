-- ============================================================================
-- MK Connect — 0158: Content Studio carousel upload (multiple photos)
--
-- Owner's call: Content Studio only ever let Markom upload 1 photo per
-- submission, even when a brief explicitly calls for a multi-photo carousel
-- (e.g. "5 foto"). markom_content_submissions.storage_path/public_url stay
-- as the FIRST photo (or the single video) for backward compatibility with
-- every existing row and all the display code that already reads
-- s.public_url/s.media_type directly -- additional carousel photos (2nd
-- onward) live in this new child table, mirroring meta_ad_campaign_photos'
-- exact pattern for Ads Specialist carousels (0141). A submission is either
-- 1-10 images (single or carousel) or exactly 1 video, same rule as Ads
-- Specialist -- never mixed.
-- ============================================================================

create table public.markom_content_submission_photos (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.markom_content_submissions(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
create index markom_content_submission_photos_submission_idx on public.markom_content_submission_photos (submission_id, display_order);

alter table public.markom_content_submission_photos enable row level security;

create policy markom_content_submission_photos_select on public.markom_content_submission_photos for select to authenticated using (true);
create policy markom_content_submission_photos_write on public.markom_content_submission_photos for all to authenticated
  using (public.app_has_permission('content_submission.manage'))
  with check (public.app_has_permission('content_submission.manage'));

comment on table public.markom_content_submission_photos is
  '2nd-onward carousel photos for a markom_content_submissions row (image #1 stays on the parent row''s storage_path/public_url for backward compatibility). Never populated for a video submission -- a carousel is always 1-10 images, a video submission is always exactly 1 video, never mixed (mirrors meta_ad_campaign_photos/Ads Specialist, 0141).';
