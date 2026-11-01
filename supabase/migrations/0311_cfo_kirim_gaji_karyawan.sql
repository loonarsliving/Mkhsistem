-- ============================================================================
-- 0311 — Kirim snapshot gaji karyawan ke AI CFO MKH Property (beban holding)
-- ============================================================================
--
-- Owner (2026-11-02): laporan keuangan HOLDING PT Loonars Mahakarya (nama baru
-- PT MKH) menggabungkan Loonars 1 + Loonars 2, dan gaji tim bersama (Jogja,
-- Head Office, dll.) = BEBAN HOLDING. Gaji hanya tercatat di sini
-- (employee_salary_submissions), jadi migrasi ini menambah jenis
-- 'gaji_karyawan' pada cfo_kirim_snapshot_mkh() (0309).
--
-- Izin minimum: hanya cabang, periode, nominal, status, tanggal transfer.
-- Nama karyawan, nomor rekening, pemilik rekening, dan catatan TIDAK dikirim.
-- HANYA MEMBACA. Pasangan: mkh-properti migrasi 0061 (penerima).
--
-- Rollback: jalankan ulang definisi fungsi dari 0309.
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

  foreach v_jenis in array array['investor_penjualan', 'refund_customer', 'transfer_tertunda', 'ota_settlement', 'pengajuan_biaya_villa',
                                 'villa_kas_masuk', 'villa_kas_keluar', 'proyek_konstruksi', 'gaji_karyawan'] loop
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
    elsif v_jenis = 'proyek_konstruksi' then
      -- Hanya proyek Loonars (mis. Loonars Coffee, dibiayai Loonars 2).
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id::text,
               'diubah_pada', p.updated_at,
               'data', jsonb_build_object(
                 'nama', p.name, 'cabang', b.name, 'status', p.status,
                 'budget_total', p.total_budget, 'budget_material', p.material_procurement_budget,
                 'budget_tenaga', p.labor_contract_budget,
                 'realisasi', coalesce((select jsonb_object_agg(t.request_type, t.jml) from (
                     select r.request_type, sum(r.amount) as jml from public.construction_cost_requests r
                      where r.project_id = p.id and r.status in ('posted', 'paid') group by 1) t), '{}'::jsonb),
                 'komitmen', coalesce((select jsonb_object_agg(t.request_type, t.jml) from (
                     select r.request_type, sum(r.amount) as jml from public.construction_cost_requests r
                      where r.project_id = p.id and r.status in ('approved', 'transferred') group by 1) t), '{}'::jsonb),
                 'utang_belum_lunas', coalesce((select sum(e.amount) from public.construction_expenses e
                      where e.project_id = p.id and e.payment_method = 'utang' and not coalesce(e.is_settled, false)), 0),
                 'utang_lunas', coalesce((select sum(e.amount) from public.construction_expenses e
                      where e.project_id = p.id and e.payment_method = 'utang' and coalesce(e.is_settled, false)), 0),
                 'biaya_terakhir', (select max(r.requested_at)::date from public.construction_cost_requests r where r.project_id = p.id)))
             order by p.created_at), '[]'::jsonb)
        into v_baris
        from public.construction_projects p
        left join public.branches b on b.id = p.branch_id
       where coalesce(b.name, '') ilike 'loonars%' or p.name ilike 'loonars%';
    elsif v_jenis = 'villa_kas_masuk' then
      select coalesce(jsonb_agg(x.baris order by x.tgl), '[]'::jsonb)
        into v_baris
        from (
          select s.received_date as tgl, jsonb_build_object(
                   'id', 'settlement:' || s.id::text,
                   'diubah_pada', s.updated_at,
                   'data', jsonb_build_object('tanggal', s.received_date, 'nominal', s.amount_received,
                                              'jenis', 'settlement_' || coalesce(s.sumber, 'lain'), 'ket', s.sumber)) as baris
            from public.finance_settlements s
           where s.settlement_status = 'RECEIVED' and coalesce(s.amount_received, 0) > 0
             and s.received_date >= current_date - 120
          union all
          select (w.paid_at at time zone 'Asia/Jakarta')::date, jsonb_build_object(
                   'id', 'walkin:' || w.id::text,
                   'diubah_pada', w.paid_at,
                   'data', jsonb_build_object('tanggal', (w.paid_at at time zone 'Asia/Jakarta')::date, 'nominal', w.jumlah,
                                              'jenis', 'walkin', 'ket', w.kategori))
            from public.walkin_payments w
           where w.status = 'lunas' and w.paid_at is not null and coalesce(w.jumlah, 0) > 0
             and w.paid_at >= now() - interval '120 days'
        ) x;
    elsif v_jenis = 'gaji_karyawan' then
      -- 0311: gaji karyawan (slip MK Connect) untuk beban holding. Tanpa nama,
      -- rekening, atau catatan — hanya cabang, periode, nominal, status.
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id::text,
               'diubah_pada', coalesce(s.transferred_at, s.created_at),
               'data', jsonb_build_object('cabang', br.name,
                                          'periode', to_char(make_date(s.period_year, s.period_month, 1), 'YYYY-MM'),
                                          'nominal', s.amount, 'status', s.status,
                                          'ditransfer_pada', (s.transferred_at at time zone 'Asia/Jakarta')::date))
             order by s.period_year, s.period_month, s.created_at), '[]'::jsonb)
        into v_baris
        from public.employee_salary_submissions s
        left join public.branches br on br.id = s.branch_id
       where s.period_year >= 2026 and s.status in ('pending_transfer', 'transferred');
    elsif v_jenis = 'villa_kas_keluar' then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', 'biaya:' || b.id::text,
               'diubah_pada', b.updated_at,
               'data', jsonb_build_object('tanggal', coalesce(b.tanggal_transfer, (b.ditransfer_at at time zone 'Asia/Jakarta')::date),
                                          'nominal', b.nominal, 'jenis', 'biaya_villa', 'ket', coalesce(b.kategori_nama, b.kategori)))
             order by b.tanggal_transfer), '[]'::jsonb)
        into v_baris
        from public.villa_pengajuan_biaya b
       where b.status = 'ditransfer'
         and coalesce(b.tanggal_transfer, (b.ditransfer_at at time zone 'Asia/Jakarta')::date) >= current_date - 120;
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
