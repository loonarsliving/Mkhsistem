-- ============================================================================
-- MK Connect — 0075: Remind Kepala Cabang about incomplete Markom work
--
-- markom_weekly_reminder (0052) already nudges the TEAM about pending
-- tasks; nothing has ever told the Kepala Cabang their team still has
-- unfinished work (as opposed to task_pending_verification, added in 0070,
-- which only fires once a task is ALREADY self-completed and needs
-- checking). This closes that gap: every 3 days, every Kepala Cabang whose
-- branch has any still-pending Markom task gets a WhatsApp count. Pure SQL,
-- no Gemini call.
-- ============================================================================

create or replace function public.markom_notify_kepala_cabang_pending()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  select em.id, 'kpi_task', 'weekly_reminder', 'Task Markom belum selesai',
    'Tim Markom cabang Anda masih punya ' || cnt.pending_count || ' task yang belum dikerjakan/diselesaikan.',
    '/markom'
  from (
    select branch_id, count(*) as pending_count
    from public.kpi_tasks
    where status = 'pending' and deleted_at is null
    group by branch_id
  ) cnt
  join public.employees em on em.branch_id = cnt.branch_id
  join public.roles r on r.id = em.role_id
  where r.key = 'kepala_cabang' and em.deleted_at is null and em.employment_status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 30 3 */3 * * = 11:30 WITA, same 3-day cadence as the rest of this
-- session's Markom automation, right after markom-ai-checklist-3days.
select cron.schedule(
  'markom-kepala-cabang-pending-reminder-3days',
  '30 3 */3 * *',
  $$select public.markom_notify_kepala_cabang_pending();$$
);
