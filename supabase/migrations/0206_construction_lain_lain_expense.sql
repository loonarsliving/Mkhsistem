-- Owner's ask: entries like "notaris" and "jersey kegiatan bank BTN" (already
-- in production, see 0193 data) aren't material purchases from a hardware
-- store, but were forced into pembelian_material because that was the only
-- utang-capable input. Adds a "Pembelian Lain-lain" category, mirroring
-- material's tunai/utang split: lain_lain_tunai (cash, deducts project dana
-- same as gaji_tukang/material_tunai) and pembelian_lain_lain (utang toko,
-- same as pembelian_material).

alter table public.construction_expenses drop constraint construction_expenses_expense_type_check;
alter table public.construction_expenses
  add constraint construction_expenses_expense_type_check
  check (expense_type in ('gaji_tukang', 'pembelian_material', 'material_tunai', 'pembelian_lain_lain', 'lain_lain_tunai'));

create or replace function public.construction_submit_expense(
  p_project_id uuid,
  p_expense_type text,
  p_party_name text,
  p_amount numeric,
  p_description text default null,
  p_expense_date date default current_date,
  p_photo_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_branch uuid;
  v_project public.construction_projects%rowtype;
  v_id uuid;
  v_payment_method text;
  v_admin record;
begin
  if not public.app_has_permission('construction_finance.submit') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if p_expense_type not in ('gaji_tukang', 'pembelian_material', 'material_tunai', 'pembelian_lain_lain', 'lain_lain_tunai') then
    raise exception 'Jenis pengeluaran tidak valid';
  end if;

  select * into v_project from public.construction_projects where id = p_project_id and status = 'active';
  if not found then
    raise exception 'Proyek tidak ditemukan atau sudah tidak aktif';
  end if;

  select branch_id into v_caller_branch from public.employees where id = v_caller;

  if not public.app_has_permission('construction_finance.manage') and v_project.branch_id is distinct from v_caller_branch then
    raise exception 'Proyek ini bukan bagian dari cabang Anda' using errcode = '42501';
  end if;

  if p_party_name is null or trim(p_party_name) = '' then
    raise exception 'Nama %s wajib diisi', case when p_expense_type = 'gaji_tukang' then 'tukang' else 'toko/pihak' end;
  end if;

  v_payment_method := case when p_expense_type in ('pembelian_material', 'pembelian_lain_lain') then 'utang' else 'cash' end;

  insert into public.construction_expenses (
    project_id, branch_id, expense_type, party_name, description, amount,
    payment_method, expense_date, photo_url, created_by
  )
  values (
    p_project_id, v_project.branch_id, p_expense_type, trim(p_party_name), nullif(trim(p_description), ''), p_amount,
    v_payment_method, coalesce(p_expense_date, current_date), p_photo_url, v_caller
  )
  returning id into v_id;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'construction_expense_submitted',
      case
        when p_expense_type = 'gaji_tukang' then 'Input Gaji Tukang — ' || v_project.name
        when p_expense_type = 'material_tunai' then 'Input Pembelian Material (Tunai) — ' || v_project.name
        when p_expense_type = 'pembelian_material' then 'Input Pembelian Material (Utang) — ' || v_project.name
        when p_expense_type = 'lain_lain_tunai' then 'Input Pembelian Lain-lain (Tunai) — ' || v_project.name
        else 'Input Pembelian Lain-lain (Utang) — ' || v_project.name
      end,
      case
        when p_expense_type = 'gaji_tukang'
          then '👷 Tukang: ' || trim(p_party_name) || E'\n💰 Nominal: Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        when p_expense_type = 'material_tunai'
          then '🧱 Toko/Supplier: ' || trim(p_party_name) || E'\n💰 Nominal (tunai): Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        when p_expense_type = 'pembelian_material'
          then '🏪 Toko: ' || trim(p_party_name) || E'\n💰 Nominal (utang): Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        when p_expense_type = 'lain_lain_tunai'
          then '🧾 Pihak: ' || trim(p_party_name) || E'\n💰 Nominal (tunai): Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        else '🧾 Pihak: ' || trim(p_party_name) || E'\n💰 Nominal (utang): Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
      end || coalesce(E'\n📝 ' || nullif(trim(p_description), ''), ''),
      '/construction-finance',
      jsonb_build_object('expense_id', v_id, 'project_id', p_project_id, 'expense_type', p_expense_type)
    );
  end loop;

  return v_id;
end;
$$;

comment on column public.construction_expenses.expense_type is
  'gaji_tukang: cash, project dana. pembelian_material: material, always utang to the store. material_tunai: material that cannot be put on utang -- cash. pembelian_lain_lain: non-material purchase (e.g. notaris, event supplies) that IS put on utang. lain_lain_tunai: non-material purchase paid cash from project dana.';

-- Reclassify the 5 existing rows the owner flagged (notaris, jersey kegiatan
-- bank BTN) as "lain-lain" utang, not material -- they were entered under
-- pembelian_material before this category existed. The genuinely
-- material rows (ANTO/pasir, SINAR JAYA/paku, kayu kaso dan balok) are left
-- untouched.
update public.construction_expenses
set expense_type = 'pembelian_lain_lain'
where id in ('cfdd4c7d-99e1-4ee8-89f2-d5f1a5b1c82f', '003c68e5-fb53-4be1-b692-5651495eeb9e');
