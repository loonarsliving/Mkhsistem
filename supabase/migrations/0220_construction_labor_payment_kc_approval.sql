-- Owner's clarification of the real weekly borongan workflow: Finance
-- (e.g. Endy, holds construction_finance.manage) generates the weekly
-- payment draft -> Kepala Cabang reviews and approves it (own branch only)
-- -> forwarded to Super Admin/Finance for final approval, which is the step
-- that actually posts cash out. Previously cm_labor_payments went straight
-- from 'draft' to a single manage-only approval -- Kepala Cabang had no
-- seat in the process at all. This adds the missing middle stage.
--
-- Also: labor contracts can now optionally be tied to a specific cm_units
-- row (going forward, for new per-unit projects -- Kendari's existing
-- project predates unit tracking and stays project-level), so "sisa
-- borongan tukang per unit" is a real, groupable number once new projects
-- start using units.

-- ----------------------------------------------------------------------------
-- New permission: Kepala Cabang's own-branch approval seat in the borongan
-- payment flow. Distinct from construction_finance.submit (Kepala Cabang
-- already has that, for expense input) and .manage (Finance/Super Admin/
-- Direktur Operasional, the final money-moving authority).
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('construction_finance.approve_branch', 'Kepala Cabang approves/rejects own branch''s weekly borongan payment submissions before final Super Admin/Finance approval')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'kepala_cabang' and p.key = 'construction_finance.approve_branch'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- cm_labor_payments: new intermediate status + who/when for the Kepala
-- Cabang decision, kept separate from approved_by/approved_at/reject_reason
-- which now refer specifically to the FINAL decision.
-- ----------------------------------------------------------------------------
alter table public.cm_labor_payments drop constraint cm_labor_payments_status_check;
alter table public.cm_labor_payments add constraint cm_labor_payments_status_check
  check (status = any (array['draft', 'kc_approved', 'approved', 'rejected']));

alter table public.cm_labor_payments
  add column if not exists kc_decided_by uuid references public.employees(id),
  add column if not exists kc_decided_at timestamptz,
  add column if not exists kc_reject_reason text;

-- ----------------------------------------------------------------------------
-- cm_kepala_cabang_decide_labor_payment(): the new middle stage. Kepala
-- Cabang (or anyone holding .manage, as an override) can approve a 'draft'
-- payment forward to 'kc_approved', or reject it outright. Own-branch only
-- for non-manage callers -- same branch-match check used by RLS on these
-- tables, re-implemented here explicitly because this is a security
-- definer function and therefore bypasses RLS.
-- ----------------------------------------------------------------------------
create function public.cm_kepala_cabang_decide_labor_payment(p_payment_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_branch uuid;
  v_caller_branch uuid;
  v_is_manage boolean;
begin
  v_is_manage := public.app_has_permission('construction_finance.manage');
  if not v_is_manage and not public.app_has_permission('construction_finance.approve_branch') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select p.branch_id into v_project_branch
  from public.cm_labor_payments pay
  join public.cm_labor_contracts c on c.id = pay.contract_id
  join public.construction_projects p on p.id = c.project_id
  where pay.id = p_payment_id;

  if v_project_branch is null then
    raise exception 'Payment tidak ditemukan';
  end if;

  if not v_is_manage then
    select branch_id into v_caller_branch from public.employees where id = auth.uid();
    if v_caller_branch is null or v_caller_branch != v_project_branch then
      raise exception 'Anda hanya bisa menyetujui pengajuan cabang sendiri';
    end if;
  end if;

  if p_approve then
    update public.cm_labor_payments
      set status = 'kc_approved', kc_decided_by = auth.uid(), kc_decided_at = now()
      where id = p_payment_id and status = 'draft';
  else
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'Alasan penolakan wajib diisi';
    end if;
    update public.cm_labor_payments
      set status = 'rejected', kc_decided_by = auth.uid(), kc_decided_at = now(), kc_reject_reason = trim(p_reason)
      where id = p_payment_id and status = 'draft';
  end if;

  if not found then
    raise exception 'Payment tidak ditemukan atau sudah diputuskan';
  end if;
end;
$$;

-- Final approval now only actionable after Kepala Cabang has forwarded it.
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

  select * into v_payment from public.cm_labor_payments where id = p_payment_id and status = 'kc_approved';
  if not found then
    raise exception 'Payment tidak ditemukan atau belum disetujui Kepala Cabang';
  end if;

  select * into v_contract from public.cm_labor_contracts where id = v_payment.contract_id;
  select full_name into v_contractor_name from public.cm_contractors where id = v_contract.contractor_id;
  select branch_id into v_project_branch from public.construction_projects where id = v_contract.project_id;

  v_recovery := least(v_contract.outstanding_advance, greatest(v_payment.gross_earned - v_payment.retention_amount - v_payment.deduction_amount, 0));
  v_net := v_payment.gross_earned - v_payment.retention_amount - v_payment.deduction_amount - v_recovery;

  select coalesce(sum(pay.net_payable), 0) + v_net into v_total_paid_after
  from public.cm_labor_payments pay
  where pay.contract_id = v_contract.id and pay.status = 'approved';

  if v_total_paid_after > v_contract.contract_value then
    raise exception 'OVERPAYMENT: total pembayaran (%) akan melebihi nilai kontrak (%)', v_total_paid_after, v_contract.contract_value;
  end if;

  -- party_name is NOT NULL on construction_expenses -- the original 0213
  -- insert never set it (pre-existing bug, caught here since this is the
  -- first time a real approval flow got tested end-to-end).
  insert into public.construction_expenses (project_id, branch_id, expense_type, party_name, payment_method, amount, description, expense_date, created_by)
  values (v_contract.project_id, v_project_branch, 'gaji_tukang', coalesce(v_contractor_name, '-'), 'cash', v_net,
    format('Pembayaran borongan %s (%s s/d %s)', coalesce(v_contractor_name, '-'), v_payment.period_start, v_payment.period_end),
    current_date, auth.uid())
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

-- Super Admin/Finance can still reject at either stage (draft, in case
-- Kepala Cabang hasn't gotten to it yet, or kc_approved, e.g. a budget
-- issue caught after the branch already signed off).
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

  update public.cm_labor_payments set status = 'rejected', reject_reason = nullif(trim(p_reason), '')
    where id = p_payment_id and status in ('draft', 'kc_approved');
  if not found then
    raise exception 'Payment tidak ditemukan atau sudah diputuskan';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- AI review (0219) now also usable by the Kepala Cabang stage, own branch
-- only for non-manage callers -- these are security definer, so the branch
-- check has to be explicit rather than relying on RLS.
-- ----------------------------------------------------------------------------
create or replace function public.cm_labor_payment_ai_context(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payment public.cm_labor_payments%rowtype;
  v_contract public.cm_labor_contracts%rowtype;
  v_contractor_name text;
  v_project_name text;
  v_branch_id uuid;
  v_caller_branch uuid;
  v_is_manage boolean;
  v_wbs jsonb;
  v_photos jsonb;
begin
  v_is_manage := public.app_has_permission('construction_finance.manage');
  if not v_is_manage and not public.app_has_permission('construction_finance.approve_branch') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_payment from public.cm_labor_payments where id = p_payment_id;
  if not found then
    raise exception 'Payment tidak ditemukan';
  end if;

  select * into v_contract from public.cm_labor_contracts where id = v_payment.contract_id;
  select full_name into v_contractor_name from public.cm_contractors where id = v_contract.contractor_id;
  select name, branch_id into v_project_name, v_branch_id from public.construction_projects where id = v_contract.project_id;

  if not v_is_manage then
    select branch_id into v_caller_branch from public.employees where id = auth.uid();
    if v_caller_branch is null or v_caller_branch != v_branch_id then
      raise exception 'Anda hanya bisa melihat pengajuan cabang sendiri';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', wbs.name,
    'weight_pct', w.weight_pct,
    'progress_pct', wbs.progress_pct,
    'last_paid_progress_pct', w.last_paid_progress_pct
  ) order by wbs.sort_order), '[]'::jsonb)
  into v_wbs
  from public.cm_labor_contract_weights w
  join public.cm_project_wbs wbs on wbs.id = w.project_wbs_id
  where w.contract_id = v_contract.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'report_date', p.report_date,
    'employee_name', e.full_name,
    'caption', p.caption,
    'ai_stage', p.ai_stage,
    'ai_progress_pct', p.ai_progress_pct,
    'ai_notes', p.ai_notes,
    'ai_concerns', p.ai_concerns
  ) order by p.report_date), '[]'::jsonb)
  into v_photos
  from public.construction_progress_photos p
  join public.employees e on e.id = p.employee_id
  where e.branch_id = v_branch_id
    and p.report_date between v_payment.period_start and v_payment.period_end;

  return jsonb_build_object(
    'contractor_name', coalesce(v_contractor_name, '-'),
    'project_name', coalesce(v_project_name, '-'),
    'period_start', v_payment.period_start,
    'period_end', v_payment.period_end,
    'gross_earned', v_payment.gross_earned,
    'wbs_breakdown', v_wbs,
    'photos', v_photos
  );
end;
$$;

create or replace function public.cm_save_labor_payment_ai_review(
  p_payment_id uuid,
  p_verdict text,
  p_summary text,
  p_concerns text[],
  p_photo_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_caller_branch uuid;
  v_is_manage boolean;
begin
  v_is_manage := public.app_has_permission('construction_finance.manage');
  if not v_is_manage and not public.app_has_permission('construction_finance.approve_branch') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if p_verdict not in ('sesuai', 'perlu_dicek', 'tidak_sesuai') then
    raise exception 'Verdict tidak valid: %', p_verdict;
  end if;

  select p.branch_id into v_branch_id
  from public.cm_labor_payments pay
  join public.cm_labor_contracts c on c.id = pay.contract_id
  join public.construction_projects p on p.id = c.project_id
  where pay.id = p_payment_id and pay.status in ('draft', 'kc_approved');

  if v_branch_id is null then
    raise exception 'Payment tidak ditemukan atau sudah diputuskan';
  end if;

  if not v_is_manage then
    select branch_id into v_caller_branch from public.employees where id = auth.uid();
    if v_caller_branch is null or v_caller_branch != v_branch_id then
      raise exception 'Anda hanya bisa menganalisa pengajuan cabang sendiri';
    end if;
  end if;

  update public.cm_labor_payments
    set ai_reviewed_at = now(),
        ai_verdict = p_verdict,
        ai_summary = p_summary,
        ai_concerns = coalesce(p_concerns, '{}'),
        ai_photo_count = coalesce(p_photo_count, 0)
    where id = p_payment_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cm_labor_contract_summary(): closes a pre-existing gap -- this
-- security-definer function had no permission/branch check at all, so any
-- authenticated employee could call it for any contract_id company-wide.
-- Not a new hole opened by this migration, but worth closing now that this
-- data is being surfaced to a broader (branch-scoped) audience.
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
  v_branch_id uuid;
  v_caller_branch uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    select p.branch_id into v_branch_id
    from public.cm_labor_contracts c
    join public.construction_projects p on p.id = c.project_id
    where c.id = p_contract_id;

    select branch_id into v_caller_branch from public.employees where id = auth.uid();
    if v_branch_id is null or v_caller_branch is null or v_caller_branch != v_branch_id then
      raise exception 'Insufficient permission' using errcode = '42501';
    end if;
  end if;

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
-- Labor contracts can now optionally target a specific unit -- forward
-- looking, for new per-unit projects. cm_units already existed with no FK
-- from cm_labor_contracts using it yet.
-- ----------------------------------------------------------------------------
drop function public.cm_create_labor_contract(uuid, uuid, numeric, numeric, date, date, text, text);

create function public.cm_create_labor_contract(
  p_project_id uuid,
  p_contractor_id uuid,
  p_contract_value numeric,
  p_retention_pct numeric,
  p_start_date date,
  p_target_completion date default null,
  p_notes text default null,
  p_attachment_url text default null,
  p_unit_id uuid default null
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
  if p_unit_id is not null and not exists (select 1 from public.cm_units where id = p_unit_id and project_id = p_project_id) then
    raise exception 'Unit tidak ditemukan pada proyek ini';
  end if;

  insert into public.cm_labor_contracts (project_id, unit_id, contractor_id, contract_value, retention_pct, start_date, target_completion, notes, attachment_url, created_by)
  values (p_project_id, p_unit_id, p_contractor_id, p_contract_value, coalesce(p_retention_pct, 0), p_start_date, p_target_completion, nullif(trim(p_notes), ''), nullif(trim(p_attachment_url), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;
