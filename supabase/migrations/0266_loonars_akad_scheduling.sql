-- ============================================================================
-- MK Connect — 0266: "Jadwalkan Akad" -- send buyer data + KTP to a notary
--
-- Owner's request: once a siteplan purchase is verified, marketing needs a
-- button that collects the buyer's KTP + personal data, sends it straight to
-- the notary (WhatsApp -- this project's established outbound channel, see
-- lib/ai/notifications/engine.ts), together with the akad date marketing
-- proposes. The notary confirms/adjusts the date by calling marketing back
-- directly (owner's explicit call for this first version -- no automated
-- WhatsApp-reply parsing yet); marketing then records the final date in the
-- app themselves.
--
-- Three pieces:
--   1. loonars_notaris -- an admin-managed contact list (name + phone),
--      NOT hardcoded here. The owner adds "Ibu Notaris" herself at
--      /siteplan/admin once this ships, the same way branches/positions/etc.
--      are managed in-app rather than seeded by a migration -- her name and
--      phone number are real personal data that has no business sitting in
--      a public git history.
--   2. loonars_akad_schedules -- one row per purchase, upserted on
--      resubmission (a date can change before the notary's actual visit).
--      Buyer fields (buyer_name/nik/phone/address) and the notary's own
--      name/phone are SNAPSHOTTED at request time, same reasoning as
--      loonars_booking_receipts (0261): what was actually sent to the
--      notary must stay reproducible even if the purchase row or the
--      notary's contact info changes later.
--   3. ktp_photo_path lives in a new PRIVATE storage bucket (ktp-photos) --
--      a KTP scan is meaningfully more sensitive than the public marketing
--      photos in siteplan-images/project-photos, so this follows the
--      attendance-selfies pattern (private, signed URLs, own-folder-only
--      upload) instead.
--
-- RPCs (both SECURITY DEFINER, same audience as the purchase itself: the
-- owning marketing rep or siteplan.manage):
--   * loonars_akad_schedule_request -- creates/updates the schedule row and
--     resolves+returns the active notary's name/phone. Does NOT send the
--     WhatsApp message itself (Postgres does not make outbound HTTP calls in
--     this project) -- the calling Server Action sends the text + KTP image
--     immediately after this returns, directly via sendWhatsAppText/
--     sendWhatsAppImage (same direct-from-action pattern already used by
--     features/messaging/actions/messaging.actions.ts).
--   * loonars_akad_schedule_confirm -- records the final date once the
--     notary has called back, by the requesting rep or siteplan.manage.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Private KTP storage bucket
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ktp-photos', 'ktp-photos', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy ktp_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'ktp-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.app_has_permission('siteplan.manage')
      or public.app_has_permission('prospect.finance_verify')
    )
  );
create policy ktp_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ktp-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- loonars_notaris -- admin-managed notary contacts
-- ----------------------------------------------------------------------------
create table public.loonars_notaris (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loonars_notaris enable row level security;

-- Admin-only: sales never browses this list directly -- loonars_akad_schedule_request
-- (security definer, below) resolves the active notary internally and hands
-- back only the name/phone actually used, snapshotted onto the schedule row.
create policy "loonars_notaris_select" on public.loonars_notaris
  for select to authenticated
  using (public.app_has_permission('siteplan.manage'));
create policy "loonars_notaris_insert" on public.loonars_notaris
  for insert to authenticated
  with check (public.app_has_permission('siteplan.manage'));
create policy "loonars_notaris_update" on public.loonars_notaris
  for update to authenticated
  using (public.app_has_permission('siteplan.manage'))
  with check (public.app_has_permission('siteplan.manage'));

drop trigger if exists loonars_notaris_set_updated_at on public.loonars_notaris;
create trigger loonars_notaris_set_updated_at
  before update on public.loonars_notaris
  for each row execute function public.set_updated_at();

comment on table public.loonars_notaris is
  'Admin-managed notary contacts for the "Jadwalkan Akad" flow (0266). No row is seeded by this migration -- a siteplan.manage holder adds the real notary via /siteplan/admin after deploy. loonars_akad_schedule_request() picks the most recently created row with active = true.';

-- ----------------------------------------------------------------------------
-- loonars_akad_schedules -- one row per purchase, upserted on resubmission
-- ----------------------------------------------------------------------------
create table public.loonars_akad_schedules (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references public.loonars_unit_purchases(id) on delete cascade,
  unit_id uuid not null references public.loonars_units(id) on delete cascade,
  buyer_name text not null,
  nik text not null,
  phone text not null,
  address text not null,
  ktp_photo_path text not null,
  notaris_id uuid references public.loonars_notaris(id) on delete set null,
  notaris_name text not null,
  notaris_phone text not null,
  tanggal_akad_diusulkan date not null,
  tanggal_akad_final date,
  status text not null default 'diajukan' check (status in ('diajukan', 'dikonfirmasi', 'dibatalkan')),
  requested_by uuid not null references public.employees(id) on delete restrict,
  sent_to_notaris_at timestamptz,
  confirmed_by uuid references public.employees(id) on delete set null,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index loonars_akad_schedules_unit_idx on public.loonars_akad_schedules (unit_id);
create index loonars_akad_schedules_requested_by_idx on public.loonars_akad_schedules (requested_by);

alter table public.loonars_akad_schedules enable row level security;

-- Same audience as the purchase itself (loonars_unit_purchases_select, 0202):
-- the requesting rep, or finance/siteplan admin.
create policy "loonars_akad_schedules_select" on public.loonars_akad_schedules
  for select to authenticated
  using (
    requested_by = auth.uid()
    or public.app_has_permission('siteplan.manage')
    or public.app_has_permission('prospect.finance_verify')
  );

-- No insert/update policies -- every write goes through the two RPCs below.
-- Buyer KTP/NIK/address is exactly the kind of data that must never be
-- reachable by a direct client insert/update.

drop trigger if exists loonars_akad_schedules_set_updated_at on public.loonars_akad_schedules;
create trigger loonars_akad_schedules_set_updated_at
  before update on public.loonars_akad_schedules
  for each row execute function public.set_updated_at();

comment on table public.loonars_akad_schedules is
  'One row per purchase requesting a notary-scheduled akad (0266). buyer_name/nik/phone/address and notaris_name/notaris_phone are snapshots at request time -- what was actually sent to the notary stays reproducible even if the purchase or notary contact is edited later. Written only via loonars_akad_schedule_request/loonars_akad_schedule_confirm.';

-- ----------------------------------------------------------------------------
-- loonars_akad_schedule_request -- create/update + resolve the notary
-- ----------------------------------------------------------------------------
create or replace function public.loonars_akad_schedule_request(
  p_purchase_id uuid,
  p_buyer_name text,
  p_nik text,
  p_phone text,
  p_address text,
  p_ktp_photo_path text,
  p_tanggal_akad date,
  p_notes text default null
)
returns public.loonars_akad_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_purchase public.loonars_unit_purchases%rowtype;
  v_notaris public.loonars_notaris%rowtype;
  v_result public.loonars_akad_schedules%rowtype;
begin
  select * into v_purchase from public.loonars_unit_purchases where id = p_purchase_id;
  if not found then
    raise exception 'Pembelian tidak ditemukan';
  end if;

  if v_purchase.marketing_employee_id is distinct from v_user_id and not public.app_has_permission('siteplan.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if v_purchase.status <> 'verified' then
    raise exception 'Akad hanya dapat dijadwalkan untuk pembelian yang sudah diverifikasi Finance';
  end if;

  if btrim(coalesce(p_buyer_name, '')) = '' or btrim(coalesce(p_nik, '')) = '' or btrim(coalesce(p_phone, '')) = '' or btrim(coalesce(p_address, '')) = '' then
    raise exception 'Nama, NIK, telepon, dan alamat pembeli wajib diisi';
  end if;
  if p_ktp_photo_path is null or btrim(p_ktp_photo_path) = '' then
    raise exception 'Foto KTP wajib diunggah';
  end if;
  if p_tanggal_akad is null then
    raise exception 'Tanggal akad wajib diisi';
  end if;

  select * into v_notaris from public.loonars_notaris where active = true order by created_at desc limit 1;
  if not found then
    raise exception 'Belum ada kontak notaris yang aktif -- hubungi admin untuk menambahkannya di Kelola Siteplan';
  end if;

  insert into public.loonars_akad_schedules (
    purchase_id, unit_id, buyer_name, nik, phone, address, ktp_photo_path,
    notaris_id, notaris_name, notaris_phone, tanggal_akad_diusulkan, status,
    requested_by, sent_to_notaris_at, notes
  ) values (
    p_purchase_id, v_purchase.unit_id, btrim(p_buyer_name), btrim(p_nik), btrim(p_phone), btrim(p_address), p_ktp_photo_path,
    v_notaris.id, v_notaris.full_name, v_notaris.phone, p_tanggal_akad, 'diajukan',
    v_user_id, now(), p_notes
  )
  on conflict (purchase_id) do update set
    buyer_name = excluded.buyer_name,
    nik = excluded.nik,
    phone = excluded.phone,
    address = excluded.address,
    ktp_photo_path = excluded.ktp_photo_path,
    notaris_id = excluded.notaris_id,
    notaris_name = excluded.notaris_name,
    notaris_phone = excluded.notaris_phone,
    tanggal_akad_diusulkan = excluded.tanggal_akad_diusulkan,
    status = 'diajukan',
    tanggal_akad_final = null,
    confirmed_by = null,
    confirmed_at = null,
    sent_to_notaris_at = now(),
    notes = excluded.notes,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.loonars_akad_schedule_request(uuid, text, text, text, text, text, date, text) to authenticated;

comment on function public.loonars_akad_schedule_request is
  'Creates or (on resubmission) updates a purchase''s akad schedule, resolving the currently active notary contact. Restarts status at diajukan and clears any prior confirmation on resubmission -- a changed proposed date needs the notary''s confirmation again. Raises if the purchase is not verified, if buyer fields/KTP/date are missing, or if no notary contact is configured yet. Does not send the WhatsApp message itself -- the caller does that immediately after, using the returned notaris_name/notaris_phone.';

-- ----------------------------------------------------------------------------
-- loonars_akad_schedule_confirm -- record the date once the notary replies
-- ----------------------------------------------------------------------------
create or replace function public.loonars_akad_schedule_confirm(p_id uuid, p_tanggal_akad_final date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.loonars_akad_schedules%rowtype;
begin
  select * into v_row from public.loonars_akad_schedules where id = p_id for update;
  if not found then
    raise exception 'Jadwal akad tidak ditemukan';
  end if;

  if v_row.requested_by is distinct from v_user_id and not public.app_has_permission('siteplan.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if p_tanggal_akad_final is null then
    raise exception 'Tanggal akad final wajib diisi';
  end if;

  update public.loonars_akad_schedules set
    tanggal_akad_final = p_tanggal_akad_final,
    status = 'dikonfirmasi',
    confirmed_by = v_user_id,
    confirmed_at = now(),
    updated_at = now()
  where id = p_id;
end;
$$;

grant execute on function public.loonars_akad_schedule_confirm(uuid, date) to authenticated;

comment on function public.loonars_akad_schedule_confirm is
  'Records the final akad date after the notary has confirmed by phone/WhatsApp directly to the requesting rep (0266 v1 -- no automated reply parsing yet). Callable by the requesting rep or siteplan.manage.';
