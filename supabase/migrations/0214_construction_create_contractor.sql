-- Missed in 0213: cm_contractors had a select-only RLS policy but no
-- insert RPC, so there was no way to actually add a contractor.
create or replace function public.cm_create_contractor(p_full_name text, p_contractor_type text default 'tukang', p_phone text default null, p_bank_account text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_full_name is null or trim(p_full_name) = '' then
    raise exception 'Nama kontraktor wajib diisi';
  end if;
  if p_contractor_type not in ('tukang', 'mandor', 'subcontractor') then
    raise exception 'Jenis kontraktor tidak valid';
  end if;

  insert into public.cm_contractors (full_name, contractor_type, phone, bank_account)
  values (trim(p_full_name), p_contractor_type, nullif(trim(p_phone), ''), nullif(trim(p_bank_account), ''))
  returning id into v_id;

  return v_id;
end;
$$;
