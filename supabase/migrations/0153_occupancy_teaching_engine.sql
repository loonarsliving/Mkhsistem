-- ============================================================================
-- MK Connect — 0153: Occupancy Teaching Engine (Management Property)
--
-- Owner's ask: teach Management Property's Kepala Cabang the occupancy/
-- deal-making knowledge from the Occupancy Intelligence bank (0152), sent
-- via WhatsApp every Wednesday and Friday at 13:00 WITA, starting the very
-- next occurrence. Same shape as the Sales Teaching Engine (0128) and
-- Cashflow Teaching Engine (0129/0130): a throttle log table + dispatcher
-- gated to the one qualifying branch, enqueuing a job the background
-- worker turns into a real Gemini-drafted WhatsApp message
-- (generateOccupancyTeaching, lib/ai/domains/occupancy-teaching.ts). No
-- mkc_notifications row, no UI anywhere -- this module must never appear
-- in any menu, per the same pattern every other Teaching Engine piece
-- follows.
-- ============================================================================

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison', 'competitor_discovery',
    'loonars_beauty_competitor_comparison', 'loonars_beauty_content_ideas_draft',
    'investor_intelligence_refresh', 'cashflow_intelligence_refresh',
    'sales_teaching_weekly', 'cashflow_action_plan',
    'loonars_beauty_weekly_content_audit',
    'markom_content_performance_broadcast',
    'occupancy_intelligence_refresh',
    -- This migration
    'occupancy_teaching_biweekly'
  ));

-- ----------------------------------------------------------------------------
-- mp_occupancy_teaching_log: idempotency/throttle guard, mirrors
-- crm_sales_teaching_log (0128) -- one row per send, so a cron rerun in
-- the same window never double-sends. Throttle window is 36 hours (not
-- 6 days like Sales Teaching, since this fires twice a week) -- long
-- enough to block an accidental same-day double-fire, short enough to
-- never block the real Wed->Fri (2-day) gap.
-- ----------------------------------------------------------------------------
create table public.mp_occupancy_teaching_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index mp_occupancy_teaching_log_branch_idx on public.mp_occupancy_teaching_log (branch_id, created_at desc);
alter table public.mp_occupancy_teaching_log enable row level security;

comment on table public.mp_occupancy_teaching_log is
  'One row per Occupancy Teaching Engine briefing sent (mp_run_occupancy_teaching_biweekly) -- throttles to at most once every 36 hours per branch.';

create or replace function public.mp_run_occupancy_teaching_biweekly()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch record;
begin
  for v_branch in
    select id, name from public.branches
    where code = 'MP' and deleted_at is null and is_active = true
  loop
    if not exists (
      select 1 from public.mp_occupancy_teaching_log
      where branch_id = v_branch.id and created_at >= now() - interval '36 hours'
    ) then
      insert into public.ai_job_queue (job_type, payload)
      values ('occupancy_teaching_biweekly', jsonb_build_object('branch_id', v_branch.id, 'branch_name', v_branch.name));

      insert into public.mp_occupancy_teaching_log (branch_id) values (v_branch.id);
    end if;
  end loop;
end;
$$;

comment on function public.mp_run_occupancy_teaching_biweekly is
  'Wed/Fri: enqueues an occupancy_teaching_biweekly job (Kepala Cabang briefing -> generateOccupancyTeaching) for the Management Property branch. Delivered via WhatsApp only, never via mkc_notifications/UI.';

-- Wednesday & Friday, 05:00 UTC = 13:00 WITA.
select cron.schedule('mp-occupancy-teaching-biweekly', '0 5 * * 3,5', $$select public.mp_run_occupancy_teaching_biweekly();$$);

-- ----------------------------------------------------------------------------
-- get_kos_occupancy_internal: same query as get_kos_occupancy() (0146/0147)
-- but with NO permission check -- that function requires a real
-- authenticated session (auth.uid()) to pass app_has_permission/
-- app_current_branch_id, which a background job's service-role call has
-- none of. Restricted to service_role only (revoked from public/
-- authenticated) so it can't be used to bypass the real RPC's access
-- control from a normal user session.
-- ----------------------------------------------------------------------------
create or replace function public.get_kos_occupancy_internal()
returns table (property_id uuid, property_name text, total integer, terisi integer, kosong integer)
language plpgsql
security definer
stable
set search_path = public, kos_remote
as $$
begin
  return query
    select
      p.id,
      p.nama,
      count(r.id)::integer as total,
      count(r.id) filter (where r.status <> 'available')::integer as terisi,
      count(r.id) filter (where r.status = 'available')::integer as kosong
    from kos_remote.kos_properties p
    left join kos_remote.kos_rooms r on r.property_id = p.id
    where p.is_active
    group by p.id, p.nama
    order by p.nama;
end;
$$;

revoke execute on function public.get_kos_occupancy_internal() from public;
revoke execute on function public.get_kos_occupancy_internal() from authenticated;
grant execute on function public.get_kos_occupancy_internal() to service_role;
