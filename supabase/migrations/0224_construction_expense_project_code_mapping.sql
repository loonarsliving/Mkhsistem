-- Owner's request: unify mkhsistem's Construction Finance module and
-- mkh-properti properly -- mkh-properti should adjust itself to whatever
-- happens in mkhsistem's new module, for any branch, not just Kendari.
--
-- trg_construction_expense_sync() (0194) already auto-pushes every
-- construction_expenses insert to mkh-properti's jurnal as an outbound
-- sync_log event -- but it hardcodes mkh_project_code to 'KDI', which only
-- happened to be correct because Kendari was the only branch using this
-- module so far. Any other branch's construction expenses would have been
-- silently mis-recorded as Kendari's in mkh-properti. This adds a real
-- per-branch mapping (mirroring crm_projects.mkh_project_code's pattern)
-- and fixes the trigger to use it -- skipping the outbound sync (but still
-- allowing the local expense to save) for any branch that isn't mapped
-- yet, instead of mis-tagging it.

alter table public.branches add column if not exists mkh_project_code text;

update public.branches set mkh_project_code = 'KDI' where code = 'KDI' and mkh_project_code is null;
update public.branches set mkh_project_code = 'LL' where code = 'JOG' and mkh_project_code is null;
update public.branches set mkh_project_code = 'IH' where code = 'MKS' and mkh_project_code is null;
update public.branches set mkh_project_code = 'GCI' where code = 'JBD' and mkh_project_code is null;

create or replace function public.trg_construction_expense_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_branch public.branches%rowtype;
  v_creator public.employees%rowtype;
begin
  select * into v_branch from public.branches where id = new.branch_id;
  select * into v_creator from public.employees where id = new.created_by;

  if v_branch.mkh_project_code is null then
    return new;
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
      'created_by_name', v_creator.full_name
    )
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$function$;
