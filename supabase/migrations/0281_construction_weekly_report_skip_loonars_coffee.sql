-- ============================================================================
-- MK Connect — 0281: construction_send_weekly_report() no longer fires for
-- Loonars Coffee. (Originally applied to production as 0273; renumbered in
-- git after a merge collision with another branch's own unrelated 0273 --
-- see GIT_WORKFLOW.md. The function body actually running in production is
-- unaffected by this filename change.)
--
-- Real incident: on the same Sunday, the owner got TWO weekly reports for
-- Loonars Coffee back to back --
--   1. "Laporan Mingguan — Loonars Coffee" (construction_send_loonars_
--      coffee_weekly_report, 0257/0258/0272) -- correct, detailed, and the
--      one actually built for this project's real workflow.
--   2. "Laporan Mingguan Keuangan — Loonars Coffee" (construction_send_
--      weekly_report, 0195) -- every field Rp 0 / 0x.
-- 0195 predates the Loonars Coffee module entirely: `where p.status =
-- 'active'` loops every active construction_projects row with no knowledge
-- LNC even exists, and its whole model of a construction project's finances
-- doesn't fit how this one actually runs:
--   - "Dana Sudah Ditransfer" only sums construction_fund_transfers --
--     Loonars Coffee never uses that table at all; money moves through
--     WhatsApp-approved construction_cost_requests straight into
--     construction_expenses / cm_labor_advances (see 0256, 2026-09-15's
--     advance fix).
--   - "Total Gaji Tukang" / "Total Pembelian Material" only count
--     expense_type in ('gaji_tukang','pembelian_material') -- Loonars
--     Coffee's WhatsApp flow posts 'pembelian_lain_lain' for anything that
--     isn't a material_purchase (tryHandleLoonarsCoffeeOwnerDecision /
--     tryConfirmLoonarsCoffeeTransferByPhoto), and labor money moves
--     through the separate cm_labor_* advance/earned-value engine, never
--     'gaji_tukang'.
-- Every field on this report was therefore guaranteed to read 0 for
-- Loonars Coffee specifically -- not a bug in the arithmetic, a report
-- built for a different financial workflow than this project actually
-- uses. Rather than teach 0195's generic model Loonars Coffee's specific
-- shape (duplicating what the dedicated report already does correctly),
-- this project is simply excluded from it, the same way any project with
-- its own dedicated report should be -- Kendari (the report's original and
-- still valid use case) is completely unaffected.
-- ============================================================================

create or replace function public.construction_send_weekly_report()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_admin record;
  v_dana_masuk numeric;
  v_gaji_tukang numeric;
  v_material numeric;
  v_utang_belum_lunas numeric;
  v_sisa_dana numeric;
  v_week_gaji_count int;
  v_week_material_count int;
  v_body text;
begin
  for v_project in
    select p.id, p.name, p.total_budget, p.branch_id, b.name as branch_name
    from public.construction_projects p
    join public.branches b on b.id = p.branch_id
    where p.status = 'active'
      -- Loonars Coffee has its own dedicated weekly report
      -- (construction_send_loonars_coffee_weekly_report, 0257/0258/0272)
      -- built for its actual workflow -- see header above for why this
      -- generic report can never produce a meaningful number for it.
      and b.code <> 'LNC'
  loop
    select coalesce(sum(amount), 0) into v_dana_masuk
      from public.construction_fund_transfers where project_id = v_project.id;

    select coalesce(sum(amount) filter (where expense_type = 'gaji_tukang'), 0),
           coalesce(sum(amount) filter (where expense_type = 'pembelian_material'), 0),
           coalesce(sum(amount) filter (where payment_method = 'utang' and not is_settled), 0)
      into v_gaji_tukang, v_material, v_utang_belum_lunas
      from public.construction_expenses where project_id = v_project.id;

    v_sisa_dana := v_dana_masuk - v_gaji_tukang;

    select count(*) filter (where expense_type = 'gaji_tukang' and created_at > now() - interval '7 days'),
           count(*) filter (where expense_type = 'pembelian_material' and created_at > now() - interval '7 days')
      into v_week_gaji_count, v_week_material_count
      from public.construction_expenses where project_id = v_project.id;

    v_body :=
      '📊 *' || v_project.branch_name || ' — ' || v_project.name || '*' || E'\n\n' ||
      '💰 Total Anggaran: Rp ' || to_char(v_project.total_budget, 'FM999,999,999,999') || E'\n' ||
      '📥 Dana Sudah Ditransfer: Rp ' || to_char(v_dana_masuk, 'FM999,999,999,999') || E'\n' ||
      '💵 Sisa Dana Tunai: Rp ' || to_char(v_sisa_dana, 'FM999,999,999,999') || E'\n' ||
      '🏗️ Total Gaji Tukang: Rp ' || to_char(v_gaji_tukang, 'FM999,999,999,999') || E'\n' ||
      '🧱 Total Pembelian Material: Rp ' || to_char(v_material, 'FM999,999,999,999') || E'\n' ||
      '⚠️ Utang Toko Belum Lunas: Rp ' || to_char(v_utang_belum_lunas, 'FM999,999,999,999') || E'\n\n' ||
      '📅 Aktivitas 7 hari terakhir: ' || v_week_gaji_count || 'x input gaji tukang, ' || v_week_material_count || 'x input material';

    for v_admin in
      select em.id from public.employees em
      join public.roles r on r.id = em.role_id
      where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
    loop
      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_admin.id, 'system', 'construction_weekly_report',
        'Laporan Mingguan Keuangan — ' || v_project.branch_name,
        v_body,
        '/construction-finance'
      );
    end loop;
  end loop;
end;
$$;

comment on function public.construction_send_weekly_report is
  'Weekly WhatsApp summary of every active construction project''s finances to every Super Admin. Scheduled Sunday 17:00 WIB by pg_cron. Fixed in 0273: skips Loonars Coffee (branch LNC), which has its own dedicated weekly report (construction_send_loonars_coffee_weekly_report) built for its actual WhatsApp-first workflow -- this generic report''s fund-transfer/gaji_tukang/pembelian_material model never matched how that project moves money, so every field always read 0 for it.';
