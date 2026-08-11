-- ============================================================================
-- MK Connect — 0202: native Siteplan feature (self-contained, not a sync
-- receiver)
--
-- Reverse-engineered from loonars-sales (a separate static-HTML app hitting a
-- *different* Supabase project directly): a grid of property units
-- color-coded by status that a sales rep clicks to declare a buyer, which
-- goes through finance verification and then a fee claim.
--
-- Owner's explicit call: this is a brand-new, self-contained feature with its
-- own tables (`loonars_project*` / `loonars_unit_*` / `loonars_siteplan_*`)
-- owned and edited directly inside MK Connect -- NOT another inbound sync
-- receiver like `loonars_closings` (0175 and friends), which is untouched by
-- this migration and keeps mirroring the *external* loonars-sales app as-is.
-- The `loonars_` prefix is kept only because the owner refers to this whole
-- product line as "Loonars"; there is no relationship to the sync tables
-- beyond the name and the general shape of the verify/fee-claim flow, which
-- is deliberately mirrored here for UI/permission consistency (same
-- `prospect.finance_verify` persona verifies both, same `loonars_fee_alert`
-- notification category alerts Super Admin for both).
--
-- New here (the original loonars-sales app never had this): a payment-method
-- marker (Cash / KPR / Both) on every purchase.
--
-- Tables: loonars_projects -> loonars_units (grid cells) -> one
-- loonars_siteplan_layouts row per project (background siteplan image
-- config: storage path + natural pixel dimensions) plus one
-- loonars_unit_positions row per unit (a point hotspot, x_pct/y_pct, placed
-- on that image) -> loonars_unit_purchases (one row per buyer attempt,
-- history-preserving unlike the original's overwrite-in-place buyer field)
-- -> loonars_unit_fee_requests (fee claim, separate from the purchase
-- record).
--
-- Corrected 2026-08-11: the real loonars-sales siteplan is a rendered
-- architectural image (perspective illustration of houses, legend, north
-- arrow, dimension annotations, title block) with each unit clickable at its
-- actual drawn position -- NOT a plain text grid of unit-code boxes. So
-- loonars_siteplan_layouts holds an uploaded background image (not an
-- ordinal jsonb row/unit-code layout), and unit placement is a per-unit
-- point hotspot in the new loonars_unit_positions table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- loonars_projects
-- ----------------------------------------------------------------------------
create table public.loonars_projects (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  nama text not null,
  lokasi text,
  warna text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loonars_projects enable row level security;

create policy "loonars_projects_select" on public.loonars_projects
  for select to authenticated
  using (true);

create policy "loonars_projects_insert" on public.loonars_projects
  for insert to authenticated
  with check (public.app_has_permission('siteplan.manage'));

create policy "loonars_projects_update" on public.loonars_projects
  for update to authenticated
  using (public.app_has_permission('siteplan.manage'))
  with check (public.app_has_permission('siteplan.manage'));

drop trigger if exists loonars_projects_set_updated_at on public.loonars_projects;
create trigger loonars_projects_set_updated_at
  before update on public.loonars_projects
  for each row execute function public.set_updated_at();

comment on table public.loonars_projects is
  'Native siteplan projects (e.g. a housing cluster), owned directly in MK Connect -- not synced from the external loonars-sales app. Readable by any authenticated employee; managed by siteplan.manage holders.';

-- ----------------------------------------------------------------------------
-- loonars_units
-- ----------------------------------------------------------------------------
create table public.loonars_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.loonars_projects(id) on delete cascade,
  blok text not null,
  tipe text,
  harga numeric,
  luas numeric,
  status text not null default 'tersedia' check (status in ('tersedia', 'dp', 'verifikasi', 'terjual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, blok)
);

create index loonars_units_project_idx on public.loonars_units (project_id);
create index loonars_units_status_idx on public.loonars_units (status);

alter table public.loonars_units enable row level security;

create policy "loonars_units_select" on public.loonars_units
  for select to authenticated
  using (true);

create policy "loonars_units_insert" on public.loonars_units
  for insert to authenticated
  with check (public.app_has_permission('siteplan.manage'));

create policy "loonars_units_update" on public.loonars_units
  for update to authenticated
  using (public.app_has_permission('siteplan.manage'))
  with check (public.app_has_permission('siteplan.manage'));

drop trigger if exists loonars_units_set_updated_at on public.loonars_units;
create trigger loonars_units_set_updated_at
  before update on public.loonars_units
  for each row execute function public.set_updated_at();

comment on table public.loonars_units is
  'Individual siteplan units/kavling (blok code, price, area, status). status is also flipped by the loonars_unit_purchase_* RPCs, not just admin CRUD -- see below.';

-- ----------------------------------------------------------------------------
-- loonars_siteplan_layouts -- one background siteplan image per project
-- (the rendered architectural drawing itself; unit hotspots live separately
-- in loonars_unit_positions below).
-- ----------------------------------------------------------------------------
create table public.loonars_siteplan_layouts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.loonars_projects(id) on delete cascade,
  image_path text not null,
  image_width integer,
  image_height integer,
  updated_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.loonars_siteplan_layouts enable row level security;

create policy "loonars_siteplan_layouts_select" on public.loonars_siteplan_layouts
  for select to authenticated
  using (true);

create policy "loonars_siteplan_layouts_insert" on public.loonars_siteplan_layouts
  for insert to authenticated
  with check (public.app_has_permission('siteplan.manage'));

create policy "loonars_siteplan_layouts_update" on public.loonars_siteplan_layouts
  for update to authenticated
  using (public.app_has_permission('siteplan.manage'))
  with check (public.app_has_permission('siteplan.manage'));

drop trigger if exists loonars_siteplan_layouts_set_updated_at on public.loonars_siteplan_layouts;
create trigger loonars_siteplan_layouts_set_updated_at
  before update on public.loonars_siteplan_layouts
  for each row execute function public.set_updated_at();

comment on table public.loonars_siteplan_layouts is
  'One background siteplan image per project -- image_path is the object key in the siteplan-images storage bucket (public bucket, same convention as project-photos/0078); image_width/image_height are the uploaded image''s natural pixel dimensions, used to render the image at the right aspect ratio before overlaying unit hotspots. Written via loonars_siteplan_image_save (siteplan.manage).';

-- ----------------------------------------------------------------------------
-- loonars_unit_positions -- one point hotspot per unit, placed on its
-- project's siteplan image (x_pct/y_pct = % of rendered image width/height,
-- marking the hotspot marker's center). Not a polygon -- a simple pin,
-- matching how an admin clicks/drags a marker onto the rendered drawing.
-- ----------------------------------------------------------------------------
create table public.loonars_unit_positions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null unique references public.loonars_units(id) on delete cascade,
  x_pct numeric(5,2) not null check (x_pct >= 0 and x_pct <= 100),
  y_pct numeric(5,2) not null check (y_pct >= 0 and y_pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loonars_unit_positions enable row level security;

create policy "loonars_unit_positions_select" on public.loonars_unit_positions
  for select to authenticated
  using (true);

create policy "loonars_unit_positions_insert" on public.loonars_unit_positions
  for insert to authenticated
  with check (public.app_has_permission('siteplan.manage'));

create policy "loonars_unit_positions_update" on public.loonars_unit_positions
  for update to authenticated
  using (public.app_has_permission('siteplan.manage'))
  with check (public.app_has_permission('siteplan.manage'));

create policy "loonars_unit_positions_delete" on public.loonars_unit_positions
  for delete to authenticated
  using (public.app_has_permission('siteplan.manage'));

drop trigger if exists loonars_unit_positions_set_updated_at on public.loonars_unit_positions;
create trigger loonars_unit_positions_set_updated_at
  before update on public.loonars_unit_positions
  for each row execute function public.set_updated_at();

comment on table public.loonars_unit_positions is
  'One hotspot pin per unit on its project''s siteplan image: x_pct/y_pct (0-100) locate the marker''s center as a percentage of the rendered image width/height. Units without a row here are "unplaced" and show up in the admin position editor''s sidebar list rather than on the image. Upserted via loonars_unit_position_upsert (siteplan.manage).';

-- ----------------------------------------------------------------------------
-- Storage bucket for siteplan background images. Public bucket, same
-- convention as project-photos (0078) -- these are marketing drawings, not
-- sensitive documents, so a signed-URL round trip isn't needed.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('siteplan-images', 'siteplan-images', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy siteplan_images_bucket_select on storage.objects for select to authenticated, anon
  using (bucket_id = 'siteplan-images');
create policy siteplan_images_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'siteplan-images' and public.app_has_permission('siteplan.manage'));
create policy siteplan_images_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'siteplan-images' and public.app_has_permission('siteplan.manage'));
create policy siteplan_images_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'siteplan-images' and public.app_has_permission('siteplan.manage'));

-- ----------------------------------------------------------------------------
-- loonars_unit_purchases -- one row per buyer attempt (history-preserving).
-- ----------------------------------------------------------------------------
create table public.loonars_unit_purchases (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.loonars_units(id) on delete cascade,
  buyer_name text not null,
  nik text,
  phone text,
  address text,
  transaction_type text not null check (transaction_type in ('booking', 'dp', 'akad')),
  -- New here: the original loonars-sales app never had a payment-method marker.
  payment_method text not null default 'cash' check (payment_method in ('cash', 'kpr', 'both')),
  price numeric,
  booking_fee numeric,
  dp_amount numeric,
  pelunasan_amount numeric,
  transaction_date date not null default current_date,
  handover_date date,
  spi_no text,
  marketing_employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  status text not null default 'pending_verification' check (status in ('pending_verification', 'verified', 'rejected')),
  verified_by uuid references public.employees(id) on delete set null,
  verified_at timestamptz,
  reject_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A unit can only have one *live* (non-rejected) purchase at a time; rejected
-- attempts stay in history and a fresh attempt can be made after a rejection.
create unique index loonars_unit_purchases_live_unit_idx
  on public.loonars_unit_purchases (unit_id)
  where status <> 'rejected';

create index loonars_unit_purchases_marketing_idx on public.loonars_unit_purchases (marketing_employee_id);
create index loonars_unit_purchases_status_idx on public.loonars_unit_purchases (status);

alter table public.loonars_unit_purchases enable row level security;

-- Buyer PII (NIK/phone/address) is restricted to the submitting marketing
-- employee and finance verifiers -- not broadly visible like the read-only
-- catalog tables above.
create policy "loonars_unit_purchases_select" on public.loonars_unit_purchases
  for select to authenticated
  using (marketing_employee_id = auth.uid() or public.app_has_permission('prospect.finance_verify'));

drop trigger if exists loonars_unit_purchases_set_updated_at on public.loonars_unit_purchases;
create trigger loonars_unit_purchases_set_updated_at
  before update on public.loonars_unit_purchases
  for each row execute function public.set_updated_at();

comment on table public.loonars_unit_purchases is
  'One row per buyer attempt on a unit (history-preserving, unlike the original loonars-sales app which overwrote a single buyer field per unit). Only one live (status <> rejected) purchase per unit at a time -- see loonars_unit_purchases_live_unit_idx. All writes go through the loonars_unit_purchase_* RPCs (security definer), never direct client insert/update.';

-- ----------------------------------------------------------------------------
-- loonars_unit_fee_requests -- fee claim, separate from the purchase record.
-- ----------------------------------------------------------------------------
create table public.loonars_unit_fee_requests (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.loonars_unit_purchases(id) on delete cascade,
  unit_id uuid not null references public.loonars_units(id) on delete cascade,
  marketing_employee_id uuid not null references public.employees(id) on delete restrict,
  fee_amount numeric not null,
  phone text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.employees(id) on delete set null,
  decided_at timestamptz,
  reject_reason text,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live (non-rejected) fee request per purchase at a time; can re-request
-- after a rejection.
create unique index loonars_unit_fee_requests_live_purchase_idx
  on public.loonars_unit_fee_requests (purchase_id)
  where status <> 'rejected';

create index loonars_unit_fee_requests_marketing_idx on public.loonars_unit_fee_requests (marketing_employee_id);
create index loonars_unit_fee_requests_status_idx on public.loonars_unit_fee_requests (status);

alter table public.loonars_unit_fee_requests enable row level security;

create policy "loonars_unit_fee_requests_select" on public.loonars_unit_fee_requests
  for select to authenticated
  using (marketing_employee_id = auth.uid() or public.app_has_permission('siteplan.manage'));

drop trigger if exists loonars_unit_fee_requests_set_updated_at on public.loonars_unit_fee_requests;
create trigger loonars_unit_fee_requests_set_updated_at
  before update on public.loonars_unit_fee_requests
  for each row execute function public.set_updated_at();

comment on table public.loonars_unit_fee_requests is
  'Fee claim submitted by the marketing rep who owns a verified purchase, decided by a siteplan.manage holder (mirrors the shape of the external loonars_fee concept from 0175/0185-0188, but fully native/self-service -- no WhatsApp-only decision, no sync events). All writes go through the loonars_unit_fee_* RPCs.';

-- ----------------------------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------------------------
create or replace function public.loonars_unit_purchase_submit(
  p_unit_id uuid,
  p_buyer_name text,
  p_nik text default null,
  p_phone text default null,
  p_address text default null,
  p_transaction_type text default 'booking',
  p_payment_method text default 'cash',
  p_price numeric default null,
  p_booking_fee numeric default null,
  p_dp_amount numeric default null,
  p_pelunasan_amount numeric default null,
  p_handover_date date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee record;
  v_unit public.loonars_units%rowtype;
  v_purchase_id uuid;
  v_admin record;
begin
  select e.id, e.branch_id, e.full_name into v_employee
  from public.employees e
  where e.id = auth.uid() and e.deleted_at is null and e.employment_status = 'active';

  if v_employee.id is null then
    raise exception 'Karyawan tidak ditemukan atau tidak aktif' using errcode = '28000';
  end if;

  if p_buyer_name is null or btrim(p_buyer_name) = '' then
    raise exception 'Nama pembeli wajib diisi';
  end if;
  if p_transaction_type not in ('booking', 'dp', 'akad') then
    raise exception 'Tipe transaksi tidak valid';
  end if;
  if p_payment_method not in ('cash', 'kpr', 'both') then
    raise exception 'Metode pembayaran tidak valid';
  end if;

  select * into v_unit from public.loonars_units where id = p_unit_id for update;
  if not found then
    raise exception 'Unit tidak ditemukan';
  end if;
  if v_unit.status <> 'tersedia' then
    raise exception 'Unit % sudah tidak tersedia (status: %)', v_unit.blok, v_unit.status;
  end if;

  insert into public.loonars_unit_purchases (
    unit_id, buyer_name, nik, phone, address, transaction_type, payment_method,
    price, booking_fee, dp_amount, pelunasan_amount, handover_date,
    marketing_employee_id, branch_id, notes
  ) values (
    p_unit_id, p_buyer_name, p_nik, p_phone, p_address, p_transaction_type, p_payment_method,
    p_price, p_booking_fee, p_dp_amount, p_pelunasan_amount, p_handover_date,
    v_employee.id, v_employee.branch_id, p_notes
  )
  returning id into v_purchase_id;

  update public.loonars_units set status = 'verifikasi', updated_at = now() where id = p_unit_id;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'loonars_fee_alert',
      'Siteplan: Unit Baru Diajukan — ' || v_unit.blok,
      coalesce(v_employee.full_name, '-') || ' mengajukan pembelian unit ' || v_unit.blok
        || E'\nPembeli: ' || p_buyer_name
        || E'\nTipe: ' || p_transaction_type || ', Metode: ' || p_payment_method
        || E'\nMohon verifikasi apakah dana sudah masuk.',
      '/crm/finance',
      jsonb_build_object('loonars_unit_purchase_id', v_purchase_id, 'unit_id', p_unit_id)
    );
  end loop;

  return v_purchase_id;
end;
$$;

create or replace function public.loonars_unit_purchase_verify(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_unit_purchases%rowtype;
begin
  if not public.app_has_permission('prospect.finance_verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_row from public.loonars_unit_purchases where id = p_id for update;
  if not found then
    raise exception 'Purchase not found';
  end if;
  if v_row.status <> 'pending_verification' then
    raise exception 'Purchase sudah diputuskan';
  end if;

  update public.loonars_unit_purchases set
    status = 'verified', verified_by = v_user_id, verified_at = now(), updated_at = now()
  where id = p_id;

  update public.loonars_units set status = 'terjual', updated_at = now() where id = v_row.unit_id;

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  values (
    v_row.marketing_employee_id, 'system', 'closing_approved',
    'Pembayaran Terverifikasi — Unit Siteplan',
    'Pembelian unit oleh ' || coalesce(v_row.buyer_name, '-') || ' sudah terverifikasi. Silakan ajukan fee dari dashboard.',
    '/dashboard'
  );
end;
$$;

create or replace function public.loonars_unit_purchase_reject(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_unit_purchases%rowtype;
begin
  if not public.app_has_permission('prospect.finance_verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_row from public.loonars_unit_purchases where id = p_id for update;
  if not found then
    raise exception 'Purchase not found';
  end if;
  if v_row.status <> 'pending_verification' then
    raise exception 'Purchase sudah diputuskan';
  end if;

  update public.loonars_unit_purchases set
    status = 'rejected', verified_by = v_user_id, verified_at = now(), reject_reason = p_reason, updated_at = now()
  where id = p_id;

  update public.loonars_units set status = 'tersedia', updated_at = now() where id = v_row.unit_id;

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  values (
    v_row.marketing_employee_id, 'system', 'rejected',
    'Pembelian Unit Ditolak',
    'Pembelian unit oleh ' || coalesce(v_row.buyer_name, '-') || ' ditolak'
      || case when p_reason is not null and p_reason <> '' then ': ' || p_reason else '.' end,
    '/dashboard'
  );
end;
$$;

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
  if p_fee_amount is null or p_fee_amount <= 0 then
    raise exception 'Nominal fee tidak valid';
  end if;
  if exists (
    select 1 from public.loonars_unit_fee_requests
    where purchase_id = p_purchase_id and status <> 'rejected'
  ) then
    raise exception 'Fee sudah diajukan';
  end if;

  select * into v_unit from public.loonars_units where id = v_row.unit_id;

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

create or replace function public.loonars_unit_fee_decide(p_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_unit_fee_requests%rowtype;
  v_new_status text := case when p_approve then 'approved' else 'rejected' end;
begin
  if not public.app_has_permission('siteplan.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_row from public.loonars_unit_fee_requests where id = p_id for update;
  if not found then
    raise exception 'Fee request not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Fee request sudah diputuskan';
  end if;

  update public.loonars_unit_fee_requests set
    status = v_new_status, decided_by = v_user_id, decided_at = now(), reject_reason = p_reason, updated_at = now()
  where id = p_id;

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  values (
    v_row.marketing_employee_id, 'system', v_new_status,
    (case when p_approve then 'Fee Disetujui' else 'Fee Ditolak' end) || ' — Siteplan',
    'Pengajuan fee sebesar Rp ' || to_char(v_row.fee_amount, 'FM999,999,999,999') || ' '
      || (case when p_approve then 'disetujui' else 'ditolak' end)
      || case when not p_approve and p_reason is not null and p_reason <> '' then ': ' || p_reason else '.' end,
    '/dashboard'
  );
end;
$$;

create or replace function public.loonars_siteplan_image_save(
  p_project_id uuid,
  p_image_path text,
  p_image_width integer default null,
  p_image_height integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if not public.app_has_permission('siteplan.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if p_image_path is null or btrim(p_image_path) = '' then
    raise exception 'image_path wajib diisi';
  end if;

  insert into public.loonars_siteplan_layouts (project_id, image_path, image_width, image_height, updated_by, updated_at)
  values (p_project_id, p_image_path, p_image_width, p_image_height, v_user_id, now())
  on conflict (project_id) do update set
    image_path = excluded.image_path,
    image_width = excluded.image_width,
    image_height = excluded.image_height,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.loonars_unit_position_upsert(
  p_unit_id uuid,
  p_x_pct numeric,
  p_y_pct numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.app_has_permission('siteplan.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if p_x_pct is null or p_x_pct < 0 or p_x_pct > 100 or p_y_pct is null or p_y_pct < 0 or p_y_pct > 100 then
    raise exception 'Posisi hotspot tidak valid';
  end if;

  if not exists (select 1 from public.loonars_units where id = p_unit_id) then
    raise exception 'Unit tidak ditemukan';
  end if;

  insert into public.loonars_unit_positions (unit_id, x_pct, y_pct, updated_at)
  values (p_unit_id, p_x_pct, p_y_pct, now())
  on conflict (unit_id) do update set
    x_pct = excluded.x_pct,
    y_pct = excluded.y_pct,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.loonars_unit_purchase_submit(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, date, text) to authenticated;
grant execute on function public.loonars_unit_purchase_verify(uuid) to authenticated;
grant execute on function public.loonars_unit_purchase_reject(uuid, text) to authenticated;
grant execute on function public.loonars_unit_fee_request(uuid, numeric, text) to authenticated;
grant execute on function public.loonars_unit_fee_decide(uuid, boolean, text) to authenticated;
grant execute on function public.loonars_siteplan_image_save(uuid, text, integer, integer) to authenticated;
grant execute on function public.loonars_unit_position_upsert(uuid, numeric, numeric) to authenticated;

comment on function public.loonars_unit_purchase_submit is
  'A marketing employee declares a buyer for an available unit. Resolves the caller via auth.uid() = employees.id, raises if the unit is not currently tersedia (no double-booking), flips the unit to verifikasi, and alerts every active super_admin (loonars_fee_alert category).';
comment on function public.loonars_unit_purchase_verify is
  'Finance verifies a siteplan purchase (prospect.finance_verify): flips it to verified, marks the unit terjual, notifies the marketing rep in-app.';
comment on function public.loonars_unit_purchase_reject is
  'Finance rejects a siteplan purchase (prospect.finance_verify): reverts the unit to tersedia so a new buyer can be declared, notifies the marketing rep.';
comment on function public.loonars_unit_fee_request is
  'The marketing rep who owns a verified purchase claims their fee. Raises if the caller is not the owning rep, if the purchase is not verified, or if a live (non-rejected) fee request already exists. Alerts every active super_admin.';
comment on function public.loonars_unit_fee_decide is
  'A siteplan.manage holder approves/rejects a pending fee request, notifying the requesting marketing employee (reuses the generic approved/rejected notification categories).';
comment on function public.loonars_siteplan_image_save is
  'siteplan.manage: upserts a project''s background siteplan image (storage path + natural pixel dimensions) after the client uploads the file to the siteplan-images bucket via uploadEntityFile.';
comment on function public.loonars_unit_position_upsert is
  'siteplan.manage: places or repositions a single unit''s hotspot pin (x_pct/y_pct, 0-100) on its project''s siteplan image. Called once per changed marker when the admin position editor saves.';

-- ----------------------------------------------------------------------------
-- Permissions
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('siteplan.view', 'View the native siteplan unit grid and submit/track own purchases and fee claims'),
  ('siteplan.manage', 'Manage siteplan projects/units/layout (admin CRUD) and decide fee claim requests')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where p.key = 'siteplan.view'
  and r.key in ('super_admin', 'direktur_utama', 'direktur_operasional', 'sales', 'manager', 'kepala_cabang', 'finance')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where p.key = 'siteplan.manage'
  and r.key in ('super_admin', 'direktur_utama', 'direktur_operasional')
on conflict do nothing;
