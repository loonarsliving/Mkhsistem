-- Owner's ask: some material purchases can't be put on the store's utang
-- (credit) -- add a third input so those go out as project cash directly,
-- same as gaji_tukang, instead of being forced into "Pembelian Material
-- (Utang Toko)". expense_type distinguishes the two material flows: the
-- existing 'pembelian_material' stays utang-only, the new
-- 'material_tunai' is always cash.

alter table public.construction_expenses drop constraint construction_expenses_expense_type_check;
alter table public.construction_expenses
  add constraint construction_expenses_expense_type_check
  check (expense_type in ('gaji_tukang', 'pembelian_material', 'material_tunai'));

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

  if p_expense_type not in ('gaji_tukang', 'pembelian_material', 'material_tunai') then
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
    raise exception 'Nama %s wajib diisi', case when p_expense_type = 'gaji_tukang' then 'tukang' else 'toko bangunan' end;
  end if;

  v_payment_method := case when p_expense_type = 'pembelian_material' then 'utang' else 'cash' end;

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
        else 'Input Pembelian Material (Utang) — ' || v_project.name
      end,
      case
        when p_expense_type = 'gaji_tukang'
          then '👷 Tukang: ' || trim(p_party_name) || E'\n💰 Nominal: Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        when p_expense_type = 'material_tunai'
          then '🧱 Toko/Supplier: ' || trim(p_party_name) || E'\n💰 Nominal (tunai): Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        else '🏪 Toko: ' || trim(p_party_name) || E'\n💰 Nominal (utang): Rp ' || to_char(p_amount, 'FM999,999,999,999') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
      end || coalesce(E'\n📝 ' || nullif(trim(p_description), ''), ''),
      '/construction-finance',
      jsonb_build_object('expense_id', v_id, 'project_id', p_project_id, 'expense_type', p_expense_type)
    );
  end loop;

  return v_id;
end;
$$;

comment on column public.construction_expenses.expense_type is
  'gaji_tukang: cash, paid out of project dana. pembelian_material: always utang (credit) to the store. material_tunai: material that cannot be put on utang -- cash, paid out of project dana same as gaji_tukang.';
