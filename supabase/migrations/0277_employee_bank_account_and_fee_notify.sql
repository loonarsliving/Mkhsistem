-- ============================================================================
-- MK Connect — 0277: employee bank account fields + name/rekening on fee alerts
--
-- Owner's finding: the "Pengajuan Fee Siteplan" WhatsApp/in-app notification
-- said "Marketing mengajukan fee untuk unit X" without ever naming WHICH
-- marketing rep, and had no bank account to actually pay the fee into --
-- Finance had to go look both up by hand. Root cause: `employees` never had
-- a bank account field at all (only contractor-facing tables did --
-- contractor_wa_senders.bank_account, cm_contractors.bank_account).
--
-- Two pieces:
--   1. employees.bank_name / bank_account_number / bank_account_holder --
--      nullable, no RLS changes needed (the existing employees_select/
--      employees_update policies already cover self-service + admin
--      management the same way they already do for phone/address).
--   2. loonars_unit_fee_request's admin notification now includes the
--      requesting rep's full_name and bank details (or a clear "belum
--      diisi" note when missing) so Finance has everything needed to pay
--      without a side conversation.
-- ============================================================================

alter table public.employees add column bank_name text;
alter table public.employees add column bank_account_number text;
alter table public.employees add column bank_account_holder text;

comment on column public.employees.bank_name is 'Nama bank untuk transfer fee/reimbursement, mis. BCA, BRI, Mandiri. Diisi sendiri oleh karyawan di halaman Profil, atau oleh admin di Kelola Karyawan.';
comment on column public.employees.bank_account_number is 'Nomor rekening untuk transfer fee/reimbursement.';
comment on column public.employees.bank_account_holder is 'Nama pemilik rekening (kadang berbeda dari nama karyawan, mis. rekening keluarga) -- kosong berarti sama dengan nama karyawan.';

create or replace function public.loonars_unit_fee_request(p_purchase_id uuid, p_fee_amount numeric default null, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_unit_purchases%rowtype;
  v_unit public.loonars_units%rowtype;
  v_marketing public.employees%rowtype;
  v_fee_claimable_at_dp boolean;
  v_fee_rate_based boolean;
  v_commission_rate numeric;
  v_fee_amount numeric;
  v_fee_id uuid;
  v_bank_line text;
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
  select fee_claimable_at_dp, fee_rate_based into v_fee_claimable_at_dp, v_fee_rate_based
  from public.loonars_projects where id = v_unit.project_id;

  -- 0274: a project opted into fee_claimable_at_dp accepts dp or akad; every
  -- other project keeps 0204's original akad-only rule.
  if coalesce(v_fee_claimable_at_dp, false) then
    if v_row.transaction_type not in ('dp', 'akad') then
      raise exception 'Fee hanya bisa diajukan setelah pembayaran DP atau lunas (akad)';
    end if;
  else
    if v_row.transaction_type <> 'akad' then
      raise exception 'Fee hanya bisa diajukan setelah pembayaran lunas (akad)';
    end if;
  end if;

  -- 0275: a fee_rate_based project computes its own amount and ignores
  -- whatever p_fee_amount the client sent; every other project still
  -- requires the rep to supply a valid manual amount.
  if coalesce(v_fee_rate_based, false) then
    select commission_rate_percent into v_commission_rate
    from public.loonars_sales_commission_rates where employee_id = v_user_id;
    if v_commission_rate is null then
      raise exception 'Rate komisi Anda belum diatur -- hubungi admin untuk mengatur persentase fee Anda';
    end if;
    if v_row.price is null or v_row.price <= 0 then
      raise exception 'Harga unit belum diisi pada pembelian ini';
    end if;
    v_fee_amount := round(v_row.price * v_commission_rate / 100);
  else
    v_fee_amount := p_fee_amount;
    if v_fee_amount is null or v_fee_amount <= 0 then
      raise exception 'Nominal fee tidak valid';
    end if;
  end if;

  if exists (
    select 1 from public.loonars_unit_fee_requests
    where purchase_id = p_purchase_id and status <> 'rejected'
  ) then
    raise exception 'Fee sudah diajukan';
  end if;

  insert into public.loonars_unit_fee_requests (purchase_id, unit_id, marketing_employee_id, fee_amount, phone)
  values (p_purchase_id, v_row.unit_id, v_user_id, v_fee_amount, p_phone)
  returning id into v_fee_id;

  select * into v_marketing from public.employees where id = v_user_id;

  -- 0277: name the requesting rep and show their bank details (or a clear
  -- "belum diisi" note) so Finance can act on this alone.
  if v_marketing.bank_account_number is not null and btrim(v_marketing.bank_account_number) <> '' then
    v_bank_line := E'\nRekening: ' || coalesce(v_marketing.bank_name, '-') || ' ' || v_marketing.bank_account_number
      || ' a.n. ' || coalesce(nullif(btrim(v_marketing.bank_account_holder), ''), v_marketing.full_name);
  else
    v_bank_line := E'\nRekening: belum diisi -- minta karyawan mengisi di halaman Profil';
  end if;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'loonars_fee_alert',
      'Pengajuan Fee Siteplan — Unit ' || coalesce(v_unit.blok, '-'),
      'Marketing: ' || coalesce(v_marketing.full_name, '-')
        || E'\nUnit: ' || coalesce(v_unit.blok, '-')
        || E'\nPembeli: ' || coalesce(v_row.buyer_name, '-')
        || E'\nNilai fee: Rp ' || to_char(v_fee_amount, 'FM999,999,999,999')
        || v_bank_line,
      '/siteplan/fee-requests',
      jsonb_build_object('loonars_unit_fee_request_id', v_fee_id, 'unit_id', v_row.unit_id)
    );
  end loop;

  return v_fee_id;
end;
$$;

comment on function public.loonars_unit_fee_request is
  'The marketing rep who owns a verified purchase claims their fee. Raises if the caller is not the owning rep or the purchase is not verified. Transaction-type gate (0274): fee_claimable_at_dp accepts dp or akad; otherwise only akad. Amount (0275): a fee_rate_based project (Loonars 2) computes round(price * commission_rate_percent / 100) itself from loonars_sales_commission_rates, ignoring p_fee_amount; every other project requires a valid p_fee_amount from the caller. Notification (0277) names the requesting rep and includes their bank account, or a clear "belum diisi" note. Also raises if a live (non-rejected) fee request already exists. Alerts every active super_admin.';

revoke all on function public.loonars_unit_fee_request(uuid, numeric, text) from public, anon;
