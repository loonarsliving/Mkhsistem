-- ============================================================================
-- MK Connect — 0076: SP1 evaluation moves to a 30-day performance window
--
-- Bug report: SP1 was being (re-)evaluated every 3 days against "0 closings
-- THIS CALENDAR MONTH" (crm_run_prospect_analysis, 0069) -- unfair early in
-- a new month (resets everyone to 0 regardless of a strong previous month)
-- and tied to the wrong cadence for something this consequential.
--
-- Split out into its own function on its own MONTHLY cadence, evaluating a
-- proper trailing 30-day rolling window instead of the calendar month. All
-- three conditions (the KPIs the user specified) must hold together:
--   1. "Inputan prospeknya jarang dan kurang" -- fewer than 3 new prospects
--      created in the last 30 days.
--   2. "Hasil prospekan tidak berubah" -- zero follow-up activity logged on
--      ANY of their prospects in the last 30 days (nothing moved at all).
--   3. "Tidak ada closing dalam 30 hari" -- zero closings in the last 30
--      days.
-- The (3 / 30-day) thresholds are a starting point, not a business rule
-- carved in stone -- easy to adjust later if the real numbers need tuning.
--
-- crm_run_prospect_analysis (0069) keeps its original job: the 3-day
-- "stuck prospect" nudge to Sales + Kepala Cabang is a routine operational
-- reminder, unrelated to and much lighter-weight than issuing a formal
-- warning letter -- it stays on its existing 3-day cadence, just without
-- the SP1 side effect it used to also carry.
-- ============================================================================

create or replace function public.crm_run_prospect_analysis()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales record;
  v_manager record;
  v_stuck_count int;
begin
  for v_sales in
    select distinct e.id as sales_id, e.branch_id, e.full_name
    from public.employees e
    join public.prospects p on p.sales_id = e.id
    where e.deleted_at is null and e.employment_status = 'active'
      and p.deleted_at is null and p.status not in ('closing', 'inactive')
  loop
    select count(*) into v_stuck_count
    from public.prospects p
    where p.sales_id = v_sales.sales_id and p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and coalesce(p.last_follow_up_at, p.created_at) < now() - interval '3 days';

    if v_stuck_count > 0 then
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_sales.sales_id, 'crm', 'stuck_prospect_reminder',
        'Analisa AI: ' || v_stuck_count || ' prospek belum ada perkembangan',
        'AI mendeteksi ' || v_stuck_count || ' prospek Anda tanpa follow up dalam 3+ hari terakhir. Segera tindak lanjuti.',
        '/crm'
      );

      for v_manager in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.branch_id = v_sales.branch_id and em.deleted_at is null and r.key = 'kepala_cabang'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link)
        values (
          v_manager.id, 'crm', 'stuck_prospect_alert',
          'Analisa AI: ' || v_sales.full_name || ' punya ' || v_stuck_count || ' prospek stuck',
          'AI mendeteksi ' || v_stuck_count || ' prospek milik ' || v_sales.full_name || ' tanpa follow up 3+ hari.',
          '/crm'
        );
      end loop;
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- crm_run_sp1_evaluation: monthly, trailing 30-day window (see criteria
-- above). Reuses crm_sp1_warnings' unique(sales_id, period_month,
-- period_year) as the guard against issuing a second warning to the same
-- sales rep for the same month.
-- ----------------------------------------------------------------------------
create or replace function public.crm_run_sp1_evaluation()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales record;
  v_new_prospects_30d int;
  v_closings_30d int;
  v_has_activity_30d boolean;
  v_stuck_ids uuid[];
  v_month smallint := extract(month from now())::smallint;
  v_year smallint := extract(year from now())::smallint;
  v_sp1_id uuid;
begin
  for v_sales in
    select e.id as sales_id, e.branch_id, e.full_name
    from public.employees e
    join public.divisions d on d.id = e.division_id
    where e.deleted_at is null and e.employment_status = 'active' and d.name = 'Marketing & Sales'
  loop
    select count(*) into v_new_prospects_30d from public.prospects
    where sales_id = v_sales.sales_id and deleted_at is null and created_at >= now() - interval '30 days';

    select count(*) into v_closings_30d from public.prospects
    where sales_id = v_sales.sales_id and status = 'closing' and closed_at is not null
      and closed_at >= now() - interval '30 days';

    select exists (
      select 1 from public.prospect_follow_ups pf
      join public.prospects p on p.id = pf.prospect_id
      where p.sales_id = v_sales.sales_id and pf.created_at >= now() - interval '30 days'
    ) into v_has_activity_30d;

    if v_new_prospects_30d < 3 and v_closings_30d = 0 and not v_has_activity_30d
       and not exists (
         select 1 from public.crm_sp1_warnings
         where sales_id = v_sales.sales_id and period_month = v_month and period_year = v_year
       ) then
      select coalesce(array_agg(id), '{}') into v_stuck_ids
      from public.prospects
      where sales_id = v_sales.sales_id and deleted_at is null and status not in ('closing', 'inactive');

      insert into public.crm_sp1_warnings (sales_id, branch_id, period_month, period_year, reason, stuck_prospect_ids, status)
      values (
        v_sales.sales_id, v_sales.branch_id, v_month, v_year,
        'Performa 30 hari terakhir: hanya ' || v_new_prospects_30d || ' prospek baru, tidak ada follow up pada prospek manapun, dan tidak ada closing.',
        v_stuck_ids, 'pending_ai'
      )
      returning id into v_sp1_id;

      insert into public.ai_job_queue (job_type, payload)
      values ('crm_sp1_draft', jsonb_build_object('sp1_warning_id', v_sp1_id));
    end if;
  end loop;
end;
$$;

-- 1st of every month, 01:00 UTC = 09:00 WITA.
select cron.schedule('crm-sp1-evaluation-monthly', '0 1 1 * *', $$select public.crm_run_sp1_evaluation();$$);
