-- ============================================================================
-- MK Connect — 0313: fungsi yang membaca data villa hanya melihat Private Living
--
-- Repo villa (loonarsliving/villa) menjadikan sistem villa multi-properti
-- (owner 2026-11-04): Loonars Private Living (PL) dan Loonars Excellent
-- Living (EL) memakai tabel yang sama (units, bookings, finance_settlements,
-- ...) dengan kolom property_kode (migrasi villa
-- 20261104000001_multi_properti_fondasi). Owner: "jgan sampai menggangu
-- private living yg sedang berjalan".
--
-- Fungsi MK Connect di bawah membaca SEMUA baris tabel itu (bukan per id),
-- jadi begitu kamar/booking EL masuk, modul Hospitality dan kiriman AI CFO ke
-- MKH Property akan ikut menghitung EL. Ketiganya disaring ke
-- property_kode = 'PL':
--   * mkc_hosp_units               -- daftar unit di modul Hospitality
--   * mkc_hosp_report_villa_snapshot -- unit + check-in/out laporan villa
--   * cfo_kirim_snapshot_mkh       -- piutang OTA & kas masuk villa (0308/0311)
--
-- Fungsi lain yang menyentuh units/bookings membaca per id (unit_id,
-- booking_id, voucher) dan tidak ikut diubah.
--
-- Isi fungsi diambil dari definisi yang LIVE (pg_get_functiondef) lalu hanya
-- syarat WHERE yang ditambah; setiap penggantian wajib terjadi tepat sejumlah
-- yang diharapkan, kalau tidak migrasi gagal tanpa mengubah apa pun. Saat
-- ditulis semua baris = 'PL', jadi hasilnya identik.
-- ============================================================================

do $$
declare
  v_def text;
  v_baru text;
  v_jumlah int;
begin
  -- mkc_hosp_units
  select pg_get_functiondef('public.mkc_hosp_units(text)'::regprocedure) into v_def;
  if position('property_kode' in v_def) = 0 then
    v_baru := replace(v_def, 'from public.units u)', 'from public.units u where u.property_kode = ''PL'')');
    v_jumlah := (length(v_baru) - length(v_def)) / length(' where u.property_kode = ''PL''');
    if v_jumlah <> 1 then raise exception 'mkc_hosp_units: % penggantian, harus 1', v_jumlah; end if;
    execute v_baru;
  end if;

  -- mkc_hosp_report_villa_snapshot
  select pg_get_functiondef('public.mkc_hosp_report_villa_snapshot(timestamp with time zone, timestamp with time zone, date)'::regprocedure) into v_def;
  if position('property_kode' in v_def) = 0 then
    v_baru := replace(v_def, 'from public.units u)', 'from public.units u where u.property_kode = ''PL'')');
    if v_baru = v_def then raise exception 'mkc_hosp_report_villa_snapshot: units tidak ditemukan'; end if;
    v_def := v_baru;
    v_baru := regexp_replace(v_def, 'from public\.bookings b\s+where ', 'from public.bookings b where b.property_kode = ''PL'' and ', 'g');
    v_jumlah := (length(v_baru) - length(regexp_replace(v_def, 'from public\.bookings b\s+where ', 'from public.bookings b where ', 'g'))) / length('b.property_kode = ''PL'' and ');
    if v_jumlah <> 3 then raise exception 'mkc_hosp_report_villa_snapshot: % penggantian bookings, harus 3', v_jumlah; end if;
    execute v_baru;
  end if;

  -- cfo_kirim_snapshot_mkh
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cfo_kirim_snapshot_mkh';
  if position('property_kode' in v_def) = 0 then
    v_baru := regexp_replace(v_def, 'from public\.finance_settlements s\s+where ', 'from public.finance_settlements s where s.property_kode = ''PL'' and ', 'g');
    v_jumlah := (length(v_baru) - length(regexp_replace(v_def, 'from public\.finance_settlements s\s+where ', 'from public.finance_settlements s where ', 'g'))) / length('s.property_kode = ''PL'' and ');
    if v_jumlah <> 2 then raise exception 'cfo_kirim_snapshot_mkh: % penggantian, harus 2', v_jumlah; end if;
    execute v_baru;
  end if;
end $$;
