-- ============================================================================
-- 0308 — Kirim snapshot keuangan (hanya baca) ke AI CFO MKH Property
-- ============================================================================
--
-- AI CFO di MKH Property (mkh-properti, project gluoioiimapyhchdasfl,
-- migrasi 0057) memusatkan keuangan Loonars 1 + Loonars 2. Sebagian data
-- sumbernya ada di database ini (project bersama MK Connect + villa):
--
--   investor_penjualan     loonars_unit_purchases (proyek LNR2 / Loonars 2)
--   refund_customer        mkc_refund_customers + mkc_refund_installments
--   transfer_tertunda      finance_pending_transfers (belum dikonfirmasi/ditolak)
--   ota_settlement         finance_settlements (villa, belum RECEIVED)
--   pengajuan_biaya_villa  villa_pengajuan_biaya (diajukan/disetujui)
--
-- Fungsi ini HANYA MEMBACA tabel-tabel di atas lalu mengirim salinannya ke
-- RPC public.cfo_sumber_terima di MKH Property lewat pg_net — jalur dan
-- autentikasi SAMA dengan sync_dispatch_pending yang sudah berjalan:
--   URL + anon key   : sync_config ('peer_sync_url', 'peer_anon_key')
--   header x-sync-secret : Vault 'mk_sync_shared_secret' (sudah ada di kedua
--                      database; tidak ada rahasia baru)
--
-- Prinsip:
--   - Tidak ada tabel/kolom baru, tidak ada tabel yang diubah, tidak ada DELETE.
--   - Izin minimum: NIK, telepon, alamat pembeli, nomor rekening bank refund,
--     dan rekening tujuan transfer TIDAK dikirim.
--   - Penerima mendeduplikasi lewat (sumber, jenis, source_id) + hash isi;
--     p_lengkap = true → baris yang sudah tidak ada di sini ditandai nonaktif
--     di MKH Property (tidak dihapus).
--   - Gagal kirim tidak memengaruhi apa pun di database ini (fire-and-forget,
--     sama dengan dispatcher sync); kesegaran terlihat di halaman
--     /cfo/sinkronisasi MKH Property.
--
-- Rollback: select cron.unschedule('cfo-kirim-snapshot-mkh');
-- ============================================================================

create or replace function public.cfo_kirim_snapshot_mkh()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_secret text;
  v_url text;
  v_anon text;
  v_hdr jsonb;
  v_jenis text;
  v_baris jsonb;
  v_terkirim jsonb := '{}'::jsonb;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'mk_sync_shared_secret';
  select regexp_replace(value::text, '^"|"$', '', 'g') into v_url from public.sync_config where key = 'peer_sync_url';
  select regexp_replace(value::text, '^"|"$', '', 'g') into v_anon from public.sync_config where key = 'peer_anon_key';
  if v_secret is null or v_url is null or v_anon is null then
    return jsonb_build_object('status', 'konfigurasi_tidak_lengkap');
  end if;
  v_url := regexp_replace(v_url, '/rpc/[a-z_]+$', '/rpc/cfo_sumber_terima');
  v_hdr := jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', v_anon,
    'Authorization', 'Bearer ' || v_anon,
    'x-sync-secret', v_secret
  );

  foreach v_jenis in array array['investor_penjualan', 'refund_customer', 'transfer_tertunda', 'ota_settlement', 'pengajuan_biaya_villa'] loop
    if v_jenis = 'investor_penjualan' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', lup.id::text,
               'diubah_pada', lup.updated_at,
               'data', jsonb_build_object(
                 'proyek', p.kode, 'blok', u.blok, 'tipe', u.tipe, 'pembeli', lup.buyer_name,
                 'harga', lup.price, 'booking_fee', coalesce(lup.booking_fee, 0), 'dp', coalesce(lup.dp_amount, 0),
                 'pelunasan', coalesce(lup.pelunasan_amount, 0), 'jenis_transaksi', lup.transaction_type,
                 'metode', lup.payment_method, 'status', lup.status, 'tanggal', lup.transaction_date,
                 'tanggal_serah_terima_siteplan', lup.handover_date, 'diverifikasi_pada', lup.verified_at))
             order by lup.created_at), '[]'::jsonb)
        into v_baris
        from public.loonars_unit_purchases lup
        join public.loonars_units u on u.id = lup.unit_id
        join public.loonars_projects p on p.id = u.project_id
       where p.kode = 'LNR2';
    elsif v_jenis = 'refund_customer' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id::text,
               'diubah_pada', c.updated_at,
               'data', jsonb_build_object(
                 'nama', c.customer_name, 'total', c.refund_amount, 'dibayar_awal', coalesce(c.opening_paid_amount, 0),
                 'cicilan', coalesce((
                   select jsonb_agg(jsonb_build_object('bulan', i.due_month, 'nominal', i.amount, 'lunas', i.is_paid) order by i.due_month)
                     from public.mkc_refund_installments i where i.customer_id = c.id), '[]'::jsonb)))
             order by c.sort_order, c.created_at), '[]'::jsonb)
        into v_baris
        from public.mkc_refund_customers c
       where c.deleted_at is null;
    elsif v_jenis = 'transfer_tertunda' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id::text,
               'diubah_pada', t.created_at,
               'data', jsonb_build_object('proyek', t.proyek, 'tipe', t.tipe, 'pihak', t.party_name,
                                          'nominal', t.nominal, 'dibuat_pada', t.created_at))
             order by t.created_at), '[]'::jsonb)
        into v_baris
        from public.finance_pending_transfers t
       where t.confirmed_at is null and t.rejected_at is null;
    elsif v_jenis = 'ota_settlement' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id::text,
               'diubah_pada', s.updated_at,
               'data', jsonb_build_object('sumber', s.sumber, 'nominal', s.amount, 'tanggal_estimasi', s.expected_settlement_date,
                                          'status', s.settlement_status, 'keyakinan', s.settlement_confidence))
             order by s.expected_settlement_date), '[]'::jsonb)
        into v_baris
        from public.finance_settlements s
       where s.settlement_status <> 'RECEIVED';
    else
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', b.id::text,
               'diubah_pada', b.updated_at,
               'data', jsonb_build_object('kategori', coalesce(b.kategori_nama, b.kategori), 'nominal', b.nominal,
                                          'status', b.status, 'periode', b.periode, 'dibuat_pada', b.created_at))
             order by b.created_at), '[]'::jsonb)
        into v_baris
        from public.villa_pengajuan_biaya b
       where b.status in ('diajukan', 'disetujui');
    end if;

    perform net.http_post(
      url := v_url,
      headers := v_hdr,
      body := jsonb_build_object('p_jenis', v_jenis, 'p_baris', v_baris, 'p_lengkap', true),
      timeout_milliseconds := 20000
    );
    v_terkirim := v_terkirim || jsonb_build_object(v_jenis, jsonb_array_length(v_baris));
  end loop;

  return jsonb_build_object('status', 'dikirim', 'baris', v_terkirim);
end;
$$;

revoke execute on function public.cfo_kirim_snapshot_mkh() from public, anon, authenticated;

-- Tiap 30 menit (menit 11 & 41, menghindari menit :00 yang padat).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('cfo-kirim-snapshot-mkh', '11,41 * * * *', $c$select public.cfo_kirim_snapshot_mkh()$c$);
  end if;
end;
$$;
