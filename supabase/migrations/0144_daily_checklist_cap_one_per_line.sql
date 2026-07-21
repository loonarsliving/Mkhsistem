-- ============================================================================
-- MK Connect — 0144: Cap Markom's daily checklist at 1 item per product line
--
-- Owner's call: Leasehold, Villa (occupancy), and Beauty should each get
-- exactly 1 new content checklist item per day, not a batch of 3 whenever
-- the queue empties (leasehold/occupancy, every 2h) or once a week
-- (beauty). AI generation itself was already changed to return 1 item
-- instead of 3 (lib/ai/domains/markom.ts, lib/ai/domains/loonars-beauty.ts)
-- -- this migration changes the two dispatcher functions' gating from
-- "queue is empty" / "unconditional weekly" to a real once-per-calendar-day
-- cap, and moves Beauty's cron from weekly to daily so it actually fires
-- every day.
--
-- Platform (Instagram vs TikTok) is still chosen by the model per item,
-- picking whichever platform best fits that day's specific concept for
-- engagement -- not a fixed alternation, and not forcing the same content
-- onto both platforms every day.
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
    -- Leasehold: at most 1 new AI-generated item per calendar day per branch.
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

    select exists (
      select 1 from public.crm_projects cp
      where cp.branch_id = v_team.branch_id and cp.is_active = true and cp.project_type = 'villa'
    ) into v_has_villa_project;

    if v_has_villa_project then
      -- Villa/Occupancy: same once-per-day cap, independent track.
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
  end loop;
end;
$$;

-- Beauty: was an unconditional weekly insert (Monday only, 3 ideas/run).
-- Now gated to at most 1 new idea per calendar day, matching Leasehold/Villa.
create or replace function public.loonars_beauty_run_content_ideas_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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

-- Weekly Monday-only cron -> daily, same time of day (15 min after the
-- weekly competitor-comparison job, which stays weekly -- only content
-- idea generation itself needs to run daily now).
select cron.unschedule('loonars-beauty-content-ideas-dispatch');
select cron.schedule(
  'loonars-beauty-content-ideas-dispatch',
  '15 2 * * *',
  $$select public.loonars_beauty_run_content_ideas_dispatch();$$
);
