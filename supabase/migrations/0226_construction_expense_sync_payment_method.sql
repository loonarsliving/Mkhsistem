-- Fixes a real accounting bug found while wiring up 0224/0225: the jurnal
-- credit side was always either 1-1001 Kas Tunai (gaji_tukang) or 2-1003
-- Utang Toko Bangunan (everything else) -- ignoring construction_expenses.
-- payment_method entirely. So a cash material purchase (material_tunai,
-- payment_method='cash') was posted as if it were unpaid debt. Confirmed
-- two real Kendari transactions already mis-posted this way (KDI-015,
-- KDI-018) -- corrected directly in mkh-properti's jurnal alongside this
-- migration.
--
-- Debit account now depends on expense_type's category (labor/material/
-- other), credit account now depends on payment_method (cash vs utang),
-- independently -- instead of one flag conflating both.

create or replace function public.trg_construction_expense_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_branch public.branches%rowtype;
  v_creator public.employees%rowtype;
  v_debit_akun text;
  v_debit_nama text;
  v_credit_akun text;
  v_credit_nama text;
begin
  select * into v_branch from public.branches where id = new.branch_id;
  select * into v_creator from public.employees where id = new.created_by;

  if v_branch.mkh_project_code is null then
    return new;
  end if;

  if new.expense_type = 'gaji_tukang' then
    v_debit_akun := '5-1003'; v_debit_nama := 'Biaya Upah Tukang';
  elsif new.expense_type in ('lain_lain_tunai', 'pembelian_lain_lain') then
    v_debit_akun := '6-1007'; v_debit_nama := 'Beban Lain-lain';
  else
    v_debit_akun := '5-1001'; v_debit_nama := 'Pembelian Material';
  end if;

  if new.payment_method = 'cash' then
    v_credit_akun := '1-1001'; v_credit_nama := 'Kas Tunai';
  else
    v_credit_akun := '2-1003'; v_credit_nama := 'Utang Toko Bangunan';
  end if;

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
      'mkh_project_code', v_branch.mkh_project_code,
      'created_by_name', v_creator.full_name,
      'debit_akun', v_debit_akun,
      'debit_nama', v_debit_nama,
      'credit_akun', v_credit_akun,
      'credit_nama', v_credit_nama
    )
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$function$;
