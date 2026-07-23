-- ============================================================================
-- MK Connect — 0102: Sales coaching cadence, weekly -> every 3 days
-- ============================================================================

select cron.unschedule('crm-sales-coaching-weekly');

create or replace function public.crm_run_sales_coaching()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales record;
  v_closings_30d int;
begin
  for v_sales in
    select distinct e.id as sales_id, e.branch_id, e.full_name
    from public.employees e
    join public.prospects p on p.sales_id = e.id
    where e.deleted_at is null and e.employment_status = 'active'
      and p.deleted_at is null and p.status not in ('closing', 'inactive')
  loop
    select count(*) into v_closings_30d from public.prospects
    where sales_id = v_sales.sales_id and status = 'closing' and closed_at is not null
      and closed_at >= now() - interval '30 days';

    if v_closings_30d = 0 and not exists (
      select 1 from public.crm_sales_coaching_log
      where sales_id = v_sales.sales_id and created_at >= now() - interval '3 days'
    ) then
      insert into public.ai_job_queue (job_type, payload)
      values ('crm_sales_coaching', jsonb_build_object('sales_id', v_sales.sales_id));

      insert into public.crm_sales_coaching_log (sales_id) values (v_sales.sales_id);
    end if;
  end loop;
end;
$$;

comment on function public.crm_run_sales_coaching is
  'Every 3 days: enqueues an AI coaching nudge (crm_sales_coaching job -> generateSalesCoaching) for every active sales rep with 0 closings in the last 30 days. Broader and softer than SP1 (0076) -- this is coaching, not a warning.';

-- Day-of-month divisible by 3, 03:00 UTC = 11:00 WITA (offset from the
-- 02:00 UTC crm-prospect-analysis-3days job on the same days).
select cron.schedule('crm-sales-coaching-3days', '0 3 */3 * *', $$select public.crm_run_sales_coaching();$$);
