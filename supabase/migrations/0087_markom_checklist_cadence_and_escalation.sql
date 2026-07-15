-- ============================================================================
-- MK Connect — 0087: Reliable checklist cadence + Kepala Cabang escalation
--
-- Bug found: markom-ai-checklist-3days and markom-kepala-cabang-pending-
-- reminder-3days both used '0 3 */3 * *' -- fires on calendar day-of-month
-- 3/6/9/.../30, NOT genuinely "every 3 days" (e.g. the 15th fires, the
-- 16th/17th don't, next is the 18th -- a real gap the user hit directly
-- when a fresh checklist wasn't ready the day after this module shipped).
--
-- Fix: both crons now run DAILY, but markom_run_ai_checklist_dispatch()
-- only actually enqueues a new checklist per branch once >= 3 real days
-- have passed since that branch's last AI-generated checklist (tracked via
-- kpi_tasks.created_at, not a fixed calendar anchor) -- self-healing if a
-- run is ever missed, and no month-boundary drift.
--
-- Also: markom_notify_kepala_cabang_pending() now (a) reminds the Markom
-- team members themselves directly, not just their Kepala Cabang, and (b)
-- escalates the Kepala Cabang message to an explicit "tegur langsung"
-- instruction once a branch has had zero task completions in 3+ days,
-- instead of a flat neutral reminder every time.
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
  v_last_ai_checklist_at timestamptz;
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
    select max(created_at) into v_last_ai_checklist_at
    from public.kpi_tasks
    where branch_id = v_team.branch_id and division_id = v_markom_division_id
      and description like '%Dibuat otomatis oleh AI berdasarkan riset tren viral%';

    if v_last_ai_checklist_at is null or v_last_ai_checklist_at < now() - interval '3 days' then
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

-- Daily 23:00 UTC = 07:00 WITA -- the function itself decides per-branch whether 3 real days have actually elapsed.
select cron.schedule('markom-ai-checklist-3days', '0 23 * * *', $$select public.markom_run_ai_checklist_dispatch();$$);

create or replace function public.markom_notify_kepala_cabang_pending()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_notified integer;
  v_branch record;
begin
  for v_branch in
    select cnt.branch_id, cnt.pending_count,
      exists (
        select 1 from public.kpi_tasks kt2
        where kt2.branch_id = cnt.branch_id and kt2.status = 'completed' and kt2.completed_at >= now() - interval '3 days'
      ) as has_recent_progress
    from (
      select branch_id, count(*) as pending_count, min(created_at) as oldest_pending_at
      from public.kpi_tasks
      where status = 'pending' and deleted_at is null
      group by branch_id
      having min(created_at) <= now() - interval '1 day'
    ) cnt
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    select em.id, 'kpi_task', 'weekly_reminder',
      case when v_branch.has_recent_progress then 'Task Markom belum selesai' else 'Tim Markom butuh teguran langsung' end,
      case
        when v_branch.has_recent_progress then
          'Tim Markom cabang Anda masih punya ' || v_branch.pending_count || ' task yang belum diselesaikan.'
        else
          'Tim Markom cabang Anda memiliki ' || v_branch.pending_count || ' task yang BELUM ADA PROGRES sama sekali dalam 3 hari terakhir. Mohon tegur langsung tim Markom Anda dan pastikan mereka segera mengerjakan checklist yang sudah dibuatkan AI.'
      end,
      '/markom'
    from public.employees em
    join public.roles r on r.id = em.role_id
    where em.branch_id = v_branch.branch_id and r.key = 'kepala_cabang' and em.deleted_at is null and em.employment_status = 'active';
    get diagnostics v_notified = row_count;
    v_total := v_total + v_notified;

    insert into public.mkc_notifications (user_id, type, category, title, body, link)
    select em.id, 'kpi_task', 'weekly_reminder', 'Checklist konten belum selesai',
      'Anda masih punya ' || v_branch.pending_count || ' checklist konten yang belum dikerjakan. Segera selesaikan.',
      '/markom'
    from public.employees em
    join public.divisions d on d.id = em.division_id
    where em.branch_id = v_branch.branch_id and d.name = 'Marketing & Komunikasi' and em.deleted_at is null and em.employment_status = 'active';
    get diagnostics v_notified = row_count;
    v_total := v_total + v_notified;
  end loop;
  return v_total;
end;
$$;

-- Daily 03:30 UTC = 11:30 WITA.
select cron.schedule('markom-kepala-cabang-pending-reminder-3days', '30 3 * * *', $$select public.markom_notify_kepala_cabang_pending();$$);
