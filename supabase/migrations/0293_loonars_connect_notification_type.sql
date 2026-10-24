-- ============================================================================
-- MK Connect — 0293: fix Loonars Connect notifications (0291 bug)
--
-- mkc_hosp_notify() inserted mkc_notifications.type = 'info', which the live
-- mkc_notifications_type_check does not allow (memo, announcement,
-- attendance, leave_request, system, registration, crm, kpi_task, hr,
-- finance, project, approval). Every call that actually had a recipient
-- failed -- first seen as the 2026-10-24 morning report failing 3 times in
-- the owner feed (mkc_hosp_report_finish notifies the owner). It would also
-- have rolled back critical-incident reports, cleaning hand-offs to FO, etc.
-- Hospitality notifications are system notifications: use 'system'.
-- ============================================================================

create or replace function public.mkc_hosp_notify(
  p_employee_ids uuid[], p_title text, p_body text, p_link text, p_category text, p_metadata jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.mkc_notifications (user_id, type, title, body, link, category, metadata)
  select distinct u, 'system', p_title, p_body, p_link, p_category, coalesce(p_metadata, '{}'::jsonb)
  from unnest(p_employee_ids) as u
  where u is not null and public.mkc_chat_employee_eligible(u);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.mkc_hosp_notify(uuid[], text, text, text, text, jsonb) from public, anon, authenticated;
