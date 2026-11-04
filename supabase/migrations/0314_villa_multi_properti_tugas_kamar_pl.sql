-- ============================================================================
-- MK Connect — 0314: tugas kebersihan Hospitality hanya untuk unit Private Living
--
-- Lanjutan 0313 (sistem villa multi-properti, owner 2026-11-04). Trigger
-- mkc_hosp_sync_on_unit_dirty memanggil mkc_hosp_sync_room_tasks setiap unit
-- villa berubah jadi 'dirty'; langkah 1 fungsi itu membuat tugas + pesan ke
-- grup Hospitality Loonars untuk SETIAP unit kotor. Kamar Excellent Living
-- (property_kode 'EL') tidak boleh ikut masuk ke grup/tim kebersihan PL.
--
-- Hanya langkah 1 yang disaring (u.property_kode = 'PL'); langkah lain
-- bekerja per tugas yang sudah ada. Pola sama dengan 0313: definisi live +
-- penggantian yang jumlahnya diperiksa. Saat ditulis semua unit = 'PL'.
-- ============================================================================

do $$
declare
  v_def text;
  v_baru text;
begin
  select pg_get_functiondef('public.mkc_hosp_sync_room_tasks()'::regprocedure) into v_def;
  if position('property_kode' in v_def) = 0 then
    v_baru := replace(v_def,
      'where h.status = ''pending'' and h.jenis = ''bersih'' and h.tgl <= v_today and u.status = ''dirty''',
      'where h.status = ''pending'' and h.jenis = ''bersih'' and h.tgl <= v_today and u.status = ''dirty'' and u.property_kode = ''PL''');
    if v_baru = v_def then raise exception 'mkc_hosp_sync_room_tasks: klausa langkah 1 tidak ditemukan'; end if;
    execute v_baru;
  end if;
end $$;
