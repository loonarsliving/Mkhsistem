-- ============================================================================
-- MK Connect — Close self-approval privilege-escalation gap
-- ============================================================================

-- prevent_employee_self_privilege_escalation (0009_rls_policies.sql, predating
-- self-registration) blocks a self-update of role_id/branch_id/division_id/
-- position_id/employment_status/employee_code, but self-registration (0018) added
-- approval_status/is_active/approved_by/approved_at/rejected_at/rejection_reason
-- without extending this trigger. Because employees_update's RLS policy allows any
-- authenticated user to update their own row (id = auth.uid()), and a pending
-- registrant can obtain a valid JWT the instant their auth.users row is created
-- (email_confirm: true at signup, independent of the app's own login gate), a
-- self-registered user could call the Supabase REST API directly and set their
-- own approval_status='approved', is_active=true — bypassing the approver
-- workflow entirely. Close the gap by extending the trigger's blocklist.
create or replace function public.prevent_employee_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() = old.id and not public.app_has_permission('employee.manage') then
    if new.role_id is distinct from old.role_id
      or new.branch_id is distinct from old.branch_id
      or new.division_id is distinct from old.division_id
      or new.position_id is distinct from old.position_id
      or new.employment_status is distinct from old.employment_status
      or new.employee_code is distinct from old.employee_code
      or new.approval_status is distinct from old.approval_status
      or new.is_active is distinct from old.is_active
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
    then
      raise exception 'You are not allowed to change this field' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;
