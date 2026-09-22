-- ============================================================================
-- MK Connect — 0274: Loonars 2 sales can claim fee from DP, not just Akad
--
-- Owner's explicit correction: 0204's rule (fee only claimable once
-- transaction_type = 'akad') was applied everywhere, but for Loonars 2 the
-- real business rule is looser -- once a buyer has paid DP (a real
-- commitment, unlike a small refundable-in-spirit Booking Fee) and Finance
-- has verified it, the rep should already be able to claim their fee. Akad
-- (paid in full) still qualifies too. Booking Fee alone still does not.
--
-- Scoped to Loonars 2 only, per the owner's explicit call -- every other
-- siteplan project (Cendana/Makassar etc.) keeps 0204's original
-- akad-only rule unchanged. Implemented as a per-project boolean
-- (fee_claimable_at_dp) rather than a hardcoded project kode check inside
-- the RPC, matching the same per-project-toggle pattern 0265 already used
-- (publicly_shareable) -- so a future project can opt in/out without
-- touching this function again.
-- ============================================================================

alter table public.loonars_projects add column fee_claimable_at_dp boolean not null default false;

comment on column public.loonars_projects.fee_claimable_at_dp is
  'When true, loonars_unit_fee_request (0274) accepts a verified purchase whose transaction_type is dp OR akad, not just akad. Owner''s explicit call, Loonars 2 only for now -- every other project defaults to false (0204''s original akad-only rule).';

update public.loonars_projects set fee_claimable_at_dp = true where kode = 'LNR2';

create or replace function public.loonars_unit_fee_request(p_purchase_id uuid, p_fee_amount numeric, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_unit_purchases%rowtype;
  v_unit public.loonars_units%rowtype;
  v_fee_claimable_at_dp boolean;
  v_fee_id uuid;
  v_admin record;
begin
  select * into v_row from public.loonars_unit_purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'Purchase not found';
  end if;
  if v_row.marketing_employee_id is distinct from v_user_id then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if v_row.status <> 'verified' then
    raise exception 'Belum terverifikasi';
  end if;

  select * into v_unit from public.loonars_units where id = v_row.unit_id;
  select fee_claimable_at_dp into v_fee_claimable_at_dp from public.loonars_projects where id = v_unit.project_id;

  -- 0274: a project opted into fee_claimable_at_dp accepts dp or akad; every
  -- other project keeps 0204's original akad-only rule. Booking Fee alone
  -- is never fee-claimable, on either rule.
  if coalesce(v_fee_claimable_at_dp, false) then
    if v_row.transaction_type not in ('dp', 'akad') then
      raise exception 'Fee hanya bisa diajukan setelah pembayaran DP atau lunas (akad)';
    end if;
  else
    if v_row.transaction_type <> 'akad' then
      raise exception 'Fee hanya bisa diajukan setelah pembayaran lunas (akad)';
    end if;
  end if;

  if p_fee_amount is null or p_fee_amount <= 0 then
    raise exception 'Nominal fee tidak valid';
  end if;
  if exists (
    select 1 from public.loonars_unit_fee_requests
    where purchase_id = p_purchase_id and status <> 'rejected'
  ) then
    raise exception 'Fee sudah diajukan';
  end if;

  insert into public.loonars_unit_fee_requests (purchase_id, unit_id, marketing_employee_id, fee_amount, phone)
  values (p_purchase_id, v_row.unit_id, v_user_id, p_fee_amount, p_phone)
  returning id into v_fee_id;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'loonars_fee_alert',
      'Pengajuan Fee Siteplan — Unit ' || coalesce(v_unit.blok, '-'),
      'Marketing mengajukan fee untuk unit ' || coalesce(v_unit.blok, '-')
        || E'\nPembeli: ' || coalesce(v_row.buyer_name, '-')
        || E'\nNilai fee: Rp ' || to_char(p_fee_amount, 'FM999,999,999,999'),
      '/siteplan/fee-requests',
      jsonb_build_object('loonars_unit_fee_request_id', v_fee_id, 'unit_id', v_row.unit_id)
    );
  end loop;

  return v_fee_id;
end;
$$;

comment on function public.loonars_unit_fee_request is
  'The marketing rep who owns a verified purchase claims their fee. Raises if the caller is not the owning rep or the purchase is not verified. Transaction-type gate (0274): a project with fee_claimable_at_dp = true (Loonars 2) accepts dp or akad; every other project still requires akad (0204''s original rule). Also raises if a live (non-rejected) fee request already exists. Alerts every active super_admin.';

-- Pre-existing gap from 0204, unrelated to this migration's own change but
-- caught while touching this function: Postgres grants EXECUTE to PUBLIC by
-- default on every new function, and 0204 never revoked it -- the security
-- advisor flags this the same way it flagged 0266's two RPCs (see 0267).
-- The function's own auth.uid()-based ownership check already blocks an
-- unauthenticated caller in practice, but there is no reason anon should be
-- able to invoke a fee-claim RPC at all.
revoke all on function public.loonars_unit_fee_request(uuid, numeric, text) from public, anon;
