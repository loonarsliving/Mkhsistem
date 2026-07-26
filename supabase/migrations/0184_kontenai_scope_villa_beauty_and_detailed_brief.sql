-- ============================================================================
-- MK Connect — 0184: KontenAI automates villa (occupancy) + beauty only,
-- leasehold goes back to manual, and the brief carries real production
-- direction
--
-- Owner's decision, three parts:
--
--   1. KontenAI automation covers villa (occupancy) and beauty. Leasehold is
--      removed from the automated pipeline -- Markom works it manually from
--      the brief. kontenai_automation_dispatch previously picked up
--      'leasehold_sales' too.
--
--   2. From now on no villa or beauty brief is generated at all until the
--      KontenAI toggle is switched on. Those two focuses belong to the
--      automated pipeline now, so producing manual checklist items for them
--      as well would hand Markom work the machine is about to redo. Leasehold
--      briefs keep being generated exactly as before, because that is the one
--      Markom now owns end to end.
--
--      Both gates read the same kontenai_automation_settings.enabled flag the
--      dispatcher does, so flipping that one toggle both starts the pipeline
--      and restores villa/beauty brief generation. There is no second switch
--      to forget.
--
--   3. The brief gains production_direction. KontenAI exists to raise content
--      quality (the low audit scores predate it), and two defects in this
--      pipeline were working against that goal: the render worker searched
--      Freesound using the brief's big_idea, so it was querying an audio
--      library for phrases like "Villa Jogja passive income" and getting
--      nothing usable, and every scene was narrated unconditionally because
--      nothing ever decided whether narration suited the piece. The brief now
--      states music genre/mood/tempo/instrumentation plus an English audio
--      search query, whether to narrate and in what tone, duration, scene
--      count, pacing, colour, overlay and transition style, the caption, and
--      what to avoid -- and the worker reads those instead of guessing.
-- ============================================================================

alter table public.kontenai_creative_briefs
  add column if not exists production_direction jsonb not null default '{}'::jsonb;

comment on column public.kontenai_creative_briefs.production_direction is
  'Full production direction from AI Director: music (incl. an English Freesound search query), voice-over decision + tone, visual grammar, caption, things to avoid, success criteria. Read by scripts/render-worker.ts -- not documentation.';

-- ----------------------------------------------------------------------------
-- Part 1: automation scope. occupancy + beauty only.
-- Restated from 0169 with 'leasehold_sales' removed from the pickup filter;
-- every other line is unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.kontenai_automation_dispatch()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_enabled boolean;
  v_row record;
begin
  select enabled into v_enabled from public.kontenai_automation_settings where id = 'singleton';
  if not coalesce(v_enabled, false) then
    return;
  end if;

  for v_row in
    select t.id
    from public.kpi_tasks t
    where t.status = 'pending'
      and t.deleted_at is null
      -- Villa + beauty only. Leasehold is Markom's manual lane now.
      and t.content_focus in ('occupancy', 'beauty')
      and not exists (select 1 from public.kontenai_creative_briefs b where b.kpi_task_id = t.id)
    order by t.created_at
    limit 5
  loop
    insert into public.ai_job_queue (job_type, payload)
    values ('kontenai_auto_produce', jsonb_build_object('kpi_task_id', v_row.id));
  end loop;

  for v_row in
    select rj.id
    from public.kontenai_render_jobs rj
    join public.kontenai_storyboards sb on sb.id = rj.storyboard_id
    join public.kontenai_creative_briefs b on b.id = sb.creative_brief_id
    where rj.status = 'completed'
      and b.kpi_task_id is not null
      and not exists (
        select 1 from public.markom_content_submissions s
        where s.task_id = b.kpi_task_id and s.deleted_at is null
      )
    order by rj.completed_at
    limit 5
  loop
    insert into public.ai_job_queue (job_type, payload)
    values ('kontenai_auto_bridge_to_studio', jsonb_build_object('render_job_id', v_row.id));
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Part 2a: the Markom checklist stops producing occupancy briefs while the
-- KontenAI toggle is off.
--
-- Restated from the live definition. The leasehold block is untouched; the
-- occupancy block gains the toggle condition.
-- ----------------------------------------------------------------------------
create or replace function public.markom_run_ai_checklist_dispatch()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_markom_division_id uuid;
  v_team record;
  v_has_villa_project boolean;
  v_kontenai_enabled boolean;
begin
  select id into v_markom_division_id from public.divisions where name = 'Marketing & Komunikasi';
  if v_markom_division_id is null then
    return;
  end if;

  -- Villa/occupancy content belongs to the KontenAI pipeline. While that is
  -- switched off, nobody gets a villa brief -- neither the machine nor Markom.
  select enabled into v_kontenai_enabled from public.kontenai_automation_settings where id = 'singleton';

  for v_team in
    select distinct e.branch_id, b.name as branch_name
    from public.employees e
    join public.branches b on b.id = e.branch_id
    where e.division_id = v_markom_division_id and e.deleted_at is null and e.employment_status = 'active'
  loop
    -- Leasehold: unchanged. This is the lane Markom works manually.
    if not exists (
      select 1 from public.kpi_tasks
      where branch_id = v_team.branch_id and division_id = v_markom_division_id
        and deleted_at is null
        and description like '%fokus PENJUALAN LEASEHOLD%'
        and created_at::date = current_date
    ) and not exists (
      select 1 from public.ai_job_queue
      where job_type = 'markom_checklist_draft'
        and status in ('pending', 'processing')
        and (payload ->> 'branch_id') = v_team.branch_id::text
        and coalesce(payload ->> 'focus', 'leasehold_sales') = 'leasehold_sales'
    ) then
      insert into public.ai_job_queue (job_type, payload)
      values ('markom_checklist_draft', jsonb_build_object(
        'branch_id', v_team.branch_id,
        'branch_name', v_team.branch_name,
        'division_id', v_markom_division_id,
        'focus', 'leasehold_sales'
      ));
    end if;

    if coalesce(v_kontenai_enabled, false) then
      select exists (
        select 1 from public.crm_projects cp
        where cp.branch_id = v_team.branch_id and cp.is_active = true and cp.project_type = 'villa'
      ) into v_has_villa_project;

      if v_has_villa_project then
        if not exists (
          select 1 from public.kpi_tasks
          where branch_id = v_team.branch_id and division_id = v_markom_division_id
            and deleted_at is null
            and description like '%fokus OCCUPANCY/booking tamu%'
            and created_at::date = current_date
        ) and not exists (
          select 1 from public.ai_job_queue
          where job_type = 'markom_checklist_draft'
            and status in ('pending', 'processing')
            and (payload ->> 'branch_id') = v_team.branch_id::text
            and (payload ->> 'focus') = 'occupancy'
        ) then
          insert into public.ai_job_queue (job_type, payload)
          values ('markom_checklist_draft', jsonb_build_object(
            'branch_id', v_team.branch_id,
            'branch_name', v_team.branch_name,
            'division_id', v_markom_division_id,
            'focus', 'occupancy'
          ));
        end if;
      end if;
    end if;
  end loop;
end;
$$;

comment on function public.markom_run_ai_checklist_dispatch is
  'Every 2 hours: keeps the Markom checklist stocked. Leasehold always; occupancy only while kontenai_automation_settings.enabled is true (0184) -- villa content is the automated pipeline''s job, so no manual brief is issued for it while that pipeline is parked.';

-- ----------------------------------------------------------------------------
-- Part 2b: same gate for beauty content ideas.
-- ----------------------------------------------------------------------------
create or replace function public.loonars_beauty_run_content_ideas_dispatch()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_kontenai_enabled boolean;
begin
  select enabled into v_kontenai_enabled from public.kontenai_automation_settings where id = 'singleton';
  if not coalesce(v_kontenai_enabled, false) then
    return;
  end if;

  if not exists (
    select 1 from public.loonars_content_items
    where deleted_at is null and created_at::date = current_date
  ) and not exists (
    select 1 from public.ai_job_queue
    where job_type = 'loonars_beauty_content_ideas_draft'
      and status in ('pending', 'processing')
  ) then
    insert into public.ai_job_queue (job_type, payload) values ('loonars_beauty_content_ideas_draft', '{}'::jsonb);
  end if;
end;
$$;

comment on function public.loonars_beauty_run_content_ideas_dispatch is
  'Daily: drafts beauty content ideas -- but only while kontenai_automation_settings.enabled is true (0184). Beauty is an automated-pipeline focus, so its briefs pause with the pipeline.';
