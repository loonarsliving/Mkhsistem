-- ============================================================================
-- MK Connect — 0057: CRM payment <-> Finance sync (both directions)
--
-- Outbound: when Finance verifies a customer payment in MK Connect
-- (crm_approve_payment, existing since 0024/0052), auto-create the matching
-- Incoming Cash transaction in MKH Property, plus a separate Sales
-- Commission expense event when commission_amount > 0.
--
-- Inbound: when the CFO explicitly confirms the receipt in MKH Property's
-- ledger (a second, independent confirmation — MKH Property remains the
-- system of record for money), MK Connect reflects that back onto
-- prospect_payments so Payment Status/Collection/Revenue/CRM Status/Sales &
-- Branch Achievement/Dashboard KPIs (all computed live from
-- prospect_payments.status='approved' by crm_sales_stats/crm_branch_stats/
-- crm_national_stats, see 0025/0029/0033/0045/0047) carry a Finance-
-- confirmed audit trail. We deliberately do NOT gate those existing KPI
-- formulas behind finance_confirmed_at — flipping live dashboards to wait on
-- a second manual confirmation is a business-policy change outside this
-- integration's scope; see the integration report.
-- ============================================================================

alter table public.prospect_payments
  add column reference_number text,
  add column unit_label text,
  add column finance_confirmed_at timestamptz,
  add column finance_confirmed_by text,
  add column finance_reference_no text;

comment on column public.prospect_payments.reference_number is
  'Optional bank/transfer reference number entered by Sales/Finance when recording the payment; forwarded to MKH Property Incoming Cash.';
comment on column public.prospect_payments.unit_label is
  'Free-text unit/block identifier (no dedicated units master exists for CRM property projects); forwarded to MKH Property.';
comment on column public.prospect_payments.finance_confirmed_at is
  'Set by the inbound sync-inbound Edge Function when MKH Property''s CFO confirms the ledger entry (independent of MK Connect''s own Finance verification).';
comment on column public.prospect_payments.finance_reference_no is
  'MKH Property jurnal entry number ("no") this payment was posted as, once confirmed.';

alter table public.crm_projects
  add column mkh_project_code text;

comment on column public.crm_projects.mkh_project_code is
  'Maps this CRM project to its MKH Property project code (e.g. AFP/IH/LL/GCI). Required for CRM payments on this project to sync to Finance; unmapped projects fail sync with a logged error for manual follow-up.';

-- ----------------------------------------------------------------------------
-- Outbound: prospect_payments pending -> approved.
-- ----------------------------------------------------------------------------
create or replace function public.trg_prospect_payment_approved_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prospect public.prospects%rowtype;
  v_project public.crm_projects%rowtype;
  v_branch public.branches%rowtype;
  v_sales public.employees%rowtype;
begin
  if new.status = 'approved' and old.status <> 'approved' then
    select * into v_prospect from public.prospects where id = new.prospect_id;
    select * into v_project from public.crm_projects where id = v_prospect.project_id;
    select * into v_branch from public.branches where id = v_prospect.branch_id;
    select * into v_sales from public.employees where id = v_prospect.sales_id;

    insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
    values (
      'outbound', 'crm_payment_approved', 'prospect_payments', new.id,
      'mkc:crm_payment:' || new.id,
      jsonb_build_object(
        'prospect_payment_id', new.id,
        'prospect_id', new.prospect_id,
        'customer_name', v_prospect.customer_name,
        'project_name', v_project.name,
        'mkh_project_code', v_project.mkh_project_code,
        'unit_label', new.unit_label,
        'payment_type', new.payment_type,
        'amount', new.amount,
        'payment_date', new.payment_date,
        'reference_number', new.reference_number,
        'sales_name', v_sales.full_name,
        'branch_name', v_branch.name
      )
    )
    on conflict (idempotency_key) do nothing;

    if coalesce(new.commission_amount, 0) > 0 then
      insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
      values (
        'outbound', 'sales_commission_approved', 'prospect_payments', new.id,
        'mkc:commission:' || new.id,
        jsonb_build_object(
          'prospect_payment_id', new.id,
          'sales_id', v_prospect.sales_id,
          'sales_name', v_sales.full_name,
          'branch_name', v_branch.name,
          'mkh_project_code', v_project.mkh_project_code,
          'commission_amount', new.commission_amount,
          'payment_date', new.payment_date
        )
      )
      on conflict (idempotency_key) do nothing;
    end if;
  end if;

  return new;
end;
$$;

create trigger prospect_payment_after_update_sync
  after update on public.prospect_payments
  for each row execute function public.trg_prospect_payment_approved_sync();

comment on function public.trg_prospect_payment_approved_sync is
  'Enqueues MKH Property sync events when Finance approves a customer payment in the CRM (crm_approve_payment). Two events: the incoming cash transaction itself, and (if any) the sales commission expense.';
