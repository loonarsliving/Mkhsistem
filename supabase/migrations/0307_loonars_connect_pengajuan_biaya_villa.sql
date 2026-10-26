-- ============================================================================
-- MK Connect — 0307: Loonars Connect, "Pengajuan Biaya Villa" chat
--
-- Owner's request (2026-10-26): the villa manager (Rebecca) submits laundry,
-- Netflix and other costs ("lain-lain", named by the manager) from chat; the
-- villa's Finance approves and uploads the transfer proof from the villa
-- app's Finance dashboard (Finance stays OUT of the chat, owner's decision);
-- the proof comes back to the chat. Everything is recorded in the villa
-- app's Finance -- the villa dashboard is the second interface.
--
-- Source of truth stays in the villa app: villa_pengajuan_biaya (villa
-- migration 20261026000001). This migration never stores a cost of its own:
--   * mkc_biaya_create() inserts the villa row (diajukan_lewat = 'chat') with
--     the same validation as villa-api POST /manager/pengajuan. Files are
--     uploaded by the server (service role) into the villa bucket
--     villa-pengajuan-biaya under chat/<employee id>/; the RPC accepts only
--     paths under the caller's own folder that already exist.
--   * mkc_biaya_cancel() cancels the caller's group's pending request, like
--     villa-api /manager/pengajuan/batal.
--   * A trigger on villa_pengajuan_biaya posts every new request (also those
--     made on the villa dashboard) and every status change (Finance approve /
--     reject / transfer, cancel) into the group, and notifies the manager on
--     Finance's decisions. Errors are caught: a chat problem never fails a
--     villa write.
--   * mkc_biaya_cards() returns the live card data (no file paths) for
--     messages of a conversation the caller can read. Files are opened
--     through a server action that signs a short-lived URL after the same
--     check.
-- Group: department pengajuan_biaya_villa, members = explicit
-- mkc_chat_role_assignments rows (Rebecca, 'manager'; inserted as data after
-- this migration) + the owners (settings.include_owners, 0298). No division
-- mapping, no scheduled report (no report_times), no owner feed.
-- ============================================================================

alter table public.mkc_chat_messages drop constraint mkc_chat_messages_ref_table_check;
alter table public.mkc_chat_messages add constraint mkc_chat_messages_ref_table_check
  check (ref_table in ('room_task', 'issue', 'checklist', 'report', 'content_plan', 'kol', 'prospect', 'visit', 'purchase', 'daily_report', 'biaya'));

insert into public.mkc_chat_departments (code, name, branch_id, timezone, settings)
select 'pengajuan_biaya_villa', 'Pengajuan Biaya Villa', b.id, 'Asia/Jakarta', jsonb_build_object('include_owners', true)
from public.branches b where b.code = 'JOG'
on conflict (code) do nothing;

insert into public.mkc_chat_conversations (department_id, kind, name, description)
select d.id, 'operational_group', 'Pengajuan Biaya Villa', 'Pengajuan laundry, Netflix, dan biaya lain ke Finance villa; bukti transfer Finance masuk ke sini'
from public.mkc_chat_departments d where d.code = 'pengajuan_biaya_villa'
on conflict (department_id, kind) where kind <> 'direct' do nothing;

-- Owners join now; Rebecca joins when her assignment row is inserted (the
-- assignment trigger re-syncs).
select public.mkc_chat_sync_members();

-- ----------------------------------------------------------------------------
-- Card data (no storage paths, only whether a file exists)
-- ----------------------------------------------------------------------------
create or replace function public.mkc_biaya_card_json(p public.villa_pengajuan_biaya)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'nomor', p.nomor, 'kategori', p.kategori, 'kategori_nama', p.kategori_nama,
    'jenis', p.jenis, 'periode', p.periode, 'nominal', p.nominal, 'keterangan', p.keterangan,
    'penerima_nama', p.penerima_nama, 'penerima_bank', p.penerima_bank, 'penerima_rekening', p.penerima_rekening,
    'status', p.status, 'diajukan_lewat', p.diajukan_lewat, 'diajukan_oleh_nama', p.diajukan_oleh_nama,
    'diajukan_oleh_employee', p.diajukan_oleh_employee,
    'diputus_oleh_nama', p.diputus_oleh_nama, 'diputus_at', p.diputus_at, 'catatan_finance', p.catatan_finance,
    'alasan_tolak', p.alasan_tolak, 'tanggal_transfer', p.tanggal_transfer, 'ditransfer_oleh_nama', p.ditransfer_oleh_nama,
    'ditransfer_at', p.ditransfer_at, 'alasan_batal', p.alasan_batal, 'created_at', p.created_at,
    'ada_nota', p.nota_path is not null, 'ada_bukti_bayar', p.bukti_bayar_path is not null,
    'ada_bukti_transfer', p.bukti_transfer_path is not null
  )
$$;

-- Only requests that a message of this (readable) conversation points at.
create or replace function public.mkc_biaya_cards(p_conversation_id uuid, p_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.mkc_chat_can_read(p_conversation_id) then
    raise exception 'Anda tidak bisa membuka percakapan ini' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.mkc_biaya_card_json(p))
    from public.villa_pengajuan_biaya p
    where p.id = any (coalesce(p_ids, '{}'))
      and exists (select 1 from public.mkc_chat_messages m
                  where m.conversation_id = p_conversation_id and m.ref_table = 'biaya' and m.ref_id = p.id)
  ), '[]'::jsonb);
end;
$$;

-- Storage path of one file of a request, for the server action that signs
-- it (service role only). Same visibility rule as mkc_biaya_cards, checked
-- for the given user.
create or replace function public.mkc_biaya_file_path(p_user uuid, p_conversation_id uuid, p_id uuid, p_file text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case p_file when 'nota' then p.nota_path when 'bukti_bayar' then p.bukti_bayar_path when 'bukti_transfer' then p.bukti_transfer_path end
  from public.villa_pengajuan_biaya p
  join public.mkc_chat_members cm on cm.conversation_id = p_conversation_id and cm.employee_id = p_user and cm.removed_at is null
  where p.id = p_id
    and exists (select 1 from public.mkc_chat_messages m
                where m.conversation_id = p_conversation_id and m.ref_table = 'biaya' and m.ref_id = p.id)
$$;

-- ----------------------------------------------------------------------------
-- Manager RPCs
-- ----------------------------------------------------------------------------
create or replace function public.mkc_biaya_file_ok(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select p_path is not null
     and p_path like 'chat/' || auth.uid()::text || '/%'
     and p_path !~ '\.\.'
     and exists (select 1 from storage.objects o where o.bucket_id = 'villa-pengajuan-biaya' and o.name = p_path)
$$;

create or replace function public.mkc_biaya_create(
  p_kategori text, p_kategori_nama text, p_jenis text, p_periode text, p_nominal bigint, p_keterangan text,
  p_penerima_nama text, p_penerima_bank text, p_penerima_rekening text,
  p_nota_path text default null, p_bukti_bayar_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype := public.mkc_connect_department('pengajuan_biaya_villa');
  v_ini text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM');
  v_lalu text := to_char((date_trunc('month', now() at time zone 'Asia/Jakarta') - interval '1 day'), 'YYYY-MM');
  v_nama_biaya text := nullif(trim(coalesce(p_kategori_nama, '')), '');
  v_name text;
  v_id uuid;
begin
  perform public.mkc_hosp_require_role(v_dept.id, array['manager']);
  -- Same rules as villa-api POST /manager/pengajuan.
  if p_kategori is null or p_kategori not in ('laundry', 'netflix', 'lain_lain') then raise exception 'Pilih kategori'; end if;
  if p_kategori = 'lain_lain' and (v_nama_biaya is null or length(v_nama_biaya) < 3) then raise exception 'Tulis nama biayanya (minimal 3 huruf)'; end if;
  if p_jenis is null or p_jenis not in ('permintaan_dana', 'reimburse') then raise exception 'Pilih jenis pengajuan'; end if;
  if p_periode is null or p_periode not in (v_ini, v_lalu) then raise exception 'Bulan biaya hanya boleh bulan ini atau bulan lalu'; end if;
  if p_nominal is null or p_nominal <= 0 or p_nominal > 100000000 then raise exception 'Nominal tidak valid'; end if;
  if length(trim(coalesce(p_keterangan, ''))) not between 3 and 1000 then raise exception 'Tulis keterangan (3-1000 huruf)'; end if;
  if nullif(trim(coalesce(p_penerima_nama, '')), '') is null or nullif(trim(coalesce(p_penerima_bank, '')), '') is null
     or nullif(trim(coalesce(p_penerima_rekening, '')), '') is null then
    raise exception 'Isi rekening tujuan transfer (nama, bank, nomor)';
  end if;
  if p_jenis = 'reimburse' and p_bukti_bayar_path is null then raise exception 'Reimburse wajib melampirkan bukti bayar'; end if;
  if p_nota_path is not null and not public.mkc_biaya_file_ok(p_nota_path) then raise exception 'File nota tidak valid'; end if;
  if p_bukti_bayar_path is not null and not public.mkc_biaya_file_ok(p_bukti_bayar_path) then raise exception 'File bukti bayar tidak valid'; end if;

  select full_name into v_name from public.employees where id = auth.uid();
  insert into public.villa_pengajuan_biaya (
    kategori, kategori_nama, jenis, periode, nominal, keterangan,
    penerima_nama, penerima_bank, penerima_rekening, nota_path, bukti_bayar_path,
    diajukan_lewat, diajukan_oleh_nama, diajukan_oleh_employee
  ) values (
    p_kategori, case when p_kategori = 'lain_lain' then left(v_nama_biaya, 80) end, p_jenis, p_periode, p_nominal, trim(p_keterangan),
    left(trim(p_penerima_nama), 120), left(trim(p_penerima_bank), 60), left(trim(p_penerima_rekening), 40), p_nota_path, p_bukti_bayar_path,
    'chat', coalesce(v_name, 'Manager'), auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.mkc_biaya_cancel(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept public.mkc_chat_departments%rowtype := public.mkc_connect_department('pengajuan_biaya_villa');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.mkc_hosp_require_role(v_dept.id, array['manager']);
  if v_reason is null or length(v_reason) < 3 then raise exception 'Tulis alasan pembatalan'; end if;
  update public.villa_pengajuan_biaya set status = 'dibatalkan', alasan_batal = left(v_reason, 1000)
   where id = p_id and status = 'diajukan';
  if not found then raise exception 'Pengajuan ini sudah diproses Finance, tidak bisa dibatalkan'; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Villa table -> chat
-- ----------------------------------------------------------------------------
create or replace function public.mkc_biaya_to_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept uuid;
  v_group uuid;
  v_kode text := 'PB-' || lpad(new.nomor::text, 4, '0');
  v_biaya text := case new.kategori when 'laundry' then 'Laundry' when 'netflix' then 'Netflix' else coalesce(new.kategori_nama, 'Lain-lain') end;
  v_rp text := 'Rp' || replace(to_char(new.nominal, 'FM999,999,999,999'), ',', '.');
  v_body text;
  v_sender uuid;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  begin
    select d.id into v_dept from public.mkc_chat_departments d where d.code = 'pengajuan_biaya_villa' and d.is_active;
    v_group := public.mkc_hosp_group_id(v_dept);
    if v_group is null then
      return null;
    end if;

    if tg_op = 'INSERT' then
      -- From chat: the manager's own card (pushes to the group like any
      -- message, 0297). From the villa dashboard: a system card.
      if new.diajukan_lewat = 'chat' and exists (select 1 from public.employees where id = new.diajukan_oleh_employee) then
        v_sender := new.diajukan_oleh_employee;
      end if;
      perform public.mkc_chat_post(v_group, 'task',
        format('🧾 %s · %s %s — menunggu Finance%s', v_kode, v_biaya, v_rp,
               case when new.diajukan_lewat = 'dashboard' then format(' (diajukan %s dari dashboard villa)', new.diajukan_oleh_nama) else '' end),
        'biaya', new.id, jsonb_build_object('status', new.status), 'biaya:' || new.id || ':diajukan', v_sender);
      return null;
    end if;

    v_body := case new.status
      when 'disetujui' then format('✅ %s %s %s disetujui Finance (%s), menunggu transfer%s', v_kode, v_biaya, v_rp, new.diputus_oleh_nama,
                                   case when new.catatan_finance is not null then ': ' || new.catatan_finance else '' end)
      when 'ditolak' then format('❌ %s %s %s ditolak Finance (%s): %s', v_kode, v_biaya, v_rp, new.diputus_oleh_nama, new.alasan_tolak)
      when 'ditransfer' then format('💸 %s %s %s sudah ditransfer Finance tanggal %s — bukti transfer ada di kartu', v_kode, v_biaya, v_rp,
                                    to_char(new.tanggal_transfer, 'DD-MM-YYYY'))
      when 'dibatalkan' then format('🚫 %s %s %s dibatalkan: %s', v_kode, v_biaya, v_rp, new.alasan_batal)
      else null
    end;
    if v_body is null then
      return null;
    end if;
    perform public.mkc_chat_post(v_group, 'system', v_body, 'biaya', new.id, jsonb_build_object('status', new.status),
      'biaya:' || new.id || ':' || new.status);
    if new.status in ('disetujui', 'ditolak', 'ditransfer') then
      perform public.mkc_hosp_notify(public.mkc_hosp_members_with_role(v_dept, array['manager']),
        left(format('%s %s', v_kode, case new.status when 'disetujui' then 'disetujui Finance' when 'ditolak' then 'ditolak Finance' else 'sudah ditransfer' end), 200),
        left(v_body, 300), '/chat?c=' || v_group, 'approval_request_decided', jsonb_build_object('pengajuan_id', new.id));
    end if;
  exception when others then
    raise warning 'Loonars Connect pengajuan biaya chat skipped (villa row kept): %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger mkc_biaya_to_chat
  after insert or update of status on public.villa_pengajuan_biaya
  for each row execute function public.mkc_biaya_to_chat();

revoke execute on function public.mkc_biaya_card_json(public.villa_pengajuan_biaya) from public, anon, authenticated;
revoke execute on function public.mkc_biaya_file_path(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.mkc_biaya_file_ok(text) from public, anon, authenticated;
revoke execute on function public.mkc_biaya_to_chat() from public, anon, authenticated;
revoke execute on function public.mkc_biaya_cards(uuid, uuid[]) from public, anon;
revoke execute on function public.mkc_biaya_create(text, text, text, text, bigint, text, text, text, text, text, text) from public, anon;
revoke execute on function public.mkc_biaya_cancel(uuid, text) from public, anon;
grant execute on function public.mkc_biaya_file_path(uuid, uuid, uuid, text) to service_role;
grant execute on function public.mkc_biaya_cards(uuid, uuid[]) to authenticated;
grant execute on function public.mkc_biaya_create(text, text, text, text, bigint, text, text, text, text, text, text) to authenticated;
grant execute on function public.mkc_biaya_cancel(uuid, text) to authenticated;
