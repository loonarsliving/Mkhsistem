-- ============================================================================
-- MK Connect — 0235: Restrict allowed MIME types on attachment buckets
--
-- Security fix: memo-attachments, announcement-attachments, and
-- leave-attachments were created (0010_storage.sql) with allowed_mime_types
-- left null -- unlike avatars/company-assets/project-photos/etc, Storage was
-- not enforcing ANY content-type allow-list on these three, so the client's
-- self-reported file.type was the only thing standing between an upload and
-- whatever ended up served back (see lib/supabase/storage.ts). These three
-- buckets exist for staff to attach supporting documents to memos,
-- announcements, and leave requests -- images and PDFs cover every real use
-- case seen in the UI (features/memo, features/announcements,
-- components/shared/file-upload-field.tsx have no `accept` restriction
-- today, but nothing in those flows expects anything beyond a photo or a
-- scanned document).
--
-- kontenai-assets is deliberately left unrestricted: it's a general-purpose
-- media library (image/video/audio/font/document/template -- see
-- features/kontenai/asset-library/utils/asset-type-meta.ts), so there is no
-- single sensible allow-list for it; the application-layer fallback in
-- lib/supabase/storage.ts forces a safe (non-inline-renderable)
-- Content-Type for it instead.
-- ============================================================================

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
where id in ('memo-attachments', 'announcement-attachments', 'leave-attachments')
  and allowed_mime_types is null;
