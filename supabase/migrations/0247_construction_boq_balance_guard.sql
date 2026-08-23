-- ============================================================================
-- MK Connect — 0247: cm_boq_balance() + wire it into cm_submit_purchase_request
-- (punch list item #3 from "Peta Celah Stok Kontraktor").
--
-- The existing guard in cm_submit_purchase_request (0212) compares a
-- request against cm_material_requirement()'s progress-based suggestion
-- only. This adds a second, independent signal: how much of the BOQ's
-- planned quantity for that material is actually left, after what's
-- already been bought (cm_stock_movements, direction='in') and what's
-- already requested and not yet rejected (cm_purchase_requests, pending or
-- approved). Same soft-guard shape as the existing one -- requires a
-- reason, doesn't hard-block -- and reuses the same 10% tolerance already
-- established there, for consistency.
--
-- Deliberately read-only/additive: cm_submit_purchase_request keeps its
-- exact 4-argument signature, so this is a plain CREATE OR REPLACE, no
-- DROP needed.
-- ============================================================================

create or replace function public.cm_boq_balance(p_project_id uuid, p_material_id uuid)
returns table(
  boq_quantity numeric,
  purchased_quantity numeric,
  open_pr_quantity numeric,
  remaining_quantity numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(b.quantity) from public.cm_project_boq b where b.project_id = p_project_id and b.unit_id is null and b.material_id = p_material_id), 0) as boq_quantity,
    coalesce((select sum(m.quantity) from public.cm_stock_movements m where m.project_id = p_project_id and m.material_id = p_material_id and m.direction = 'in'), 0) as purchased_quantity,
    coalesce((select sum(pr.requested_quantity) from public.cm_purchase_requests pr where pr.project_id = p_project_id and pr.material_id = p_material_id and pr.status in ('pending', 'approved')), 0) as open_pr_quantity,
    coalesce((select sum(b.quantity) from public.cm_project_boq b where b.project_id = p_project_id and b.unit_id is null and b.material_id = p_material_id), 0)
      - coalesce((select sum(m.quantity) from public.cm_stock_movements m where m.project_id = p_project_id and m.material_id = p_material_id and m.direction = 'in'), 0)
      - coalesce((select sum(pr.requested_quantity) from public.cm_purchase_requests pr where pr.project_id = p_project_id and pr.material_id = p_material_id and pr.status in ('pending', 'approved')), 0) as remaining_quantity;
$$;

create or replace function public.cm_submit_purchase_request(p_project_id uuid, p_material_id uuid, p_requested_quantity numeric, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_branch uuid;
  v_project_branch uuid;
  v_billing_type text;
  v_suggested numeric;
  v_boq_remaining numeric;
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.submit') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_requested_quantity <= 0 then
    raise exception 'Jumlah harus lebih dari 0';
  end if;

  select branch_id, billing_type into v_project_branch, v_billing_type from public.construction_projects where id = p_project_id;
  if v_project_branch is null then
    raise exception 'Proyek tidak ditemukan';
  end if;
  select branch_id into v_caller_branch from public.employees where id = v_caller;
  if not public.app_has_permission('construction_finance.manage') and v_project_branch is distinct from v_caller_branch then
    raise exception 'Proyek ini bukan bagian dari cabang Anda' using errcode = '42501';
  end if;

  select required_quantity - stock_quantity into v_suggested
  from public.cm_material_requirement(p_project_id)
  where material_id = p_material_id;
  v_suggested := greatest(coalesce(v_suggested, 0), 0);

  if v_suggested > 0 and p_requested_quantity > v_suggested * 1.1 and (p_reason is null or trim(p_reason) = '') then
    raise exception 'Jumlah diminta (%) jauh di atas saran (%) -- wajib isi alasan', p_requested_quantity, v_suggested;
  end if;

  -- BOQ-balance guard: only enforced for cost-by-fee projects (billing_type
  -- is NULL for Kendari and every other unclassified project today, so this
  -- block never fires for them -- see 0245).
  if v_billing_type = 'cost_by_fee' then
    select remaining_quantity into v_boq_remaining from public.cm_boq_balance(p_project_id, p_material_id);
    if v_boq_remaining is not null and v_boq_remaining > 0 and p_requested_quantity > v_boq_remaining * 1.1 and (p_reason is null or trim(p_reason) = '') then
      raise exception 'Jumlah diminta (%) melebihi sisa pagu BOQ (%) -- wajib isi alasan', p_requested_quantity, v_boq_remaining;
    end if;
  end if;

  insert into public.cm_purchase_requests (project_id, material_id, requested_quantity, suggested_quantity, reason, requested_by)
  values (p_project_id, p_material_id, p_requested_quantity, nullif(v_suggested, 0), nullif(trim(p_reason), ''), v_caller)
  returning id into v_id;

  return v_id;
end;
$$;
