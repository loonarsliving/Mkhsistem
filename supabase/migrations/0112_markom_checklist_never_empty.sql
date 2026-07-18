-- ============================================================================
-- MK Connect — 0112: Markom checklist must never sit empty
--
-- markom_run_ai_checklist_dispatch() (0087) gated a new AI-generated batch
-- on "3 real days since the branch's last batch" -- a fixed cadence that
-- can leave a branch with zero PENDING checklist items for up to 3 days
-- once the team finishes everything early (exactly what happened: Jogja's
-- last batch was created 2026-07-15, all 8 items completed already, next
-- batch wasn't due until 2026-07-18). Per owner's explicit instruction,
-- replace the fixed-cadence gate with a zero-pending gate: dispatch a new
-- batch for a branch the moment it has NO pending AI-generated checklist
-- item left (regardless of how many days have passed), so the list is
-- never left empty for the team to sit idle on. Guards against double-
-- dispatch while a job for that branch is already in flight.
--
-- Cron frequency also raised from daily to every 2 hours so a branch that
-- empties out mid-day gets refilled same-day, not the next morning.
-- ============================================================================

select cron.unschedule('markom-ai-checklist-3days');

create or replace function public.markom_run_ai_checklist_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_markom_division_id uuid;
  v_team record;
  v_pending_count integer;
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
    select count(*) into v_pending_count
    from public.kpi_tasks
    where branch_id = v_team.branch_id and division_id = v_markom_division_id
      and status = 'pending' and deleted_at is null
      and description like '%Dibuat otomatis oleh AI berdasarkan riset tren viral%';

    if v_pending_count = 0 and not exists (
      select 1 from public.ai_job_queue
      where job_type = 'markom_checklist_draft'
        and status in ('pending', 'processing')
        and (payload ->> 'branch_id') = v_team.branch_id::text
    ) then
      insert into public.ai_job_queue (job_type, payload)
      values ('markom_checklist_draft', jsonb_build_object(
        'branch_id', v_team.branch_id,
        'branch_name', v_team.branch_name,
        'division_id', v_markom_division_id
      ));
    end if;
  end loop;
end;
$$;

-- Every 2 hours -- cheap no-op for branches that still have pending items (one SELECT, no insert), only actually dispatches when a branch truly runs dry.
select cron.schedule('markom-ai-checklist-never-empty', '0 */2 * * *', $$select public.markom_run_ai_checklist_dispatch();$$);
