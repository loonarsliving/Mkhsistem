-- Seed for behavior_0294.sql: company-wide Markom/Sales divisions and people in
-- Jogja and Makassar (to prove the branch filter), plus the CRM permissions the
-- crm_add_follow_up stub checks. Run after stubs.sql, before the migrations.
insert into public.branches (code, name) values ('MKS', 'Makassar') on conflict do nothing;
insert into public.divisions (branch_id, code, name) values (null, 'MKT-KOM', 'Marketing & Komunikasi'), (null, 'MKT-SLS', 'Marketing & Sales');
insert into public.roles (key, name) values ('markom', 'Markom'), ('sales', 'Sales'), ('kepala_cabang', 'Kepala Cabang') on conflict do nothing;
insert into public.permissions (key) values ('prospect.follow_up_create'), ('prospect.manage') on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'prospect.follow_up_create' where r.key in ('sales', 'staff', 'kepala_cabang');
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'prospect.manage' where r.key = 'kepala_cabang';

insert into public.employees (id, full_name, branch_id, division_id, role_id)
select v.id::uuid, v.name, (select id from public.branches where code = v.branch),
       (select id from public.divisions where name = v.division and branch_id is null), (select id from public.roles where key = v.role)
from (values
  ('00000000-0000-0000-0000-0000000000a1', 'Owner', 'JOG', null, 'super_admin'),
  ('00000000-0000-0000-0000-0000000000b1', 'Rebecca', 'JOG', null, 'staff'),
  ('00000000-0000-0000-0000-000000000101', 'Alya', 'JOG', 'Marketing & Komunikasi', 'markom'),
  ('00000000-0000-0000-0000-000000000102', 'Syifa', 'JOG', 'Marketing & Komunikasi', 'staff'),
  ('00000000-0000-0000-0000-000000000103', 'Markom Makassar', 'MKS', 'Marketing & Komunikasi', 'markom'),
  ('00000000-0000-0000-0000-000000000201', 'Ayu', 'JOG', 'Marketing & Sales', 'sales'),
  ('00000000-0000-0000-0000-000000000202', 'Fety', 'JOG', 'Marketing & Sales', 'staff'),
  ('00000000-0000-0000-0000-000000000203', 'Sales Makassar', 'MKS', 'Marketing & Sales', 'sales'),
  ('00000000-0000-0000-0000-000000000301', 'Vando', 'JOG', null, 'kepala_cabang')
) as v(id, name, branch, division, role);
-- one Hospitality member so its membership can be checked after 0294
insert into public.employees (id, full_name, branch_id, division_id, role_id)
select '00000000-0000-0000-0000-0000000000c1', 'FO Satu', (select id from public.branches where code = 'LPL'),
       (select id from public.divisions where code = 'LPL-FO'), (select id from public.roles where key = 'staff');
