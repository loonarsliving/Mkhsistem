-- ============================================================================
-- MK Connect — 0121: Separate Instagram/TikTok checklist track for
-- occupancy/booking content, distinct from leasehold-sales content
--
-- researchAndGenerateChecklist only ever generated leasehold-SALES content
-- (investor pitch: ROI, legalitas, urgensi unit). Owner wants a second,
-- separate checklist track aimed at travelers/renters -- showcasing the
-- villa as a place to actually stay and book, never blended with the
-- investment pitch (different audience, different goal). Only meaningful
-- for branches that actually sell villa leasehold (occupancy has no
-- meaning for one-time rumah subsidi/komersial sales) -- currently just
-- Jogja (Loonars Living).
--
-- Both tracks are gated independently (zero-pending-for-THAT-track, not
-- combined) via a distinct AI-generated marker string in the description,
-- same detection mechanism 0112 already established.
-- ============================================================================

create or replace function public.markom_run_ai_checklist_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_markom_division_id uuid;
  v_team record;
  v_pending_sales_count integer;
  v_pending_occupancy_count integer;
  v_has_villa_project boolean;
begin
  select id into v_markom_division_id from public.divisions where name = 'Marketing & Komunikasi';
  if v_markom_division_id is null then
    return;
  end if;

  for v_team in
    select distinct e.branch_id, b.name as branch_name
    from public.employees e
    join public.branches b on b.id = e.branch_id
    where e.division_id = v_markom_division_id and e.deleted_at is null and e.employment_status = 'active'
  loop
    -- Leasehold-sales track: every branch, unchanged behavior from 0112.
    select count(*) into v_pending_sales_count
    from public.kpi_tasks
    where branch_id = v_team.branch_id and division_id = v_markom_division_id
      and status = 'pending' and deleted_at is null
      and description like '%fokus PENJUALAN LEASEHOLD%';

    if v_pending_sales_count = 0 and not exists (
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

    -- Occupancy track: only branches with an active villa project.
    select exists (
      select 1 from public.crm_projects cp
      where cp.branch_id = v_team.branch_id and cp.is_active = true and cp.project_type = 'villa'
    ) into v_has_villa_project;

    if v_has_villa_project then
      select count(*) into v_pending_occupancy_count
      from public.kpi_tasks
      where branch_id = v_team.branch_id and division_id = v_markom_division_id
        and status = 'pending' and deleted_at is null
        and description like '%fokus OCCUPANCY/booking tamu%';

      if v_pending_occupancy_count = 0 and not exists (
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
  end loop;
end;
$$;
