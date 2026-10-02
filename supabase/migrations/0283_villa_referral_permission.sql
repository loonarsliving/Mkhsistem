-- ============================================================================
-- MK Connect — 0283: Kode referral villa — permission
--
-- Owner 2026-10-02: kode referral karyawan untuk villa Loonars Private
-- Living (diskon tamu 10%, fee karyawan sebesar diskon). Vando (Kepala
-- Cabang Jogja) membuat kode dan mengirimkannya ke karyawan lewat WA dari
-- halaman /villa-referral.
--
-- Hanya permission-nya yang ditambahkan di sini. Kode dan pemakaiannya
-- tinggal di tabel villa (villa_referral_codes / villa_referral_redemptions,
-- migrasi villa 20261002000001) dan hanya dijangkau lewat villa-api
-- /bridge/referral/* dengan VILLA_BRIDGE_SECRET dari server Mkhsistem.
--
-- Diberikan ke super_admin saja di level peran. Kepala Cabang Jogja
-- mendapatkannya lewat pemeriksaan cabang di getCurrentSession() (pola yang
-- sama dengan kos_occupancy.view), karena peran Kepala Cabang dipakai semua
-- cabang.
-- ============================================================================

insert into public.permissions (key, description) values
  ('villa_referral.manage', 'Buat, nonaktifkan, dan kirim (WA) kode referral karyawan untuk villa Loonars Private Living')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin' and p.key = 'villa_referral.manage'
on conflict do nothing;
