-- ============================================================================
-- 0310 — Tutup karyawan cabang Makassar, Jabodetabek, dan Kendari
-- ============================================================================
--
-- Keputusan owner 2026-11-01 ("ya tutup karyawan karyawan itu"), lanjutan dari
-- penguncian proyek non-Loonars di MKH Property (migrasi 0060 di repo
-- mkh-properti): hanya Loonars 1 (hospitality Yogyakarta) dan Loonars 2
-- (Loonars Living) yang aktif.
--
-- Memakai pola nonaktif yang SAMA dengan tombol "Nonaktifkan" di /employees
-- (repositories/employee.repository.ts softDeleteEmployee):
--   deleted_at = now(), employment_status = 'terminated' (+ is_active = false).
-- Akibatnya: tidak bisa login (lib/rbac/session.ts menyaring deleted_at),
-- keluar dari grup chat (trigger mkc_chat_sync_members_on_employees), dan
-- perubahan tercatat oleh trigger audit_log. TIDAK ADA baris yang dihapus;
-- riwayat absensi, gaji, komisi, dan CRM tetap utuh.
--
-- Cakupan: karyawan aktif (deleted_at null) di cabang bernama persis
-- 'Makassar', 'Jabodetabek', 'Kendari'. Head Office, Jogja, dan
-- Loonars Private Living TIDAK disentuh. Pada saat ditulis: 6 + 10 + 1 = 17
-- orang (Jabodetabek sudah berstatus 'inactive').
--
-- Rollback (per karyawan, bila owner mengaktifkan kembali):
--   update public.employees set deleted_at = null, employment_status = 'active',
--          is_active = true where employee_code = '<kode>';
-- ============================================================================

do $$
declare
  v_jumlah int;
begin
  update public.employees e
     set deleted_at = now(),
         employment_status = 'terminated',
         is_active = false
    from public.branches b
   where b.id = e.branch_id
     and b.name in ('Makassar', 'Jabodetabek', 'Kendari')
     and e.deleted_at is null;
  get diagnostics v_jumlah = row_count;
  raise notice '0310: % karyawan dinonaktifkan', v_jumlah;
end;
$$;
