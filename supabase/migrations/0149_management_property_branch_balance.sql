-- ============================================================================
-- Why the branch balance widget wasn't showing for Management Property's
-- Kepala Cabang (Ayu): finance_branch_balances only gets rows pushed by
-- MKH Property's jurnal_branch_balance_sync() trigger (in the separate
-- gluoioiimapyhchdasfl project), which had a hardcoded proyek-code ->
-- branch-code switch that never knew about 'MP' -- so no sync event was
-- ever generated for it, even after the branch/COA account (0148... no,
-- see the mkh-properti repo's index.html/admin-proyek.html changes) was
-- added there.
--
-- Fixed directly against the mkh-properti project's jurnal_branch_balance_sync()
-- function (not tracked in this repo's migrations -- that function lives in
-- gluoioiimapyhchdasfl) to add: 'MP' -> branch_code 'MP', name "Management
-- Property", kas account '1-1009'. This migration just seeds the initial
-- row here so the widget shows immediately (saldo 0, matching reality --
-- no jurnal entries against 1-1009 yet); once a real transaction happens
-- there, the trigger keeps it in sync same as every other branch.
-- ============================================================================

insert into public.finance_branch_balances (branch_id, branch_name, saldo, source_system, situation_type, situation_note)
values (
  '4d61f863-3358-4068-b80e-9770e882820e', 'Management Property', 0, 'mkh_property',
  'no_project', 'Cabang Management Property baru dibuka, belum ada transaksi kas.'
)
on conflict (branch_id) do nothing;
