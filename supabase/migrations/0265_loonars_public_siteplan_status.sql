-- ============================================================================
-- MK Connect — 0265: public, unauthenticated live siteplan status for sharing
--
-- Owner's request: a sales rep needs to share Loonars 2's live siteplan with
-- a buyer's family over WhatsApp -- a link anyone can open without an MK
-- Connect account, showing exactly which blocks are already sold, "sesuai
-- dgan data didatabasenya" (matching the real database, not a static export
-- that goes stale the moment another unit sells).
--
-- Deliberately narrow, unlike everything else in this feature so far (which
-- has all required a session):
--   * loonars_projects.publicly_shareable (new column, default false) --
--     an explicit opt-in per project. Only LNR2 is turned on here; Cendana
--     and any future project stay private unless someone deliberately flips
--     this too.
--   * loonars_public_siteplan_status(p_kode) is a SECURITY DEFINER function
--     granted to `anon` -- it bypasses RLS on purpose (there is no session
--     to check permissions against), but hands back only `blok` + `status`
--     per unit, plus the project's own kode/nama. No harga, no buyer name,
--     no phone, no purchase history -- none of loonars_unit_purchases is
--     touched at all. A kode that doesn't resolve to a publicly_shareable
--     project returns `{"found": false}` rather than raising, so the public
--     page can render a clean "not found" instead of a raw Postgres error
--     reaching an unauthenticated visitor.
--   * The route this feeds (app/share/siteplan/[kode]/page.tsx) is added to
--     middleware.ts's PUBLIC_PATHS in the same commit -- it is the only
--     page in this app deliberately reachable without a session.
-- ============================================================================

alter table public.loonars_projects
  add column publicly_shareable boolean not null default false;

comment on column public.loonars_projects.publicly_shareable is
  'Opt-in flag: when true, loonars_public_siteplan_status() will hand this project''s block/status list (never price or buyer data) to anonymous callers via /share/siteplan/<kode>. Default false -- a project is never publicly shareable by accident.';

update public.loonars_projects set publicly_shareable = true where kode = 'LNR2';

create or replace function public.loonars_public_siteplan_status(p_kode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_units jsonb;
begin
  select id, kode, nama into v_project
  from public.loonars_projects
  where kode = p_kode and publicly_shareable = true;

  if v_project.id is null then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('blok', u.blok, 'status', u.status)
      order by u.row_label nulls last, u.sort_order, u.blok
    ),
    '[]'::jsonb
  )
  into v_units
  from public.loonars_units u
  where u.project_id = v_project.id;

  return jsonb_build_object(
    'found', true,
    'kode', v_project.kode,
    'nama', v_project.nama,
    'units', v_units
  );
end;
$$;

grant execute on function public.loonars_public_siteplan_status(text) to anon, authenticated;

comment on function public.loonars_public_siteplan_status is
  'Public, unauthenticated read for the /share/siteplan/<kode> page: returns {found:false} for any kode that is not a publicly_shareable project, otherwise {found:true, kode, nama, units:[{blok,status}]}. Deliberately excludes harga/tipe/luas and everything in loonars_unit_purchases -- this is a live availability board, not a price list or buyer directory. No auth.uid() check by design: there is no session to check.';
