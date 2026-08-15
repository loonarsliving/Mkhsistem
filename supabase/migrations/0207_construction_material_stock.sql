-- First slice of the new Construction Management module (approved
-- architecture proposal): connects the existing Kendari material-purchase
-- input (construction_expenses, expense_type in material_tunai/
-- pembelian_material) to a real material stock ledger, so a Kepala Cabang or
-- site supervisor entering "beli semen 20 zak" automatically increases stock
-- -- the foundation the later BOQ/procurement/labor (kontraktor) module will
-- read from. Deliberately hangs off the EXISTING construction_projects (the
-- live Kendari fund ledger, 1 row today) rather than inventing a parallel
-- cm_projects entity right now -- per the phased-build principle, build the
-- connection that's needed today; the fuller cm_* project/unit hierarchy
-- comes in a later phase and can repoint this stock ledger to it then.

create table public.cm_materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null check (category in ('semen', 'besi', 'pasir_batu', 'bata', 'cat', 'keramik', 'plumbing', 'electrical', 'kayu', 'lainnya')),
  unit_satuan text not null, -- zak, kg, m3, batang, liter, dus, meter, buah
  standard_price numeric(14, 2),
  min_stock numeric(14, 2) not null default 0 check (min_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cm_material_stock (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  material_id uuid not null references public.cm_materials(id) on delete restrict,
  quantity numeric(14, 2) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (project_id, material_id)
);
create index cm_material_stock_project_idx on public.cm_material_stock (project_id);

create table public.cm_stock_movements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  material_id uuid not null references public.cm_materials(id) on delete restrict,
  direction text not null check (direction in ('in', 'out')),
  quantity numeric(14, 2) not null check (quantity > 0),
  source_type text not null check (source_type in ('purchase', 'consumption', 'adjustment', 'waste')),
  source_expense_id uuid references public.construction_expenses(id) on delete set null,
  note text,
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index cm_stock_movements_project_idx on public.cm_stock_movements (project_id);
create index cm_stock_movements_material_idx on public.cm_stock_movements (material_id);

alter table public.construction_expenses
  add column material_id uuid references public.cm_materials(id),
  add column quantity numeric(14, 2) check (quantity is null or quantity > 0);
comment on column public.construction_expenses.material_id is
  'Only meaningful when expense_type is a material type (material_tunai/pembelian_material). When set together with quantity, construction_submit_expense auto-credits cm_material_stock -- this is the finance-to-stock connection.';

alter table public.cm_materials enable row level security;
alter table public.cm_material_stock enable row level security;
alter table public.cm_stock_movements enable row level security;

-- Same access shape as construction_expenses: own branch's project, or construction_finance.manage.
create policy cm_materials_select on public.cm_materials for select to authenticated using (true); -- catalog is not sensitive, readable by anyone authenticated
create policy cm_material_stock_select on public.cm_material_stock for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (
    select 1 from public.construction_projects p
    join public.employees e on e.branch_id = p.branch_id
    where p.id = cm_material_stock.project_id and e.id = auth.uid()
  )
);
create policy cm_stock_movements_select on public.cm_stock_movements for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (
    select 1 from public.construction_projects p
    join public.employees e on e.branch_id = p.branch_id
    where p.id = cm_stock_movements.project_id and e.id = auth.uid()
  )
);

-- ----------------------------------------------------------------------------
-- construction_submit_expense(): add optional material_id/quantity params.
-- When given for a material-type expense, credits cm_material_stock and logs
-- a cm_stock_movements row referencing the expense -- the actual connection.
-- ----------------------------------------------------------------------------
create or replace function public.construction_submit_expense(
  p_project_id uuid,
  p_expense_type text,
  p_party_name text,
  p_amount numeric,
  p_description text default null,
  p_expense_date date default current_date,
  p_photo_url text default null,
  p_material_id uuid default null,
  p_quantity numeric default null
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
  v_is_material boolean;
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

  v_is_material := p_expense_type in ('pembelian_material', 'material_tunai');
  if p_material_id is not null and not v_is_material then
    raise exception 'Material hanya berlaku untuk jenis pengeluaran Material';
  end if;
  if p_material_id is not null and (p_quantity is null or p_quantity <= 0) then
    raise exception 'Jumlah (quantity) wajib diisi jika memilih material';
  end if;

  v_payment_method := case when p_expense_type in ('pembelian_material', 'pembelian_lain_lain') then 'utang' else 'cash' end;

  insert into public.construction_expenses (
    project_id, branch_id, expense_type, party_name, description, amount,
    payment_method, expense_date, photo_url, created_by, material_id, quantity
  )
  values (
    p_project_id, v_project.branch_id, p_expense_type, trim(p_party_name), nullif(trim(p_description), ''), p_amount,
    v_payment_method, coalesce(p_expense_date, current_date), p_photo_url, v_caller, p_material_id, p_quantity
  )
  returning id into v_id;

  if p_material_id is not null and p_quantity is not null and p_quantity > 0 then
    insert into public.cm_stock_movements (project_id, material_id, direction, quantity, source_type, source_expense_id, created_by)
    values (p_project_id, p_material_id, 'in', p_quantity, 'purchase', v_id, v_caller);

    insert into public.cm_material_stock (project_id, material_id, quantity)
    values (p_project_id, p_material_id, p_quantity)
    on conflict (project_id, material_id) do update
      set quantity = cm_material_stock.quantity + excluded.quantity, updated_at = now();
  end if;

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
          then '🧱 Toko/Supplier: ' || trim(p_party_name) || E'\n💰 Nominal (tunai): Rp ' || to_char(p_amount, 'FM999,999,999,999')
            || coalesce(E'\n📦 ' || p_quantity::text, '') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
        when p_expense_type = 'pembelian_material'
          then '🏪 Toko: ' || trim(p_party_name) || E'\n💰 Nominal (utang): Rp ' || to_char(p_amount, 'FM999,999,999,999')
            || coalesce(E'\n📦 ' || p_quantity::text, '') || E'\n📅 Tanggal: ' || to_char(coalesce(p_expense_date, current_date), 'DD Mon YYYY')
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

-- Starter material catalog covering the categories most commonly bought
-- (matches the BOQ material categories from the approved architecture
-- proposal). Kepala Cabang/site supervisor picks from this list when
-- logging a material purchase; more can be added later via direct insert
-- or a future admin UI.
insert into public.cm_materials (code, name, category, unit_satuan, standard_price) values
  ('SMN-01', 'Semen', 'semen', 'zak', 65000),
  ('BSI-01', 'Besi Beton', 'besi', 'kg', 15000),
  ('PSR-01', 'Pasir', 'pasir_batu', 'm3', 350000),
  ('BTU-01', 'Batu Split', 'pasir_batu', 'm3', 400000),
  ('BTR-01', 'Bata Ringan', 'bata', 'm3', 750000),
  ('BTM-01', 'Bata Merah', 'bata', 'buah', 800),
  ('CAT-01', 'Cat Tembok', 'cat', 'kg', 45000),
  ('KRM-01', 'Keramik Lantai', 'keramik', 'm2', 65000),
  ('PVC-01', 'Pipa PVC', 'plumbing', 'batang', 45000),
  ('KBL-01', 'Kabel Listrik', 'electrical', 'meter', 8000),
  ('KYU-01', 'Kayu Kaso', 'kayu', 'batang', 45000),
  ('PKU-01', 'Paku', 'lainnya', 'kg', 20000)
on conflict (code) do nothing;
