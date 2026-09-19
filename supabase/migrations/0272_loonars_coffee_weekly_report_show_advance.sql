-- ============================================================================
-- MK Connect — 0272: construction_send_loonars_coffee_weekly_report() now
-- shows a contractor's outstanding advance instead of silently omitting it.
--
-- Real incident: the owner paid Sarno Rp15,000,000 as an advance toward
-- Anang's Rp75,000,000 borongan contract -- already recorded correctly via
-- cm_labor_advances / cm_labor_contracts.outstanding_advance, per the
-- 2026-09-15 fix that lets a transfer-photo confirm a contractor_payment
-- without a dashboard step. But the weekly report's own math never reads
-- outstanding_advance at all:
--   - v_actual only sums construction_expenses (an advance deliberately
--     does NOT post there yet -- see recordLoonarsCoffeeLaborAdvance's
--     comment in loonars-coffee-field-ops.ts: posting a real cash-out row
--     ahead of earned-value reconciliation would be exactly the "invent an
--     earned amount" the owner forbade for the RAB).
--   - v_committed only sums construction_cost_requests with status in
--     ('approved','transferred') -- a request an advance was recorded
--     against moves to 'paid', which this filter never counted either.
--   - The "Kontraktor (Anang)" line's "sudah dibayar" came only from
--     cm_labor_payments (status='approved'), i.e. money already reconciled
--     against verified progress.
-- Net effect: the owner saw "Aktual sudah dikeluarkan: Rp 13,122,000" and
-- "Kontraktor (Anang): ... sudah dibayar Rp 0" in the SAME report where he
-- had already paid Sarno a real Rp15,000,000 -- correct by each field's own
-- narrow definition, but read together it looked like the money had
-- vanished, and "Sisa anggaran" was overstated by the full advance.
--
-- Fix: read cm_labor_contracts.outstanding_advance directly (it is kept in
-- sync by recordLoonarsCoffeeLaborAdvance on every advance/recovery) and:
--   1. Show it as its own line under the contractor, clearly labelled
--      "belum direkonsiliasi" -- still NOT presented as earned value.
--   2. Subtract it from "Sisa anggaran" alongside actual + committed, since
--      it is real money that already left the company regardless of
--      reconciliation status.
-- Nothing about how the advance itself is recorded changes (still no
-- construction_expenses/jurnal entry until cm_approve_labor_payment
-- reconciles it) -- this migration only fixes what the report DISPLAYS.
-- ============================================================================

create or replace function public.construction_send_loonars_coffee_weekly_report()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_branch_id uuid;
  v_physical_pct numeric;
  v_material_budget numeric;
  v_labor_budget numeric;
  v_total_budget numeric;
  v_actual numeric;
  v_committed numeric;
  v_advance numeric;
  v_remaining numeric;
  v_financial_pct numeric;
  v_contract record;
  v_earned numeric;
  v_paid numeric;
  v_payable numeric;
  v_current_week record;
  v_evidence_photos int;
  v_warning text;
  v_owner_body text;
  v_vando_body text;
  v_admin record;
  v_vando record;
begin
  select p.id, p.name, p.branch_id, p.material_procurement_budget, p.labor_contract_budget, p.total_budget
  into v_project
  from public.construction_projects p
  join public.branches b on b.id = p.branch_id
  where b.code = 'LNC' and p.status = 'active'
  limit 1;

  if v_project.id is null then
    return;
  end if;

  v_branch_id := v_project.branch_id;
  v_material_budget := coalesce(v_project.material_procurement_budget, 0);
  v_labor_budget := coalesce(v_project.labor_contract_budget, 0);
  v_total_budget := coalesce(v_project.total_budget, v_material_budget + v_labor_budget);

  select public.cm_project_overall_progress(v_project.id) into v_physical_pct;

  select coalesce(sum(amount), 0) into v_actual
    from public.construction_expenses where project_id = v_project.id;

  select coalesce(sum(amount), 0) into v_committed
    from public.construction_cost_requests
    where project_id = v_project.id and status in ('approved', 'transferred');

  -- Contractor payment status — same math as cm_labor_contract_summary(),
  -- inlined (no permission check; see 0258's header). outstanding_advance
  -- added 2026-09-19 (see header above) -- this is real money already paid
  -- out, so it belongs in v_remaining even though it isn't yet an earned/
  -- reconciled construction_expenses row.
  select id, contract_value, outstanding_advance into v_contract from public.cm_labor_contracts where project_id = v_project.id limit 1;
  v_advance := coalesce(v_contract.outstanding_advance, 0);

  v_remaining := greatest(v_total_budget - v_actual - v_committed - v_advance, 0);
  v_financial_pct := case when v_total_budget > 0 then round((v_actual + v_advance) / v_total_budget * 100, 1) else 0 end;

  if v_contract.id is not null then
    select coalesce(sum(cc.contract_value * w.weight_pct / 100 * wbs.progress_pct / 100), 0)
    into v_earned
    from public.cm_labor_contract_weights w
    join public.cm_labor_contracts cc on cc.id = w.contract_id
    join public.cm_project_wbs wbs on wbs.id = w.project_wbs_id
    where w.contract_id = v_contract.id;

    select coalesce(sum(pay.net_payable), 0) into v_paid
    from public.cm_labor_payments pay
    where pay.contract_id = v_contract.id and pay.status = 'approved';

    v_payable := round(coalesce(v_earned, 0) - coalesce(v_paid, 0), 2);
    v_earned := round(coalesce(v_earned, 0), 2);
    v_paid := round(coalesce(v_paid, 0), 2);
  end if;

  select * into v_current_week
    from public.cm_labor_weekly_schedule
    where labor_contract_id = v_contract.id and current_date between period_start and period_end
    order by week_number desc limit 1;
  if v_current_week.id is null then
    select * into v_current_week
      from public.cm_labor_weekly_schedule
      where labor_contract_id = v_contract.id and period_start <= current_date
      order by week_number desc limit 1;
  end if;

  select count(*) into v_evidence_photos
    from public.cm_wbs_progress_log l
    join public.cm_project_wbs w on w.id = l.project_wbs_id
    where w.project_id = v_project.id and l.submitted_at > now() - interval '7 days' and l.photo_url is not null;

  v_warning := case
    when v_financial_pct - coalesce(v_physical_pct, 0) > 15 then '⚠️ Pengeluaran finansial lebih cepat dari progress fisik — perlu ditinjau.'
    when coalesce(v_physical_pct, 0) - v_financial_pct > 15 then 'ℹ️ Progress fisik lebih cepat dari pengeluaran finansial.'
    else '✅ Progress fisik dan finansial selaras.'
  end;

  v_owner_body :=
    '🏗️ *LOONARS COFFEE*' || coalesce(' — Minggu ' || v_current_week.week_number, '') || E'\n\n' ||
    '📈 Progress fisik: ' || coalesce(v_physical_pct, 0) || '%' || E'\n' ||
    '💹 Progress finansial: ' || v_financial_pct || '%' || E'\n\n' ||
    '💰 Anggaran (material + kontraktor): Rp ' || to_char(v_total_budget, 'FM999,999,999,999') || E'\n' ||
    '💸 Aktual sudah dikeluarkan: Rp ' || to_char(v_actual, 'FM999,999,999,999') || E'\n' ||
    (case when v_advance > 0 then '🔸 Uang muka kontraktor (belum direkonsiliasi): Rp ' || to_char(v_advance, 'FM999,999,999,999') || E'\n' else '' end) ||
    '📝 Committed (disetujui, belum dibayar): Rp ' || to_char(v_committed, 'FM999,999,999,999') || E'\n' ||
    '📊 Sisa anggaran: Rp ' || to_char(v_remaining, 'FM999,999,999,999') || E'\n\n' ||
    coalesce(
      '👷 Kontraktor (Anang): kontrak Rp ' || to_char(v_contract.contract_value, 'FM999,999,999,999') ||
      ', earned terhitung Rp ' || to_char(v_earned, 'FM999,999,999,999') ||
      ', direkonsiliasi/dibayar Rp ' || to_char(v_paid, 'FM999,999,999,999') ||
      (case when v_advance > 0 then ', uang muka belum direkonsiliasi Rp ' || to_char(v_advance, 'FM999,999,999,999') else '' end) || E'\n\n',
      ''
    ) ||
    coalesce('🎯 Target minggu ini: ' || v_current_week.planned_progress_pct || '% (rencana bayar Rp ' || to_char(v_current_week.planned_payment, 'FM999,999,999,999') || ')' || E'\n', '') ||
    '📸 Evidence 7 hari terakhir: ' || v_evidence_photos || ' foto/laporan progress' || E'\n\n' ||
    v_warning;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'construction_project_weekly_report',
      'Laporan Mingguan — Loonars Coffee',
      v_owner_body,
      '/construction-finance',
      jsonb_build_object('project_id', v_project.id, 'recipient', 'owner')
    );
  end loop;

  v_vando_body :=
    'LOONARS COFFEE' || coalesce(' — MINGGU ' || v_current_week.week_number, '') || E'\n\n' ||
    'Progress: ' || coalesce(v_physical_pct, 0) || '%' || E'\n\n' ||
    coalesce(
      'Terhitung: Rp ' || to_char(v_earned, 'FM999,999,999,999') || E'\n' ||
      'Direkonsiliasi/dibayar: Rp ' || to_char(v_paid, 'FM999,999,999,999') ||
      (case when v_advance > 0 then E'\n' || 'Uang muka belum direkonsiliasi: Rp ' || to_char(v_advance, 'FM999,999,999,999') else '' end) || E'\n\n',
      ''
    ) ||
    coalesce('Target minggu ini: ' || v_current_week.planned_progress_pct || '%' || E'\n\n', '') ||
    'Kirim foto/laporan progress kalau ada pekerjaan yang belum terdokumentasi ya, Vando.';

  for v_vando in
    select id from public.employees
    where deleted_at is null and employment_status = 'active' and full_name ilike '%vando%'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_vando.id, 'system', 'construction_project_weekly_report',
      'Laporan Progress — Loonars Coffee',
      v_vando_body,
      '/construction-finance',
      jsonb_build_object('project_id', v_project.id, 'recipient', 'vando')
    );
  end loop;
end;
$$;

comment on function public.construction_send_loonars_coffee_weekly_report is
  'Weekly WhatsApp report for Loonars Coffee -- detailed version to every Super Admin, concise operational version to Vando. Scheduled Saturday by pg_cron. Fixed in 0258: no longer calls the permission-gated cm_labor_contract_summary() RPC. Fixed in 0272: now reads cm_labor_contracts.outstanding_advance so a contractor advance (paid but not yet earned-value-reconciled) is visible in the report and subtracted from Sisa anggaran, instead of silently disappearing from every total.';
