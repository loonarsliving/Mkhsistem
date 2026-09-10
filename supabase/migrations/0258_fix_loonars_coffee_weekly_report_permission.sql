-- ============================================================================
-- MK Connect — 0258: fix construction_send_loonars_coffee_weekly_report()
--
-- Bug found immediately after applying 0257: it called
-- cm_labor_contract_summary(), which requires the CALLER to hold
-- construction_finance.manage (or be an employee of the project's branch)
-- via auth.uid() -- fine for a normal PostgREST/RPC call from a logged-in
-- session, but this function runs from pg_cron with no session at all
-- (auth.uid() is null), so it always raised "Insufficient permission".
-- Every other existing weekly-report/dispatch cron function (construction_
-- send_weekly_report, 0195) avoids this by querying tables directly rather
-- than going through a permission-gated RPC -- this migration does the
-- same: reimplements the same earned-value math cm_labor_contract_summary
-- already uses, inline, with no permission check (this function is itself
-- SECURITY DEFINER and only ever invoked by pg_cron, never exposed to a
-- user session).
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

  v_remaining := greatest(v_total_budget - v_actual - v_committed, 0);
  v_financial_pct := case when v_total_budget > 0 then round(v_actual / v_total_budget * 100, 1) else 0 end;

  -- Contractor payment status — same math as cm_labor_contract_summary(),
  -- inlined (no permission check; see header).
  select id, contract_value into v_contract from public.cm_labor_contracts where project_id = v_project.id limit 1;
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
    '📝 Committed (disetujui, belum dibayar): Rp ' || to_char(v_committed, 'FM999,999,999,999') || E'\n' ||
    '📊 Sisa anggaran: Rp ' || to_char(v_remaining, 'FM999,999,999,999') || E'\n\n' ||
    coalesce(
      '👷 Kontraktor (Anang): kontrak Rp ' || to_char(v_contract.contract_value, 'FM999,999,999,999') ||
      ', sudah dibayar Rp ' || to_char(v_paid, 'FM999,999,999,999') ||
      ', earned belum dibayar Rp ' || to_char(v_payable, 'FM999,999,999,999') || E'\n\n',
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
      'Disetujui: Rp ' || to_char(v_earned, 'FM999,999,999,999') || E'\n' ||
      'Sudah dibayar: Rp ' || to_char(v_paid, 'FM999,999,999,999') || E'\n' ||
      'Outstanding: Rp ' || to_char(v_payable, 'FM999,999,999,999') || E'\n\n',
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
  'Weekly WhatsApp report for Loonars Coffee -- detailed version to every Super Admin, concise operational version to Vando. Scheduled Saturday by pg_cron. Fixed in 0258: no longer calls the permission-gated cm_labor_contract_summary() RPC (pg_cron has no session/auth.uid()) -- inlines the same earned-value math directly instead.';
