-- Owner's request: mkh-properti holds the audited annual financial
-- statements (jurnal reviewed by KAP), so every financial movement in
-- mkhsistem's Construction Finance module -- money in AND money out --
-- must sync there automatically, for any project (current or future).
-- construction_expenses (money out) already syncs via
-- trg_construction_expense_sync (0194/0224). construction_fund_transfers
-- (money the branch/project actually receives, e.g. HQ funding it) had no
-- outbound sync at all -- so mkh-properti's jurnal only ever saw expenses,
-- never the funding that paid for them. This adds the missing half,
-- mirroring the same branch->mkh_project_code mapping and skip-if-unmapped
-- safety as 0224.

create or replace function public.trg_construction_fund_transfer_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_branch public.branches%rowtype;
  v_creator public.employees%rowtype;
  v_project_name text;
begin
  select * into v_branch from public.branches where id = new.branch_id;
  select * into v_creator from public.employees where id = new.created_by;
  select name into v_project_name from public.construction_projects where id = new.project_id;

  if v_branch.mkh_project_code is null then
    return new;
  end if;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
  values (
    'outbound', 'construction_fund_transfer_recorded', 'construction_fund_transfers', new.id,
    'mkc:construction_fund_transfer:' || new.id,
    jsonb_build_object(
      'construction_fund_transfer_id', new.id,
      'amount', new.amount,
      'transfer_date', new.transfer_date,
      'note', new.note,
      'branch_id', new.branch_id,
      'branch_name', v_branch.name,
      'mkh_project_code', v_branch.mkh_project_code,
      'project_name', v_project_name,
      'created_by_name', v_creator.full_name
    )
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$function$;

drop trigger if exists construction_fund_transfer_after_insert_sync on public.construction_fund_transfers;
create trigger construction_fund_transfer_after_insert_sync
  after insert on public.construction_fund_transfers
  for each row execute function public.trg_construction_fund_transfer_sync();
