-- ============================================================================
-- 0316 — Tutup cabang Makassar (gaji dikonfirmasi lunas oleh owner)
-- ============================================================================
--
-- Keputusan owner 2026-11-14: "Cabang makassar sy minta tutup, gaji sdh
-- terbayar smua tutup cabang itu". Lanjutan 0310 (karyawan Makassar sudah
-- dinonaktifkan 2026-11-01) dan mkh-properti 0060 (proyek IH dikunci).
--
-- 1. Slip gaji Makassar yang masih 'pending_transfer' (11 slip, Agu–Okt 2026,
--    saat ditulis Rp 105.528.400) ditandai 'transferred' karena owner
--    menyatakan semuanya sudah dibayar (di luar tombol transfer sistem).
--    transferred_by dibiarkan kosong; catatan ditambahkan ke `note` supaya
--    jelas ini konfirmasi owner, bukan bukti transfer. Tanpa notifikasi WA
--    (tidak ada trigger di tabel ini; jalur aplikasi yang mengirim WA tidak
--    dipanggil). Akibatnya slip ini juga tidak lagi dicocokkan dengan foto
--    bukti transfer baru, dan utang gaji Makassar hilang dari MKH Property.
-- 2. Cabang Makassar: is_active = false (baris dan riwayatnya tetap ada).
--
-- Rollback: update public.branches set is_active = true where code = 'MKS';
--   slip: status kembali 'pending_transfer' untuk baris yang note-nya memuat
--   '[owner 2026-11-14]'.
-- ============================================================================

do $$
declare
  v_cabang uuid;
  v_slip int;
begin
  select id into v_cabang from public.branches where code = 'MKS' and name = 'Makassar';
  if v_cabang is null then
    raise notice '0316: cabang Makassar tidak ditemukan — tidak ada perubahan';
    return;
  end if;

  update public.employee_salary_submissions
     set status = 'transferred',
         transferred_at = coalesce(transferred_at, now()),
         note = trim(both ' ' from coalesce(note, '') ||
                ' [owner 2026-11-14] Dikonfirmasi lunas oleh owner saat cabang Makassar ditutup; bukan dari bukti transfer sistem.')
   where branch_id = v_cabang
     and status = 'pending_transfer';
  get diagnostics v_slip = row_count;

  update public.branches set is_active = false where id = v_cabang and is_active;

  raise notice '0316: % slip Makassar ditandai lunas, cabang dinonaktifkan', v_slip;
end $$;
