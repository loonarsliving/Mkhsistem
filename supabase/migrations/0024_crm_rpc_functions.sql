-- ============================================================================
-- MK Connect — 0024: CRM transactional RPC functions (business logic)
-- Same SECURITY DEFINER + own-permission-check pattern as 0007.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Duplicate check: exact phone match OR fuzzy name match (pg_trgm, already
-- enabled in 0001). SECURITY DEFINER so it can see across the whole company
-- database regardless of the caller's own view_own-only RLS scope -- the
-- duplicate check must never be blind to a prospect owned by another Sales.
-- ----------------------------------------------------------------------------
create or replace function public.crm_find_duplicate_prospect(p_phone text, p_customer_name text)
returns table (
  id uuid,
  customer_name text,
  phone text,
  status text,
  created_at timestamptz,
  sales_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.customer_name, p.phone, p.status, p.created_at, e.full_name
  from public.prospects p
  join public.employees e on e.id = p.sales_id
  where p.deleted_at is null
    and public.app_has_permission('prospect.create')
    and (
      p.phone_normalized = regexp_replace(p_phone, '[^0-9]', '', 'g')
      or similarity(unaccent(lower(p.customer_name)), unaccent(lower(p_customer_name))) > 0.45
    )
  order by (p.phone_normalized = regexp_replace(p_phone, '[^0-9]', '', 'g')) desc,
           similarity(unaccent(lower(p.customer_name)), unaccent(lower(p_customer_name))) desc
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- Create prospect. Re-checks for a duplicate itself (the client is expected
-- to have already called crm_find_duplicate_prospect for the friendly "This
-- prospect already exists" dialog) and additionally relies on the partial
-- unique index on phone_normalized (0022) as a race-condition backstop.
-- ----------------------------------------------------------------------------
create or replace function public.crm_create_prospect(
  p_customer_name text,
  p_phone text,
  p_project_id uuid,
  p_house_type text,
  p_city text,
  p_lead_source text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_branch_id uuid;
  v_prospect_id uuid;
begin
  if not public.app_has_permission('prospect.create') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select branch_id into v_branch_id from public.employees where id = v_user_id and deleted_at is null;
  if v_branch_id is null then
    raise exception 'Employee record not found';
  end if;

  if exists (select 1 from public.crm_find_duplicate_prospect(p_phone, p_customer_name)) then
    raise exception 'This prospect already exists' using errcode = 'P0001';
  end if;

  begin
    insert into public.prospects (
      customer_name, phone, project_id, house_type, city, lead_source, notes,
      sales_id, branch_id, created_by, updated_by
    ) values (
      p_customer_name, p_phone, p_project_id, p_house_type, p_city, p_lead_source, p_notes,
      v_user_id, v_branch_id, v_user_id, v_user_id
    )
    returning id into v_prospect_id;
  exception when unique_violation then
    raise exception 'This prospect already exists' using errcode = 'P0001';
  end;

  return v_prospect_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Add follow-up. Auto-transitions Red/Inactive -> Yellow (first contact) and
-- stamps last_follow_up_at, which both the reminder cron (0026) and the
-- dashboard "Late Follow Up" figure key off.
-- ----------------------------------------------------------------------------
create or replace function public.crm_add_follow_up(
  p_prospect_id uuid,
  p_activity_type text,
  p_activity_date date,
  p_activity_time time,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_prospect public.prospects%rowtype;
  v_follow_up_id uuid;
begin
  if not public.app_has_permission('prospect.follow_up_create') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_prospect from public.prospects where id = p_prospect_id and deleted_at is null;
  if not found then
    raise exception 'Prospect not found';
  end if;

  if not (
    v_prospect.sales_id = v_user_id
    or public.app_has_permission('prospect.manage')
    or (public.app_has_permission('prospect.view_branch') and v_prospect.branch_id = public.app_current_branch_id())
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if v_prospect.status = 'closing' then
    raise exception 'Cannot add a follow up to a Closing prospect';
  end if;

  insert into public.prospect_follow_ups (prospect_id, activity_type, activity_date, activity_time, notes, created_by)
  values (p_prospect_id, p_activity_type, p_activity_date, p_activity_time, p_notes, v_user_id)
  returning id into v_follow_up_id;

  update public.prospects set
    last_follow_up_at = now(),
    status = case when status in ('red', 'inactive') then 'yellow' else status end,
    updated_by = v_user_id
  where id = p_prospect_id;

  return v_follow_up_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Sales marks a prospect ready ("Green"). This is explicitly NOT closing --
-- it only queues the prospect for Finance verification.
-- ----------------------------------------------------------------------------
create or replace function public.crm_set_prospect_green(p_prospect_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_prospect public.prospects%rowtype;
begin
  select * into v_prospect from public.prospects where id = p_prospect_id and deleted_at is null;
  if not found then
    raise exception 'Prospect not found';
  end if;
  if not (v_prospect.sales_id = v_user_id or public.app_has_permission('prospect.manage')) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if v_prospect.status not in ('red', 'yellow') then
    raise exception 'Only a Red or Yellow prospect can be marked ready for verification';
  end if;

  update public.prospects set status = 'green', updated_by = v_user_id where id = p_prospect_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Finance records an incoming payment (pending until approved).
-- ----------------------------------------------------------------------------
create or replace function public.crm_record_payment(
  p_prospect_id uuid,
  p_payment_type text,
  p_amount numeric,
  p_payment_date date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment_id uuid;
begin
  if not public.app_has_permission('prospect.finance_verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if not exists (select 1 from public.prospects where id = p_prospect_id and deleted_at is null) then
    raise exception 'Prospect not found';
  end if;

  insert into public.prospect_payments (prospect_id, payment_type, amount, payment_date, notes, recorded_by)
  values (p_prospect_id, p_payment_type, p_amount, p_payment_date, p_notes, v_user_id)
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Finance approves a payment. This is the ONLY path that increases
-- Collection/Commission and the ONLY path that can flip Green -> Closing --
-- "no manual calculation" anywhere else. commission_amount is computed once
-- here from the sales rep's commission_percent for the payment's period and
-- persisted on the payment row, so every report sums the same number.
-- ----------------------------------------------------------------------------
create or replace function public.crm_approve_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.prospect_payments%rowtype;
  v_prospect public.prospects%rowtype;
  v_commission_percent numeric(5,2);
  v_commission_amount numeric(14,2);
  v_period_month smallint;
  v_period_year smallint;
begin
  if not public.app_has_permission('prospect.finance_verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_payment from public.prospect_payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Payment already decided';
  end if;

  select * into v_prospect from public.prospects where id = v_payment.prospect_id for update;

  v_period_month := extract(month from v_payment.payment_date)::smallint;
  v_period_year := extract(year from v_payment.payment_date)::smallint;

  select commission_percent into v_commission_percent
  from public.sales_targets
  where sales_id = v_prospect.sales_id and period_month = v_period_month and period_year = v_period_year;
  v_commission_percent := coalesce(v_commission_percent, 0);
  v_commission_amount := round(v_payment.amount * v_commission_percent / 100, 2);

  update public.prospect_payments set
    status = 'approved',
    commission_amount = v_commission_amount,
    approved_by = v_user_id,
    approved_at = now()
  where id = p_payment_id;

  update public.prospects set
    total_collection = total_collection + v_payment.amount,
    total_commission = total_commission + v_commission_amount,
    status = case when status = 'green' then 'closing' else status end,
    closed_at = case when status = 'green' then now() else closed_at end,
    updated_by = v_user_id
  where id = v_prospect.id;

  insert into public.mkc_notifications (user_id, type, title, body, link)
  values (
    v_prospect.sales_id,
    'crm',
    'Pembayaran disetujui: ' || v_prospect.customer_name,
    'Finance menyetujui ' || v_payment.payment_type || ' sebesar Rp ' || to_char(v_payment.amount, 'FM999,999,999,999'),
    '/crm/prospects/' || v_prospect.id
  );
end;
$$;

create or replace function public.crm_reject_payment(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.app_has_permission('prospect.finance_verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.prospect_payments set
    status = 'rejected', approved_by = v_user_id, approved_at = now(), rejection_reason = p_reason
  where id = p_payment_id and status = 'pending';

  if not found then
    raise exception 'Payment not found or already decided';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Director sets/updates a Sales rep's monthly target + commission %.
-- ----------------------------------------------------------------------------
create or replace function public.crm_upsert_sales_target(
  p_sales_id uuid,
  p_period_month smallint,
  p_period_year smallint,
  p_target_units integer,
  p_commission_percent numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_id uuid;
begin
  if not public.app_has_permission('sales_target.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  insert into public.sales_targets (sales_id, period_month, period_year, target_units, commission_percent, created_by, updated_by)
  values (p_sales_id, p_period_month, p_period_year, p_target_units, p_commission_percent, v_user_id, v_user_id)
  on conflict (sales_id, period_month, period_year) do update set
    target_units = excluded.target_units,
    commission_percent = excluded.commission_percent,
    updated_by = v_user_id
  returning id into v_target_id;

  return v_target_id;
end;
$$;
