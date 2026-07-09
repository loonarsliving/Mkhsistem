-- ============================================================================
-- MK Connect — Seed: branches, divisions, positions, work schedules, settings
-- ============================================================================

insert into public.branches (code, name, city, address, latitude, longitude, radius_meters, is_head_office) values
  ('HO', 'Head Office', 'Kendari', 'Jl. Ahmad Yani, Kendari, Sulawesi Tenggara', -3.9778, 122.5194, 150, true),
  ('JOG', 'Jogja', 'Yogyakarta', 'Jl. Malioboro, Yogyakarta', -7.7956, 110.3695, 100, false),
  ('MKS', 'Makassar', 'Makassar', 'Jl. Sudirman, Makassar, Sulawesi Selatan', -5.1477, 119.4327, 100, false),
  ('KDI', 'Kendari', 'Kendari', 'Jl. MT Haryono, Kendari, Sulawesi Tenggara', -3.9985, 122.5127, 100, false),
  ('CBR', 'Cibarusah', 'Bekasi', 'Jl. Raya Cibarusah, Bekasi, Jawa Barat', -6.3389, 107.0653, 100, false)
on conflict (code) do nothing;

insert into public.divisions (name, code, description) values
  ('Direksi', 'DIR', 'Direksi perusahaan'),
  ('Human Resources', 'HRD', 'Human resources & general affairs'),
  ('Finance & Accounting', 'FIN', 'Finance and accounting'),
  ('Operasional', 'OPS', 'Operasional cabang'),
  ('Marketing & Sales', 'MKT', 'Marketing and sales'),
  ('Information Technology', 'IT', 'Information technology'),
  ('Produksi', 'PRD', 'Produksi')
on conflict (branch_id, name) do nothing;

insert into public.positions (name, code, level, description) values
  ('Direktur Utama', 'DIRUT', 1, 'Pimpinan tertinggi perusahaan'),
  ('Direktur Operasional', 'DIROPS', 2, 'Pimpinan operasional perusahaan'),
  ('Kepala Cabang', 'KACAB', 10, 'Kepala cabang'),
  ('Manager', 'MGR', 20, 'Manajer divisi'),
  ('Supervisor', 'SPV', 30, 'Supervisor tim'),
  ('Staff', 'STF', 100, 'Staff pelaksana')
on conflict (name) do nothing;

insert into public.work_schedules (branch_id, name, start_time, end_time, late_tolerance_minutes, work_days, is_default)
select null, 'Jam Kerja Standar', '08:00', '17:00', 15, '{1,2,3,4,5}', true
where not exists (select 1 from public.work_schedules where branch_id is null and is_default);

insert into public.company_settings (id, company_name, timezone, default_radius_meters)
values ('00000000-0000-0000-0000-000000000001', 'PT Maha Karya Haluoleo', 'Asia/Makassar', 100)
on conflict (id) do nothing;
