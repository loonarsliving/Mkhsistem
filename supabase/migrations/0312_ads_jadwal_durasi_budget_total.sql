-- ============================================================================
-- MK Connect — 0312: Iklan dengan durasi tetap + total budget
--
-- Permintaan owner (2026-11-03): "bisakah ada settingan untuk iklan berjalan
-- sebulan dengan budget yang kita tentukan" → "Keduanya (Ads Specialist +
-- Loonars AI Occupancy Ads), bisa dipilih 7 / 14 / 30 hari".
--
-- Saat meluncurkan, manusia boleh memilih durasi 7/14/30 hari + total
-- budget. Budget harian dihitung di kode (lib/ads/campaign-schedule.ts:
-- total ÷ hari, dibulatkan ke bawah), lalu tetap di-clamp ke pengaman yang
-- sudah ada (META_ADS_DAILY_BUDGET_CAP_IDR untuk Ads Specialist; plafon
-- harian + mingguan per properti untuk Occupancy Ads). Ad set di Meta
-- dikirim dengan end_time = ends_at, jadi Meta sendiri yang berhenti
-- menayangkan -- total belanja tidak bisa melewati daily × hari.
--
-- Semua kolom nullable: NULL = perilaku lama (iklan terus berjalan sampai
-- dijeda/dihapus manual), jadi setiap baris lama dan peluncuran otomatis AI
-- (ai_job_queue "meta_ads_launch") tidak berubah sama sekali.
--
-- Cron refresh-ad-campaign-spend (0140) menandai baris yang ends_at-nya
-- sudah lewat sebagai 'ended' (meta_ad_campaigns) / 'completed'
-- (loonars_occupancy_campaigns). 'ended' juga membuat AI dispatch (0253)
-- tidak meluncurkan iklan baru untuk project itu secara otomatis.
--
-- CATATAN: loonars_occupancy_campaigns.duration_days SUDAH ADA sejak 0269
-- (integer not null > 0, durasi saran AI dari brief, maks 60). "add column
-- if not exists" di bawah melewatinya -- kolom itu dipakai ulang apa
-- adanya: peluncuran berjadwal menimpanya dengan 7/14/30 yang dipilih, dan
-- yang menandai "berjadwal" hanya ends_at (bukan duration_days). Check
-- (7, 14, 30) di bawah hanya berlaku untuk meta_ad_campaigns.
--
-- Hanya menambah kolom pada tabel yang sudah ada -- RLS tabel yang sama
-- sudah berlaku, tidak ada policy baru yang diperlukan.
-- ============================================================================

alter table public.meta_ad_campaigns
  add column if not exists duration_days smallint check (duration_days in (7, 14, 30)),
  add column if not exists total_budget_idr integer check (total_budget_idr >= 0),
  add column if not exists ends_at timestamptz;

alter table public.loonars_occupancy_campaigns
  add column if not exists duration_days smallint check (duration_days in (7, 14, 30)),
  add column if not exists total_budget_idr integer check (total_budget_idr >= 0),
  add column if not exists ends_at timestamptz;

create index if not exists meta_ad_campaigns_ends_at_idx
  on public.meta_ad_campaigns (ends_at) where ends_at is not null and status in ('active', 'paused');

create index if not exists loonars_occupancy_campaigns_ends_at_idx
  on public.loonars_occupancy_campaigns (ends_at) where ends_at is not null and status in ('active', 'paused');
