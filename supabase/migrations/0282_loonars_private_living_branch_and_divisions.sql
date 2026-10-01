-- ============================================================================
-- 0282 — Loonars Private Living: employee category for self-registration
--
-- Owner request: employees who run the villa hospitality side (Front Office,
-- Security, Head of Loonars Villa) must be able to fill the /register form.
-- Modelled the same way 0256 modelled "Loonars Coffee": a dedicated branch,
-- plus branch-scoped divisions (divisions.branch_id already exists — no
-- schema change). Data-only, idempotent, safe to re-run.
--
-- The registration form (features/registration) lists this branch and, once
-- it is picked, shows only these three divisions instead of the company-wide
-- ones. New registrants still land as role "pending" until approved.
-- ============================================================================

insert into public.branches (code, name, city, is_head_office, is_active)
select 'LPL', 'Loonars Private Living', 'Yogyakarta', false, true
where not exists (select 1 from public.branches where code = 'LPL');

insert into public.divisions (branch_id, code, name, description, is_active)
select b.id, v.code, v.name, v.description, true
from public.branches b
cross join (values
  ('LPL-FO',   'Front Office',        'Front Office villa Loonars Private Living'),
  ('LPL-SEC',  'Security',            'Keamanan villa Loonars Private Living'),
  ('LPL-HEAD', 'Head of Loonars Villa', 'Pimpinan operasional villa Loonars Private Living')
) as v(code, name, description)
where b.code = 'LPL'
on conflict (branch_id, name) do nothing;
