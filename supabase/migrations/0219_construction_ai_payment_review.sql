-- Owner's request: connect the existing WA daily-photo-progress feature
-- (Fasly/Endy sending afternoon photos, already assessed per-photo by
-- Gemini Vision into construction_progress_photos.ai_stage/ai_progress_pct/
-- ai_notes/ai_concerns via lib/ai/domains/construction-progress-vision.ts)
-- into the Construction Management weekly labor payment flow, as one more
-- benchmark the Kepala Cabang/Finance can lean on before approving a
-- borongan payment -- and add an AI-assisted synthesis across that
-- evidence for the specific payment being reviewed.
--
-- Linkage path: construction_progress_photos.employee_id -> employees ->
-- employees.branch_id -> construction_projects.branch_id -> project's
-- active labor contract -- there is no direct FK from photos to a cm_*
-- project (construction_blocks.project_code is legacy free text, not a
-- real FK), so branch_id match is the bridge, same join pattern already
-- used throughout this module for branch scoping.
--
-- Deliberately reuses each photo's ALREADY-STORED AI assessment rather
-- than re-running Gemini Vision on every photo again -- cheaper, faster,
-- and the per-photo visual assessment is a solved problem; what's new
-- here is a text-only synthesis across a week's worth of already-assessed
-- photos plus the WBS progress claim, which needs no image input at all.

alter table public.cm_labor_payments
  add column if not exists ai_reviewed_at timestamptz,
  add column if not exists ai_verdict text check (ai_verdict in ('sesuai', 'perlu_dicek', 'tidak_sesuai')),
  add column if not exists ai_summary text,
  add column if not exists ai_concerns text[] not null default '{}',
  add column if not exists ai_photo_count integer not null default 0;

-- ----------------------------------------------------------------------------
-- cm_labor_payment_ai_context(): gathers everything the AI reviewer needs
-- for one payment into a single jsonb payload -- contract/period info, the
-- WBS weight breakdown behind the earned amount, and photo evidence from
-- the contract's branch within the payment's period. Read-only, permission
-- gated same as the rest of the labor module.
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
  v_wbs jsonb;
  v_photos jsonb;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_payment from public.cm_labor_payments where id = p_payment_id;
  if not found then
    raise exception 'Payment tidak ditemukan';
  end if;

  select * into v_contract from public.cm_labor_contracts where id = v_payment.contract_id;
  select full_name into v_contractor_name from public.cm_contractors where id = v_contract.contractor_id;
  select name, branch_id into v_project_name, v_branch_id from public.construction_projects where id = v_contract.project_id;

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

-- ----------------------------------------------------------------------------
-- cm_save_labor_payment_ai_review(): persists the AI synthesis onto the
-- payment row. Only while the payment is still 'draft' -- an approved or
-- rejected payment is a closed financial record, its AI annotation (if any)
-- should stay whatever it was at decision time, not be rewritten after.
-- ----------------------------------------------------------------------------
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
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if p_verdict not in ('sesuai', 'perlu_dicek', 'tidak_sesuai') then
    raise exception 'Verdict tidak valid: %', p_verdict;
  end if;

  if not exists (select 1 from public.cm_labor_payments where id = p_payment_id and status = 'draft') then
    raise exception 'Payment tidak ditemukan atau sudah diputuskan';
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
