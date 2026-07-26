-- ============================================================================
-- MK Connect — 0186: revert the background Vision sweep added by 0185
--
-- 0185 was based on a wrong reading of the KontenAI design, and the owner
-- corrected it: Gemini Vision is not meant to pre-analyze the Drive library.
-- Google Drive is storage. The pipeline is brief -> Asset Selector picks the
-- footage that fits that brief (which is what the per-brand folders are for)
-- -> Vision analyzes the selected footage as part of producing that video.
-- Analysis is a step inside production, not a batch job over inventory.
--
-- The "32 assets, 28 unanalyzed" figure that prompted 0185 was therefore not
-- a backlog at all. The 4 analyzed ones are the four scenes from a video the
-- owner produced through the KontenAI automation as a test -- exactly what
-- the intended flow looks like. Nothing was waiting to be swept.
--
-- What 0185 actually caused, both my fault:
--
--   * 18 jobs dead-lettered with 'Unknown job_type "kontenai_asset_vision"
--     -- this deployment has no handler for it'. The migration was applied
--     to the database before Vercel had finished deploying the handler, and
--     the cron started queueing immediately. Deploy first, migrate second.
--   * The remaining jobs then failed on
--     "Cannot find module '@ffmpeg-installer/linux-x64/package.json'" --
--     lib/video/extract-keyframes.ts resolves the ffmpeg binary at module
--     scope, and that binary is not in the Vercel bundle. Pre-existing, but
--     0185 is what pointed 21 jobs at it.
--
-- This removes the cron and the sweep function. The kontenai_asset_vision
-- job_type is left in the check constraint on purpose: the 21 dead-lettered
-- rows still reference it, and a constraint that its own historical rows
-- violate is worse than one spare enum value.
-- ============================================================================

select cron.unschedule('kontenai-vision-dispatch-pending');

drop function if exists public.kontenai_vision_dispatch_pending();

-- The dead-lettered rows are noise from a job type that no longer has a
-- producer -- they would otherwise sit in the Monitoring queue view forever
-- and trigger the automation_job_dead_letter alert from 0176.
delete from public.ai_job_queue
where job_type = 'kontenai_asset_vision';
