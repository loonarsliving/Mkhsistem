-- ============================================================================
-- MK Connect — 0077: SP1 explains the 3-KPI causal chain, not just a summary
--
-- Clarified sales KPI structure (as specified): (1) upload prospek setiap
-- hari, (2) follow up prospek untuk mendorong closing, (3) minimal 1
-- closing/bulan/sales -- explicitly the END RESULT of (1) and (2), not an
-- independent KPI. SP1 must cite all three with real numbers so the letter
-- explains WHY it was issued, not just that it was.
--
-- crm_sp1_warnings gains three columns capturing the actual KPI numbers at
-- evaluation time, so app/api/ai/process-job/route.ts can hand them to
-- draftSp1Warning() (lib/ai/domains/crm.ts) instead of a single opaque
-- reason string. crm_run_sp1_evaluation() now measures upload consistency
-- by DISTINCT DAYS with a prospect input (matching "setiap hari"), not raw
-- count -- a rep who dumps 5 prospects in one day and none for 29 days
-- should not read as "upload activity is fine."
-- ============================================================================

alter table public.crm_sp1_warnings
  add column upload_days_30d smallint,
  add column follow_up_count_30d smallint,
  add column closings_30d smallint;

comment on column public.crm_sp1_warnings.upload_days_30d is 'KPI 1: distinct calendar days (out of the trailing 30) with >=1 new prospect input.';
comment on column public.crm_sp1_warnings.follow_up_count_30d is 'KPI 2: total follow-up activities logged across all prospects in the trailing 30 days.';
comment on column public.crm_sp1_warnings.closings_30d is 'KPI 3 (end result of 1 and 2): closings in the trailing 30 days. Target: >= 1/month.';

create or replace function public.crm_run_sp1_evaluation()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales record;
  v_upload_days_30d int;
  v_followup_count_30d int;
  v_closings_30d int;
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
    -- KPI 1: upload prospek setiap hari -- distinct days with an input, not raw count.
    select count(distinct created_at::date) into v_upload_days_30d from public.prospects
    where sales_id = v_sales.sales_id and deleted_at is null and created_at >= now() - interval '30 days';

    -- KPI 2: follow up prospek untuk mendorong closing.
    select count(*) into v_followup_count_30d
    from public.prospect_follow_ups pf
    join public.prospects p on p.id = pf.prospect_id
    where p.sales_id = v_sales.sales_id and pf.created_at >= now() - interval '30 days';

    -- KPI 3: minimal 1 closing/bulan/sales -- the end result of KPI 1 and 2.
    select count(*) into v_closings_30d from public.prospects
    where sales_id = v_sales.sales_id and status = 'closing' and closed_at is not null
      and closed_at >= now() - interval '30 days';

    -- SP1 only when all three fail together (genuinely idle, not just a
    -- slow month while still actively uploading/following up).
    if v_upload_days_30d < 10 and v_followup_count_30d < 5 and v_closings_30d = 0
       and not exists (
         select 1 from public.crm_sp1_warnings
         where sales_id = v_sales.sales_id and period_month = v_month and period_year = v_year
       ) then
      select coalesce(array_agg(id), '{}') into v_stuck_ids
      from public.prospects
      where sales_id = v_sales.sales_id and deleted_at is null and status not in ('closing', 'inactive');

      insert into public.crm_sp1_warnings (
        sales_id, branch_id, period_month, period_year, reason, stuck_prospect_ids, status,
        upload_days_30d, follow_up_count_30d, closings_30d
      )
      values (
        v_sales.sales_id, v_sales.branch_id, v_month, v_year,
        'KPI 30 hari terakhir: upload prospek ' || v_upload_days_30d || '/30 hari, follow up ' || v_followup_count_30d
          || ' aktivitas, closing ' || v_closings_30d || ' (target minimal 1/bulan).',
        v_stuck_ids, 'pending_ai',
        v_upload_days_30d, v_followup_count_30d, v_closings_30d
      )
      returning id into v_sp1_id;

      insert into public.ai_job_queue (job_type, payload)
      values ('crm_sp1_draft', jsonb_build_object('sp1_warning_id', v_sp1_id));
    end if;
  end loop;
end;
$$;
