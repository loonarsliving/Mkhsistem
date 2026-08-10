-- ============================================================================
-- MK Connect — 0200: Daily plan/material capture on progress photos,
-- richer Saturday 13:00 report
--
-- Owner's clarification of 0199's workflow: Endy's afternoon photos aren't
-- just a progress snapshot -- their caption states tomorrow's planned work
-- and the material needed for it (which becomes the basis for his next
-- morning's pengajuan, see 0198), and the accumulated daily photos across
-- the week are what the Saturday report should synthesize into a
-- progress trend, not just "the latest single photo".
-- ============================================================================

alter table public.construction_progress_photos
  add column planned_work_tomorrow text,
  add column materials_needed_tomorrow text,
  add column report_date date not null default ((now() at time zone 'Asia/Jakarta')::date);

comment on column public.construction_progress_photos.report_date is
  'WIB calendar date the photo was sent -- used to group Endy''s afternoon photo batches by day for the weekly trend report, independent of the UTC created_at timestamp.';
comment on column public.construction_progress_photos.planned_work_tomorrow is
  'Extracted from the photo caption (Gemini Vision, same call as the assessment) -- what Endy said he''ll work on tomorrow. Null if the caption didn''t state one.';
comment on column public.construction_progress_photos.materials_needed_tomorrow is
  'Extracted from the photo caption -- the material Endy said he needs tomorrow, i.e. the basis for his next-morning pengajuan (0198). Null if the caption didn''t state one.';

-- ----------------------------------------------------------------------------
-- construction_send_progress_report(): now synthesizes a week trend per
-- block (first vs. latest assessed progress%, days with photos) instead of
-- just the latest single photo, plus the most recent planned-work/material
-- note so the report also shows what was expected to happen.
-- ----------------------------------------------------------------------------
create or replace function public.construction_send_progress_report()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
  v_block record;
  v_first record;
  v_latest record;
  v_lines text := '';
  v_photo_count int;
  v_day_count int;
begin
  for v_block in select id, code from public.construction_blocks order by code loop
    select count(*), count(distinct report_date)
      into v_photo_count, v_day_count
      from public.construction_progress_photos
      where block_id = v_block.id and created_at >= now() - interval '7 days';

    if v_photo_count = 0 then
      v_lines := v_lines || E'\n*' || v_block.code || '*: tidak ada foto minggu ini';
      continue;
    end if;

    select ai_stage, ai_progress_pct, ai_concerns
      into v_first
      from public.construction_progress_photos
      where block_id = v_block.id and created_at >= now() - interval '7 days'
      order by created_at asc
      limit 1;

    select ai_stage, ai_progress_pct, ai_concerns, planned_work_tomorrow, materials_needed_tomorrow
      into v_latest
      from public.construction_progress_photos
      where block_id = v_block.id and created_at >= now() - interval '7 days'
      order by created_at desc
      limit 1;

    if v_latest.ai_stage is null then
      v_lines := v_lines || E'\n*' || v_block.code || '*: ' || v_photo_count || ' foto (' || v_day_count || ' hari) -- penilaian AI tidak tersedia';
      continue;
    end if;

    v_lines := v_lines || E'\n*' || v_block.code || '*: ' || coalesce(v_first.ai_progress_pct, 0) || '% → ' || coalesce(v_latest.ai_progress_pct, 0) || '% ('
      || v_latest.ai_stage || ') — ' || v_photo_count || ' foto, ' || v_day_count || ' hari';
    if coalesce(v_latest.ai_concerns, '') <> '' then
      v_lines := v_lines || E'\n  ⚠️ ' || v_latest.ai_concerns;
    end if;
    if coalesce(v_latest.planned_work_tomorrow, '') <> '' or coalesce(v_latest.materials_needed_tomorrow, '') <> '' then
      v_lines := v_lines || E'\n  📌 Rencana terakhir: ' || coalesce(v_latest.planned_work_tomorrow, '-')
        || E'\n  🧱 Bahan: ' || coalesce(v_latest.materials_needed_tomorrow, '-');
    end if;
  end loop;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body)
    values (
      v_admin.id, 'system', 'construction_progress_report',
      '🏗️ Laporan Progres Bangunan — Loonars Living',
      'Tren progres per blok minggu ini (estimasi AI dari foto sore Endy). Data pendukung untuk penggajian tukang hari ini -- bukan keputusan final.'
        || E'\n' || v_lines
    );
  end loop;
end;
$$;
