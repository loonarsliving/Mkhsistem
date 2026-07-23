-- ============================================================================
-- MK Connect — 0073: Fix duplicate-prospect false positive
--
-- Bug report: entering "Vita" when "Ita" (sharing a common second name, e.g.
-- "Ita Sari" / "Vita Sari") already exists gets flagged and BLOCKED as a
-- duplicate, even though they're clearly different people with different
-- phone numbers. Confirmed via similarity('ita sari','vita sari') = 0.58 and
-- similarity('ita wijaya','vita wijaya') = 0.64 -- both comfortably above
-- the old 0.45 threshold. Common Indonesian name parts (Sari, Wijaya, Putri,
-- ...) shared between two genuinely different customers made the fuzzy
-- name-only match fire constantly.
--
-- Two-part fix:
--   1. Raise the similarity threshold 0.45 -> 0.6 (still catches real typo
--      duplicates like "Andi Wijaya"/"Andy Wijaya" = 0.71).
--   2. Add is_phone_match to the result so callers can tell "definitely the
--      same person" (exact phone match) apart from "similar name, maybe
--      coincidence" (fuzzy match only) -- crm_create_prospect now only
--      BLOCKS on an exact phone match; a name-only similarity hit is
--      advisory (surfaced in the UI, but the Sales rep can still save).
--      Name similarity alone was never a reliable enough signal to hard-
--      block prospect creation on -- the unique index on phone_normalized
--      (0022) remains the real duplicate guard.
-- ============================================================================

-- Return shape changed (added is_phone_match) -- Postgres requires dropping
-- a function before changing its OUT-parameter row type.
drop function public.crm_find_duplicate_prospect(text, text);

create function public.crm_find_duplicate_prospect(p_phone text, p_customer_name text)
returns table (
  id uuid,
  customer_name text,
  phone text,
  status text,
  created_at timestamptz,
  sales_name text,
  is_phone_match boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.customer_name, p.phone, p.status, p.created_at, e.full_name,
    (p.phone_normalized = regexp_replace(p_phone, '[^0-9]', '', 'g'))
  from public.prospects p
  join public.employees e on e.id = p.sales_id
  where p.deleted_at is null
    and public.app_has_permission('prospect.create')
    and (
      p.phone_normalized = regexp_replace(p_phone, '[^0-9]', '', 'g')
      or similarity(unaccent(lower(p.customer_name)), unaccent(lower(p_customer_name))) > 0.6
    )
  order by (p.phone_normalized = regexp_replace(p_phone, '[^0-9]', '', 'g')) desc,
           similarity(unaccent(lower(p.customer_name)), unaccent(lower(p_customer_name))) desc
  limit 1;
$$;

create or replace function public.crm_create_prospect(
  p_customer_name text,
  p_phone text,
  p_project_id uuid,
  p_house_type text,
  p_city text,
  p_lead_source text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_branch_id uuid;
  v_prospect_id uuid;
begin
  if not public.app_has_permission('prospect.create') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select branch_id into v_branch_id from public.employees where id = v_user_id and deleted_at is null;
  if v_branch_id is null then
    raise exception 'Employee record not found';
  end if;

  if exists (select 1 from public.crm_find_duplicate_prospect(p_phone, p_customer_name) where is_phone_match) then
    raise exception 'This prospect already exists' using errcode = 'P0001';
  end if;

  begin
    insert into public.prospects (
      customer_name, phone, project_id, house_type, city, lead_source, notes,
      sales_id, branch_id, created_by, updated_by
    ) values (
      p_customer_name, p_phone, p_project_id, p_house_type, p_city, p_lead_source, p_notes,
      v_user_id, v_branch_id, v_user_id, v_user_id
    )
    returning id into v_prospect_id;
  exception when unique_violation then
    raise exception 'This prospect already exists' using errcode = 'P0001';
  end;

  return v_prospect_id;
end;
$$;
