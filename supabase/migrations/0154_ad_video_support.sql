-- ============================================================================
-- MK Connect — 0154: Video support for Ads Specialist creative source
--
-- Owner's ask: Meta Ads supports video creatives, so the project photo
-- gallery (Ads Specialist's real-media source, 0078) should accept video
-- too, not just photos. crm_project_photos gets a media_type column so
-- the AI ad-drafting pipeline (lib/ai/domains/markom.ts's
-- researchAndDraftAd) can tell them apart and pick a single video (never
-- mixed with a photo carousel -- Meta has no video carousel format) or a
-- photo/carousel like before. Storage bucket widened to accept video/mp4
-- and video/quicktime, with a much higher size cap (short property-tour
-- videos are tens of MB, well past the old 10MB photo-only limit).
-- ============================================================================

alter table public.crm_project_photos
  add column media_type text not null default 'image' check (media_type in ('image', 'video'));

comment on column public.crm_project_photos.media_type is 'image or video -- the AI ad-drafting pipeline picks either exactly one video, or 1-10 images for a carousel, never both.';

update storage.buckets
set file_size_limit = 104857600, -- 100MB
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime']
where id = 'project-photos';
