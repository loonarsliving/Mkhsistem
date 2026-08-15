-- Phase 6 (Labor/Kontraktor/Borongan) -- the most financially sensitive part
-- of the Construction Management module. Implements the exact formula from
-- the approved architecture:
--
--   Earned Labor Value = Contract Value x WBS Weight x Incremental Approved Progress
--
-- Overpayment prevention is structural, not just a runtime check:
--   1. A contract's WBS weights must sum to 100% (validated on write).
--   2. Each weight line tracks last_paid_progress_pct -- earned for a period
--      is computed from the INCREMENT since last payment, and that pointer
--      only advances on cm_approve_labor_payment (never on generation), so
--      progress can't be double-claimed by two payments in flight at once.
--   3. Only one non-terminal (draft/pending_approval) payment is allowed per
--      contract at a time -- enforced in cm_generate_labor_payment.
--   4. cm_approve_labor_payment re-derives net cumulative paid vs cumulative
--      contract value right before committing and raises an exception if it
--      would exceed the contract value -- this is the final backstop, not
--      the only line of defense.
--   5. Approved labor payments post an actual construction_expenses row
--      (gaji_tukang, cash) so Finance sees the real cash-out through the
--      SAME ledger already in use -- no second, disconnected finance record.

create table public.cm_contractors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  contractor_type text not null default 'tukang' check (contractor_type in ('tukang', 'mandor', 'subcontractor')),
  phone text,
  bank_account text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cm_labor_contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  unit_id uuid references public.cm_units(id) on delete cascade,
  contractor_id uuid not null references public.cm_contractors(id),
  contract_value numeric(16, 2) not null check (contract_value > 0),
  retention_pct numeric(5, 2) not null default 0 check (retention_pct >= 0 and retention_pct <= 100),
  outstanding_advance numeric(16, 2) not null default 0 check (outstanding_advance >= 0),
  start_date date not null default current_date,
  target_completion date,
  attachment_url text,
  notes text,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index cm_labor_contracts_project_idx on public.cm_labor_contracts (project_id);

create table public.cm_labor_contract_weights (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.cm_labor_contracts(id) on delete cascade,
  project_wbs_id uuid not null references public.cm_project_wbs(id),
  weight_pct numeric(5, 2) not null check (weight_pct > 0 and weight_pct <= 100),
  last_paid_progress_pct numeric(5, 2) not null default 0 check (last_paid_progress_pct >= 0 and last_paid_progress_pct <= 100),
  unique (contract_id, project_wbs_id)
);

create table public.cm_labor_advances (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.cm_labor_contracts(id) on delete cascade,
  amount numeric(16, 2) not null check (amount > 0),
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);

create table public.cm_labor_payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.cm_labor_contracts(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  gross_earned numeric(16, 2) not null default 0,
  retention_amount numeric(16, 2) not null default 0,
  deduction_amount numeric(16, 2) not null default 0,
  advance_recovery_amount numeric(16, 2) not null default 0,
  net_payable numeric(16, 2) not null default 0,
  cumulative_earned_before numeric(16, 2) not null default 0,
  cumulative_paid_before numeric(16, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  linked_expense_id uuid references public.construction_expenses(id),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  approved_by uuid references public.employees(id),
  approved_at timestamptz,
  reject_reason text,
  check (period_end >= period_start)
);
create index cm_labor_payments_contract_idx on public.cm_labor_payments (contract_id);

create table public.cm_labor_deductions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.cm_labor_payments(id) on delete cascade,
  amount numeric(16, 2) not null check (amount > 0),
  category text not null check (category in ('damage', 'rework', 'penalty', 'other')),
  reason text not null,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);

alter table public.cm_contractors enable row level security;
alter table public.cm_labor_contracts enable row level security;
alter table public.cm_labor_contract_weights enable row level security;
alter table public.cm_labor_advances enable row level security;
alter table public.cm_labor_payments enable row level security;
alter table public.cm_labor_deductions enable row level security;

create policy cm_contractors_select on public.cm_contractors for select to authenticated using (true);
create policy cm_labor_contracts_select on public.cm_labor_contracts for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (select 1 from public.construction_projects p join public.employees e on e.branch_id = p.branch_id where p.id = cm_labor_contracts.project_id and e.id = auth.uid())
);
create policy cm_labor_contract_weights_select on public.cm_labor_contract_weights for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (
    select 1 from public.cm_labor_contracts c
    join public.construction_projects p on p.id = c.project_id
    join public.employees e on e.branch_id = p.branch_id
    where c.id = cm_labor_contract_weights.contract_id and e.id = auth.uid()
  )
);
create policy cm_labor_advances_select on public.cm_labor_advances for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (
    select 1 from public.cm_labor_contracts c
    join public.construction_projects p on p.id = c.project_id
    join public.employees e on e.branch_id = p.branch_id
    where c.id = cm_labor_advances.contract_id and e.id = auth.uid()
  )
);
create policy cm_labor_payments_select on public.cm_labor_payments for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (
    select 1 from public.cm_labor_contracts c
    join public.construction_projects p on p.id = c.project_id
    join public.employees e on e.branch_id = p.branch_id
    where c.id = cm_labor_payments.contract_id and e.id = auth.uid()
  )
);
create policy cm_labor_deductions_select on public.cm_labor_deductions for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (
    select 1 from public.cm_labor_payments pay
    join public.cm_labor_contracts c on c.id = pay.contract_id
    join public.construction_projects p on p.id = c.project_id
    join public.employees e on e.branch_id = p.branch_id
    where pay.id = cm_labor_deductions.payment_id and e.id = auth.uid()
  )
);

-- ----------------------------------------------------------------------------
-- cm_create_labor_contract()
-- ----------------------------------------------------------------------------
create or replace function public.cm_create_labor_contract(
  p_project_id uuid, p_contractor_id uuid, p_contract_value numeric, p_retention_pct numeric default 0,
  p_start_date date default current_date, p_target_completion date default null,
  p_notes text default null, p_attachment_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_contract_value <= 0 then
    raise exception 'Nilai kontrak harus lebih dari 0';
  end if;

  insert into public.cm_labor_contracts (project_id, contractor_id, contract_value, retention_pct, start_date, target_completion, notes, attachment_url, created_by)
  values (p_project_id, p_contractor_id, p_contract_value, coalesce(p_retention_pct, 0), coalesce(p_start_date, current_date), p_target_completion, nullif(trim(p_notes), ''), p_attachment_url, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_set_labor_contract_weights(): replaces all weight lines for a contract
-- in one transaction. p_weights is [{"project_wbs_id": "...", "weight_pct": 25}, ...].
-- Validates sum = 100 before committing.
-- ----------------------------------------------------------------------------
create or replace function public.cm_set_labor_contract_weights(p_contract_id uuid, p_weights jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select sum((elem->>'weight_pct')::numeric) into v_total from jsonb_array_elements(p_weights) as elem;
  if v_total is null or abs(v_total - 100) > 0.5 then
    raise exception 'Total bobot borongan harus 100%% (saat ini %)', coalesce(v_total, 0);
  end if;

  delete from public.cm_labor_contract_weights where contract_id = p_contract_id;

  insert into public.cm_labor_contract_weights (contract_id, project_wbs_id, weight_pct)
  select p_contract_id, (elem->>'project_wbs_id')::uuid, (elem->>'weight_pct')::numeric
  from jsonb_array_elements(p_weights) as elem;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_labor_contract_summary(): cumulative earned (recomputed fresh from
-- CURRENT wbs progress, not a cached value) vs cumulative paid, for the
-- "Progress vs Cost" / overpayment-status views.
-- ----------------------------------------------------------------------------
create or replace function public.cm_labor_contract_summary(p_contract_id uuid)
returns table(
  contract_value numeric,
  cumulative_earned numeric,
  cumulative_paid numeric,
  payable numeric,
  outstanding_advance numeric,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_contract_value numeric;
  v_earned numeric;
  v_paid numeric;
  v_advance numeric;
begin
  select cc.contract_value, cc.outstanding_advance into v_contract_value, v_advance
  from public.cm_labor_contracts cc where cc.id = p_contract_id;

  select coalesce(sum(cc.contract_value * w.weight_pct / 100 * wbs.progress_pct / 100), 0)
  into v_earned
  from public.cm_labor_contract_weights w
  join public.cm_labor_contracts cc on cc.id = w.contract_id
  join public.cm_project_wbs wbs on wbs.id = w.project_wbs_id
  where w.contract_id = p_contract_id;

  select coalesce(sum(pay.net_payable), 0) into v_paid
  from public.cm_labor_payments pay
  where pay.contract_id = p_contract_id and pay.status = 'approved';

  return query select
    v_contract_value,
    round(v_earned, 2),
    round(v_paid, 2),
    round(v_earned - v_paid, 2),
    v_advance,
    case when v_paid > v_earned then 'overpayment' else 'normal' end;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_generate_labor_payment(): computes gross earned for the period from
-- each weight line's INCREMENT since last_paid_progress_pct (not from
-- current progress alone) -- this is what makes it a cumulative, not
-- point-in-time, calculation. Refuses to generate if a non-terminal payment
-- already exists for the contract (prevents double-counting the same
-- unclaimed increment across two in-flight payments).
-- ----------------------------------------------------------------------------
create or replace function public.cm_generate_labor_payment(p_contract_id uuid, p_period_start date, p_period_end date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract public.cm_labor_contracts%rowtype;
  v_gross numeric;
  v_retention numeric;
  v_summary record;
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_contract from public.cm_labor_contracts where id = p_contract_id and status = 'active';
  if not found then
    raise exception 'Kontrak tidak ditemukan atau tidak aktif';
  end if;

  if exists (select 1 from public.cm_labor_payments where contract_id = p_contract_id and status = 'draft') then
    raise exception 'Masih ada payment draft yang belum diputuskan untuk kontrak ini';
  end if;

  select coalesce(sum(w.weight_pct / 100 * greatest(wbs.progress_pct - w.last_paid_progress_pct, 0) / 100 * v_contract.contract_value), 0)
  into v_gross
  from public.cm_labor_contract_weights w
  join public.cm_project_wbs wbs on wbs.id = w.project_wbs_id
  where w.contract_id = p_contract_id;

  if v_gross <= 0 then
    raise exception 'Tidak ada progress baru yang bisa dibayarkan sejak pembayaran terakhir';
  end if;

  v_retention := round(v_gross * v_contract.retention_pct / 100, 2);

  select * into v_summary from public.cm_labor_contract_summary(p_contract_id);

  insert into public.cm_labor_payments (contract_id, period_start, period_end, gross_earned, retention_amount, cumulative_earned_before, cumulative_paid_before, created_by)
  values (p_contract_id, p_period_start, p_period_end, round(v_gross, 2), v_retention, v_summary.cumulative_earned - v_gross, v_summary.cumulative_paid, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_add_labor_deduction(): only while the payment is still 'draft'.
-- ----------------------------------------------------------------------------
create or replace function public.cm_add_labor_deduction(p_payment_id uuid, p_amount numeric, p_category text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'Jumlah potongan harus lebih dari 0';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Alasan potongan wajib diisi';
  end if;
  if not exists (select 1 from public.cm_labor_payments where id = p_payment_id and status = 'draft') then
    raise exception 'Payment tidak ditemukan atau sudah diputuskan';
  end if;

  insert into public.cm_labor_deductions (payment_id, amount, category, reason, created_by)
  values (p_payment_id, p_amount, p_category, trim(p_reason), auth.uid());

  update public.cm_labor_payments
    set deduction_amount = (select coalesce(sum(amount), 0) from public.cm_labor_deductions where payment_id = p_payment_id)
    where id = p_payment_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_apply_labor_advance(): records an advance, increases contract's
-- outstanding_advance (recovered automatically from future payments).
-- ----------------------------------------------------------------------------
create or replace function public.cm_apply_labor_advance(p_contract_id uuid, p_amount numeric, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'Jumlah advance harus lebih dari 0';
  end if;

  insert into public.cm_labor_advances (contract_id, amount, note, created_by)
  values (p_contract_id, p_amount, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;

  update public.cm_labor_contracts set outstanding_advance = outstanding_advance + p_amount where id = p_contract_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_approve_labor_payment(): the money-moving step. Recovers outstanding
-- advance automatically (capped so it can't push net_payable negative),
-- advances last_paid_progress_pct on every weight line (only now, not at
-- generation), posts a real construction_expenses cash-out row, and
-- performs the final overpayment backstop check against the contract value
-- before committing.
-- ----------------------------------------------------------------------------
create or replace function public.cm_approve_labor_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.cm_labor_payments%rowtype;
  v_contract public.cm_labor_contracts%rowtype;
  v_contractor_name text;
  v_recovery numeric;
  v_net numeric;
  v_total_paid_after numeric;
  v_expense_id uuid;
  v_project_branch uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_payment from public.cm_labor_payments where id = p_payment_id and status = 'draft';
  if not found then
    raise exception 'Payment tidak ditemukan atau sudah diputuskan';
  end if;

  select * into v_contract from public.cm_labor_contracts where id = v_payment.contract_id;
  select full_name into v_contractor_name from public.cm_contractors where id = v_contract.contractor_id;
  select branch_id into v_project_branch from public.construction_projects where id = v_contract.project_id;

  v_recovery := least(v_contract.outstanding_advance, greatest(v_payment.gross_earned - v_payment.retention_amount - v_payment.deduction_amount, 0));
  v_net := v_payment.gross_earned - v_payment.retention_amount - v_payment.deduction_amount - v_recovery;
  if v_net < 0 then
    raise exception 'Net payable tidak boleh negatif -- periksa retention/potongan/advance';
  end if;

  select coalesce(sum(net_payable), 0) + v_net into v_total_paid_after
  from public.cm_labor_payments where contract_id = v_contract.id and status = 'approved';

  if v_total_paid_after > v_contract.contract_value then
    raise exception 'OVERPAYMENT: total pembayaran (%) akan melebihi nilai kontrak (%)', v_total_paid_after, v_contract.contract_value;
  end if;

  -- Post the actual cash-out through the existing finance ledger.
  insert into public.construction_expenses (project_id, branch_id, expense_type, party_name, description, amount, payment_method, expense_date, created_by)
  values (
    v_contract.project_id, v_project_branch, 'gaji_tukang', coalesce(v_contractor_name, 'Kontraktor'),
    'Pembayaran borongan periode ' || v_payment.period_start || ' s/d ' || v_payment.period_end,
    v_net, 'cash', current_date, auth.uid()
  )
  returning id into v_expense_id;

  update public.cm_labor_payments
    set status = 'approved', advance_recovery_amount = v_recovery, net_payable = v_net,
        linked_expense_id = v_expense_id, approved_by = auth.uid(), approved_at = now()
    where id = p_payment_id;

  update public.cm_labor_contracts set outstanding_advance = outstanding_advance - v_recovery where id = v_contract.id;

  update public.cm_labor_contract_weights w
    set last_paid_progress_pct = wbs.progress_pct
    from public.cm_project_wbs wbs
    where w.project_wbs_id = wbs.id and w.contract_id = v_contract.id;

  return v_expense_id;
end;
$$;

create or replace function public.cm_reject_labor_payment(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.cm_labor_payments set status = 'rejected', reject_reason = nullif(trim(p_reason), '') where id = p_payment_id and status = 'draft';
  if not found then
    raise exception 'Payment tidak ditemukan atau sudah diputuskan';
  end if;
end;
$$;
