-- ============================================================================
-- MK Connect — 0194: Sync construction expenses to MKH Property
--
-- Every gaji tukang / pembelian material a Kepala Cabang inputs (0193) now
-- also lands in MKH Property's own pengajuan queue (tipe='tukang'/'bahan',
-- same as a project admin entering it by hand there) so the CFO reviews and
-- posts it to the real ledger exactly like any other project expense --
-- Fasly never gets MKH Property access, this is one-way sync only. Mirrors
-- the existing HR-expense sync pattern (0056 in this repo / 0002-0004 in
-- MKH Property).
--
-- MKH Property has no row for a "Kendari branch construction" project in
-- mkh_projects (that table is only used for housing developments with a
-- sales price/rekening), so this uses a fixed project code 'KDI' the same
-- way payroll/HR-expense sync uses 'HO' for head-office overhead -- MKH
-- Property's pengajuan.proyek is free text, not FK'd to anything.
-- ============================================================================

create or replace function public.trg_construction_expense_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch public.branches%rowtype;
  v_creator public.employees%rowtype;
begin
  select * into v_branch from public.branches where id = new.branch_id;
  select * into v_creator from public.employees where id = new.created_by;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
  values (
    'outbound', 'construction_expense_submitted', 'construction_expenses', new.id,
    'mkc:construction_expense:' || new.id,
    jsonb_build_object(
      'construction_expense_id', new.id,
      'expense_type', new.expense_type,
      'party_name', new.party_name,
      'description', new.description,
      'amount', new.amount,
      'payment_method', new.payment_method,
      'expense_date', new.expense_date,
      'branch_id', new.branch_id,
      'branch_name', v_branch.name,
      'mkh_project_code', 'KDI',
      'created_by_name', v_creator.full_name
    )
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

create trigger construction_expense_after_insert_sync
  after insert on public.construction_expenses
  for each row execute function public.trg_construction_expense_sync();
