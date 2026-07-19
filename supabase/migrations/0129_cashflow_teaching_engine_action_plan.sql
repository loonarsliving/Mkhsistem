-- ============================================================================
-- MK Connect — 0129: AI Knowledge & Teaching Engine (4/4) — Cashflow
-- Teaching Engine (low-balance Action Plan for Kepala Cabang)
--
-- Owner's ask: when a branch's operational balance drops below
-- Rp100.000.000 (or whatever minimum the company sets for that branch), the
-- system must not just warn -- it must identify the likely cause, assess
-- risk level, pull the best recommendation from the Cashflow Intelligence
-- knowledge bank (0127), and hand Kepala Cabang a concrete, prioritized
-- Action Plan (what sales to chase, what to accelerate, what spending to
-- delay, what operational focus to shift, what risk to avoid, and a
-- recovery target).
--
-- Deliberately a NEW, separate mechanism from the existing branch-balance
-- advisory (0098/0099/0100, app/api/ai/branch-balance-advisory) rather than
-- reusing its alert_threshold/situation_type machinery:
-- - That system's alert_threshold is each branch's real payroll + operating
--   cost floor (Jogja's is Rp26.000.000, per 0099) and its advisory is a
--   short KUR/percepat-penjualan style warning, delivered as an in-app +
--   WhatsApp mkc_notifications row (branch_balance_alert) -- it shows up in
--   the notification bell.
-- - This module's threshold (Rp100.000.000) is a different, higher
--   "start teaching mode" line specific to this new module, its output is a
--   full structured Action Plan (not a short warning), and per the owner's
--   explicit ask it must have ZERO UI/menu trace -- WhatsApp only, direct
--   sendWhatsAppText, no mkc_notifications row at all (same pattern as
--   sales_closing_tips_broadcast, 0117).
-- Both can coexist and fire independently on the same branch; they answer
-- different questions (short cash warning vs. full recovery playbook).
--
-- Scope, per the owner's explicit ask: ONLY Jogja (Loonars Living villa
-- leasehold) -- reuses finance_branch_balances (already synced from MKH
-- Property for every branch) but only Jogja gets a
-- cashflow_teaching_threshold set, so the check is a no-op everywhere else.
-- ============================================================================

alter table public.finance_branch_balances
  add column cashflow_teaching_threshold numeric;

comment on column public.finance_branch_balances.cashflow_teaching_threshold is
  'Minimum operational balance for the Cashflow Teaching Engine (0129) -- once saldo drops below this, finance_run_cashflow_teaching_check drafts a full Action Plan for Kepala Cabang. NULL = module not active for this branch. Distinct from alert_threshold (0099), which is the short branch-balance-advisory warning''s payroll/opex floor. Only set for Jogja, per the owner''s explicit ask that this whole module is Jogja-only.';

update public.finance_branch_balances set cashflow_teaching_threshold = 100000000
where branch_name = 'Jogja';

alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation', 'knowledge_bank_refresh', 'sales_closing_tips_broadcast',
    'leasehold_competitor_comparison', 'competitor_discovery', 'investor_intelligence_refresh',
    'cashflow_intelligence_refresh', 'sales_teaching_weekly',
    -- This migration
    'cashflow_action_plan'
  ));

-- ----------------------------------------------------------------------------
-- finance_cashflow_action_plan_log: idempotency/cooldown guard, mirrors
-- crm_sales_coaching_log (0101) -- at most once a day per branch, so
-- Kepala Cabang isn't paged with a fresh Action Plan every single cron tick
-- while the balance stays below threshold.
-- ----------------------------------------------------------------------------
create table public.finance_cashflow_action_plan_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  saldo_at_trigger numeric not null,
  created_at timestamptz not null default now()
);
create index finance_cashflow_action_plan_log_branch_idx on public.finance_cashflow_action_plan_log (branch_id, created_at desc);
alter table public.finance_cashflow_action_plan_log enable row level security;

comment on table public.finance_cashflow_action_plan_log is
  'One row per Cashflow Teaching Engine Action Plan sent (finance_run_cashflow_teaching_check) -- throttles to at most once every 24 hours per branch while saldo stays below cashflow_teaching_threshold.';

create or replace function public.finance_run_cashflow_teaching_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance record;
begin
  for v_balance in
    select branch_id, branch_name, saldo, cashflow_teaching_threshold
    from public.finance_branch_balances
    where cashflow_teaching_threshold is not null
      and saldo < cashflow_teaching_threshold
  loop
    if not exists (
      select 1 from public.finance_cashflow_action_plan_log
      where branch_id = v_balance.branch_id and created_at >= now() - interval '24 hours'
    ) then
      insert into public.ai_job_queue (job_type, payload)
      values ('cashflow_action_plan', jsonb_build_object(
        'branch_id', v_balance.branch_id,
        'branch_name', v_balance.branch_name,
        'saldo', v_balance.saldo,
        'threshold', v_balance.cashflow_teaching_threshold
      ));

      insert into public.finance_cashflow_action_plan_log (branch_id, saldo_at_trigger)
      values (v_balance.branch_id, v_balance.saldo);
    end if;
  end loop;
end;
$$;

comment on function public.finance_run_cashflow_teaching_check is
  'Daily: for every branch below its cashflow_teaching_threshold (today, only Jogja), enqueues a cashflow_action_plan job (-> generateCashflowActionPlan, grounded in the Cashflow Intelligence bank, 0127) -- root cause, risk level, and a concrete Action Plan for Kepala Cabang, delivered via WhatsApp only.';

-- 02:00 UTC (10:00 WITA) daily -- an hour after the existing branch-balance
-- advisory (01:00 UTC, 0098) so the two independent checks don't contend
-- for the same finance_branch_balances read in the same instant.
select cron.schedule('finance-cashflow-teaching-daily', '0 2 * * *', $$select public.finance_run_cashflow_teaching_check();$$);
