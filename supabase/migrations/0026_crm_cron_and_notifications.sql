-- ============================================================================
-- MK Connect — 0026: CRM automatic follow-up reminders
-- ============================================================================

-- Widen the existing notification type whitelist (see 0005, widened again in
-- 0018) to cover CRM notifications (follow-up reminders, payment approvals).
alter table public.mkc_notifications drop constraint mkc_notifications_type_check;
alter table public.mkc_notifications add constraint mkc_notifications_type_check
  check (type in ('memo', 'announcement', 'attendance', 'leave_request', 'system', 'registration', 'crm'));

-- ----------------------------------------------------------------------------
-- Daily reminder sweep:
--   - No follow-up in 7+ days (and not already reminded today): notify the
--     Sales owner and their Branch Manager(s), once per day per prospect.
--   - No follow-up in 30+ days: status -> 'inactive' (guard_prospect_status_
--     transition in 0023 allows this because it runs with auth.uid() null,
--     i.e. outside a request context).
-- Closing/Inactive prospects are excluded from both checks.
-- ----------------------------------------------------------------------------
create or replace function public.crm_run_follow_up_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prospect record;
  v_manager record;
begin
  for v_prospect in
    select p.id, p.customer_name, p.sales_id, p.branch_id
    from public.prospects p
    where p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and coalesce(p.last_follow_up_at, p.created_at) < now() - interval '7 days'
      and (p.last_reminder_sent_at is null or p.last_reminder_sent_at < current_date)
  loop
    insert into public.mkc_notifications (user_id, type, title, body, link)
    values (
      v_prospect.sales_id, 'crm', 'Belum ada follow up: ' || v_prospect.customer_name,
      'Sudah 7 hari tanpa follow up. Segera hubungi kembali prospect ini.',
      '/crm/prospects/' || v_prospect.id
    );

    for v_manager in
      select e.id from public.employees e
      join public.roles r on r.id = e.role_id
      where e.branch_id = v_prospect.branch_id and e.deleted_at is null and r.key = 'kepala_cabang'
    loop
      insert into public.mkc_notifications (user_id, type, title, body, link)
      values (
        v_manager.id, 'crm', 'Follow up terlambat: ' || v_prospect.customer_name,
        'Prospect ini belum di-follow up selama 7 hari.',
        '/crm/prospects/' || v_prospect.id
      );
    end loop;

    update public.prospects set last_reminder_sent_at = now() where id = v_prospect.id;
  end loop;

  update public.prospects set status = 'inactive'
  where deleted_at is null
    and status not in ('closing', 'inactive')
    and coalesce(last_follow_up_at, created_at) < now() - interval '30 days';
end;
$$;

-- Runs at 02:00 UTC = 10:00 WITA (Asia/Makassar), well into the business day
-- so overnight-entered follow-ups from the previous evening are accounted
-- for before reminders are sent.
select cron.schedule(
  'crm-follow-up-reminders-daily',
  '0 2 * * *',
  $$select public.crm_run_follow_up_reminders();$$
);
