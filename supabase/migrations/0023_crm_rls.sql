-- ============================================================================
-- MK Connect — 0023: CRM row level security
-- Same app_current_role_key() / app_current_branch_id() / app_has_permission()
-- helpers as every other feature (see 0006), plus a status-transition guard
-- trigger so "only Finance can close, only the system can mark inactive"
-- holds even against a direct table write, not just through the RPCs.
-- ============================================================================

alter table public.crm_projects enable row level security;
alter table public.prospects enable row level security;
alter table public.prospect_follow_ups enable row level security;
alter table public.prospect_payments enable row level security;
alter table public.sales_targets enable row level security;

-- ----------------------------------------------------------------------------
-- crm_projects: reference data, readable by everyone authenticated (needed
-- for the Add Prospect project dropdown), writable only by whoever manages
-- the project list.
-- ----------------------------------------------------------------------------
create policy crm_projects_select on public.crm_projects for select to authenticated using (true);
create policy crm_projects_write on public.crm_projects for all to authenticated
  using (public.app_has_permission('crm_project.manage'))
  with check (public.app_has_permission('crm_project.manage'));

-- ----------------------------------------------------------------------------
-- prospects
-- ----------------------------------------------------------------------------
create policy prospects_select on public.prospects for select to authenticated
  using (
    sales_id = auth.uid()
    or public.app_has_permission('prospect.view_all')
    or (public.app_has_permission('prospect.view_branch') and branch_id = public.app_current_branch_id())
  );

-- Direct inserts are defense-in-depth; the app always goes through
-- crm_create_prospect() so the duplicate check runs atomically server-side.
create policy prospects_insert on public.prospects for insert to authenticated
  with check (
    (sales_id = auth.uid() and public.app_has_permission('prospect.create'))
    or public.app_has_permission('prospect.manage')
  );

create policy prospects_update on public.prospects for update to authenticated
  using (
    (sales_id = auth.uid() and public.app_has_permission('prospect.create'))
    or public.app_has_permission('prospect.manage')
  )
  with check (
    (sales_id = auth.uid() and public.app_has_permission('prospect.create'))
    or public.app_has_permission('prospect.manage')
  );

create policy prospects_delete on public.prospects for delete to authenticated
  using (public.app_has_permission('prospect.manage'));

-- Row-level RLS policies can't restrict which *columns* change, only which
-- rows -- so the "Sales cannot claim Closing" / "Inactive is system-only"
-- rules need a trigger. auth.uid() is null when a SECURITY DEFINER function
-- runs outside a request context (pg_cron), which is exactly the case that
-- must be allowed to set 'inactive'; crm_approve_payment (0024) runs with
-- the real Finance caller's auth.uid(), so its own permission check plus
-- this guard both agree.
create or replace function public.guard_prospect_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'closing' and old.status is distinct from 'closing' then
    if not (auth.uid() is null or public.app_has_permission('prospect.finance_verify')) then
      raise exception 'Only Finance can mark a prospect as Closing' using errcode = '42501';
    end if;
  end if;
  if new.status = 'inactive' and old.status is distinct from 'inactive' then
    if not (auth.uid() is null or public.app_has_permission('prospect.manage')) then
      raise exception 'Inactive status is set automatically by the system' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_prospect_status_transition
  before update on public.prospects
  for each row execute function public.guard_prospect_status_transition();

-- ----------------------------------------------------------------------------
-- prospect_follow_ups (append-only: select + insert only, no update/delete)
-- ----------------------------------------------------------------------------
create policy prospect_follow_ups_select on public.prospect_follow_ups for select to authenticated
  using (
    exists (
      select 1 from public.prospects p where p.id = prospect_follow_ups.prospect_id
        and (
          p.sales_id = auth.uid()
          or public.app_has_permission('prospect.view_all')
          or (public.app_has_permission('prospect.view_branch') and p.branch_id = public.app_current_branch_id())
        )
    )
  );

create policy prospect_follow_ups_insert on public.prospect_follow_ups for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.app_has_permission('prospect.follow_up_create')
    and exists (
      select 1 from public.prospects p where p.id = prospect_follow_ups.prospect_id
        and (
          p.sales_id = auth.uid()
          or public.app_has_permission('prospect.manage')
          or (public.app_has_permission('prospect.view_branch') and p.branch_id = public.app_current_branch_id())
        )
    )
  );

-- ----------------------------------------------------------------------------
-- prospect_payments
-- ----------------------------------------------------------------------------
create policy prospect_payments_select on public.prospect_payments for select to authenticated
  using (
    recorded_by = auth.uid()
    or public.app_has_permission('prospect.finance_verify')
    or public.app_has_permission('prospect.view_all')
    or exists (
      select 1 from public.prospects p where p.id = prospect_payments.prospect_id
        and (
          p.sales_id = auth.uid()
          or (public.app_has_permission('prospect.view_branch') and p.branch_id = public.app_current_branch_id())
        )
    )
  );

create policy prospect_payments_insert on public.prospect_payments for insert to authenticated
  with check (recorded_by = auth.uid() and public.app_has_permission('prospect.finance_verify'));

create policy prospect_payments_update on public.prospect_payments for update to authenticated
  using (public.app_has_permission('prospect.finance_verify'))
  with check (public.app_has_permission('prospect.finance_verify'));

-- ----------------------------------------------------------------------------
-- sales_targets
-- ----------------------------------------------------------------------------
create policy sales_targets_select on public.sales_targets for select to authenticated
  using (
    (sales_id = auth.uid() and public.app_has_permission('sales_target.view_own'))
    or public.app_has_permission('sales_target.view_all')
    or (
      public.app_has_permission('sales_target.view_branch')
      and exists (select 1 from public.employees e where e.id = sales_targets.sales_id and e.branch_id = public.app_current_branch_id())
    )
  );

create policy sales_targets_write on public.sales_targets for all to authenticated
  using (public.app_has_permission('sales_target.manage'))
  with check (public.app_has_permission('sales_target.manage'));
