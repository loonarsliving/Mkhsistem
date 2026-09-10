-- ============================================================================
-- MK Connect — 0256: Loonars Coffee (Yogyakarta) construction pilot
--
-- First real project on top of the existing Construction Management module
-- (cm_* tables, Phases 1-8, already live and in production use for Kendari/
-- Loonars Living). Deliberately does NOT create a second RAB/BOQ/WBS/labor
-- engine -- reuses cm_project_boq, cm_project_wbs, cm_labor_contracts,
-- cm_purchase_requests, construction_submit_expense exactly as they already
-- work for every other branch.
--
-- What's genuinely new here:
--   1. A new branch + construction_projects row for Loonars Coffee, scoped
--      like any other branch's project.
--   2. RAB VERSIONING (cm_project_boq_versions) -- cm_project_boq itself had
--      no version concept; every branch's BOQ benefits from this, not just
--      Loonars Coffee.
--   3. cost_code / planned_start / planned_finish / engineering_status
--      columns on cm_project_boq -- the RAB spec (category/cost code/
--      planned dates/BUDGET ASSUMPTION labeling) needs fields that didn't
--      exist yet. Additive, nullable -- no existing row/query breaks.
--   4. cm_labor_weekly_schedule -- a PLANNING table (target week-by-week
--      progress/payment), separate from the existing earned-value payment
--      engine (cm_generate_labor_payment/cm_approve_labor_payment), which
--      remains the only thing that actually moves money. This table never
--      posts an expense on its own.
--   5. construction_cost_requests -- the WhatsApp-submitted
--      draft/approved/transferred/paid/posted workflow Vando's purchase and
--      payment requests go through BEFORE they become a real
--      construction_expenses/cm_labor_payments row. On posting, it calls
--      the EXISTING construction_submit_expense/cm RPCs -- one source of
--      truth for the actual ledger, this table is the request/approval
--      layer in front of it, not a parallel ledger.
--
-- Three distinct, owner-provided budgeting layers, never mixed/summed
-- into each other:
--   - ORIGINAL TENDER RAB (Rp83,501,750) — the real 58-item "Loonars
--     Coffee Tender Final" spreadsheet, seeded verbatim as cm_project_boq
--     v1 below, quirks and all (a stated-amount/qty*price mismatch, a
--     placeholder rebar quantity, Rp0 unpriced lines) — never silently
--     corrected.
--   - MATERIAL PROCUREMENT BUDGET (Rp58,387,454) and LABOR/BORONGAN
--     CONTRACT (Rp75,000,000) — a later calculation, stored directly on
--     construction_projects (material_procurement_budget/
--     labor_contract_budget) and as the real cm_labor_contracts.contract_value.
--   - PROJECT CONTROL BASELINE (Rp133,387,454 = the two above added) —
--     construction_projects.total_budget, the actual figure spend is
--     tracked against going forward.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Branch + project
-- ----------------------------------------------------------------------------
insert into public.branches (code, name, city, is_head_office, is_active, mkh_project_code)
select 'LNC', 'Loonars Coffee', 'Yogyakarta', false, true, 'LL'
where not exists (select 1 from public.branches where code = 'LNC');
-- mkh_project_code = 'LL': per owner's decision, Loonars Coffee's money is
-- part of Loonars Jogja's own books in mkh-properti (project code LL,
-- "Loonars Living"), NOT a separate mkh_projects entity — see
-- construction_project_financial_records in mkh-properti, which is the
-- dedicated table that keeps Coffee's spend distinguishable from Living's
-- villa spend within those same books (section 8/29 of the brief).

alter table public.construction_projects add column if not exists engineering_status text
  not null default 'APPROVED'
  check (engineering_status in ('PROVISIONAL', 'ENGINEER_REVIEW', 'APPROVED'));
comment on column public.construction_projects.engineering_status is
  'PROVISIONAL/ENGINEER_REVIEW/APPROVED — whether the project''s structural drawing/quantities are still preliminary. Existing projects default to APPROVED (unaffected); Loonars Coffee is seeded as PROVISIONAL below per its working drawing''s own disclaimer.';

-- Owner's explicit instruction: the ORIGINAL TENDER RAB subtotal
-- (Rp83,501,750, itemized in cm_project_boq v1 below), the MATERIAL
-- PROCUREMENT BUDGET envelope (Rp58,387,454), and the LABOR/BORONGAN
-- CONTRACT (Rp75,000,000, cm_labor_contracts) are three DIFFERENT
-- budgeting layers that must never be silently summed together (e.g.
-- tender RAB + labor contract). total_budget stays the authoritative
-- PROJECT CONTROL BASELINE (material envelope + labor contract, matching
-- the owner-approved Rp133,387,454) — these two new columns record that
-- split explicitly rather than forcing it to be re-derived from BOQ lines,
-- which track the original tender data instead.
alter table public.construction_projects add column if not exists material_procurement_budget numeric(16, 2);
alter table public.construction_projects add column if not exists labor_contract_budget numeric(16, 2);
comment on column public.construction_projects.material_procurement_budget is
  'Material procurement budget ENVELOPE (a later calculation, distinct from the original tender RAB subtotal in cm_project_boq v1) — the control figure actual material purchases are tracked against.';
comment on column public.construction_projects.labor_contract_budget is
  'Labor/borongan contract control figure — should equal the active cm_labor_contracts.contract_value for this project.';

do $$
declare
  v_branch_id uuid;
  v_project_id uuid;
begin
  select id into v_branch_id from public.branches where code = 'LNC';

  if not exists (select 1 from public.construction_projects where branch_id = v_branch_id) then
    insert into public.construction_projects (branch_id, name, total_budget, status, engineering_status, material_procurement_budget, labor_contract_budget)
    values (v_branch_id, 'Loonars Coffee — Yogyakarta (8.5m x 6m, 51m²)', 133387454, 'active', 'PROVISIONAL', 58387454, 75000000)
    returning id into v_project_id;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. RAB fields + versioning
-- ----------------------------------------------------------------------------
alter table public.cm_project_boq add column if not exists cost_code text;
alter table public.cm_project_boq add column if not exists planned_start date;
alter table public.cm_project_boq add column if not exists planned_finish date;
alter table public.cm_project_boq add column if not exists engineering_status text
  not null default 'APPROVED'
  check (engineering_status in ('PROVISIONAL', 'ENGINEER_REVIEW', 'APPROVED'));
-- Preserves the ORIGINAL tender/spreadsheet category label (e.g. "TANAH &
-- PONDASI") separately from `category`, which stays constrained to the
-- 4-value material/labor/equipment/other cost-type enum every other cm_*
-- rollup already relies on.
alter table public.cm_project_boq add column if not exists category_label text;
-- Some original RAB lines carry a stated Amount that doesn't equal
-- quantity x unit_price (a real spreadsheet artifact — never silently
-- "corrected"). When set, this is the OFFICIAL recorded amount for the
-- line; quantity/unit_price stay exactly as originally written for audit.
alter table public.cm_project_boq add column if not exists amount_override numeric(16, 2);
-- Free-text data-quality flag carried over from the original RAB, e.g.
-- 'CALCULATION_MISMATCH', 'QUANTITY_PLACEHOLDER', 'UNPRICED' — surfaced to
-- the owner, never used to silently hide/alter a line.
alter table public.cm_project_boq add column if not exists review_flag text;
create index if not exists cm_project_boq_cost_code_idx on public.cm_project_boq (project_id, cost_code);

create table if not exists public.cm_project_boq_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  version_no int not null,
  label text,
  is_current boolean not null default true,
  material_budget_snapshot numeric(16, 2),
  labor_budget_snapshot numeric(16, 2),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  unique (project_id, version_no)
);
alter table public.cm_project_boq add column if not exists version_id uuid references public.cm_project_boq_versions(id);

alter table public.cm_project_boq_versions enable row level security;
create policy cm_project_boq_versions_select on public.cm_project_boq_versions for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (select 1 from public.construction_projects p join public.employees e on e.branch_id = p.branch_id where p.id = cm_project_boq_versions.project_id and e.id = auth.uid())
);

-- cm_new_boq_version(): snapshots the current BOQ as an immutable version
-- (marks the prior one non-current), then clones every line forward as the
-- new editable version — any future revision goes through this, never a
-- silent edit of a past version's numbers.
create or replace function public.cm_new_boq_version(p_project_id uuid, p_label text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_version int;
  v_new_version_id uuid;
  v_material numeric;
  v_labor numeric;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if not exists (select 1 from public.construction_projects where id = p_project_id) then
    raise exception 'Proyek tidak ditemukan';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_next_version from public.cm_project_boq_versions where project_id = p_project_id;

  select coalesce(sum(coalesce(amount_override, budget)) filter (where category in ('material', 'equipment', 'other')), 0),
         coalesce(sum(coalesce(amount_override, budget)) filter (where category = 'labor'), 0)
  into v_material, v_labor
  from public.cm_project_boq
  where project_id = p_project_id and unit_id is null and version_id in (
    select id from public.cm_project_boq_versions where project_id = p_project_id and is_current = true
  );

  update public.cm_project_boq_versions set is_current = false where project_id = p_project_id and is_current = true;

  insert into public.cm_project_boq_versions (project_id, version_no, label, is_current, material_budget_snapshot, labor_budget_snapshot, created_by)
  values (p_project_id, v_next_version, p_label, true, v_material, v_labor, auth.uid())
  returning id into v_new_version_id;

  -- v1 has no prior version to clone from (seeded directly below).
  if v_next_version > 1 then
    insert into public.cm_project_boq (
      project_id, unit_id, project_wbs_id, category, material_id, description, quantity, unit, unit_price,
      cost_code, planned_start, planned_finish, engineering_status, category_label, amount_override, review_flag, sort_order, version_id
    )
    select project_id, unit_id, project_wbs_id, category, material_id, description, quantity, unit, unit_price,
           cost_code, planned_start, planned_finish, engineering_status, category_label, amount_override, review_flag, sort_order, v_new_version_id
    from public.cm_project_boq
    where project_id = p_project_id and version_id = (
      select id from public.cm_project_boq_versions where project_id = p_project_id and version_no = v_next_version - 1
    );
  end if;

  return v_new_version_id;
end;
$$;

-- cm_boq_summary(): pre-existing (0210), fixed here to (a) use
-- coalesce(amount_override, budget) so a preserved spreadsheet mismatch
-- doesn't distort the rollup, and (b) only sum a project's CURRENT BOQ
-- version once RAB versioning is in use (see cm_new_boq_version) --
-- otherwise a project with 2+ versions would double-count every past
-- revision. A project with no versions (version_id null throughout, every
-- existing project before this migration) is completely unaffected: the
-- `version_id is null` branch keeps behaving exactly as before.
create or replace function public.cm_boq_summary(p_project_id uuid)
returns table(category text, total_budget numeric)
language sql
stable
security definer
set search_path = public
as $$
  select category, coalesce(sum(coalesce(amount_override, budget)), 0) as total_budget
  from public.cm_project_boq
  where project_id = p_project_id and unit_id is null
    and (
      version_id is null
      or version_id in (select id from public.cm_project_boq_versions where project_id = p_project_id and is_current = true)
    )
  group by category;
$$;

-- ----------------------------------------------------------------------------
-- 3. Loonars Coffee RAB v1 seed — ORIGINAL TENDER RAB (58 items, from the
--    real "Loonars Coffee Tender Final" spreadsheet, subtotal
--    Rp83,501,750). This is historical/reference data, stored EXACTLY as
--    given — including its own quirks, never silently corrected:
--      - item 3 (RAB-003): stated Amount (Rp4,500,000) doesn't equal
--        quantity x unit_price (51 x Rp25,000 = Rp1,275,000) in the
--        original spreadsheet. amount_override preserves the ORIGINAL
--        amount; quantity/unit_price stay exactly as written.
--      - item 13 (RAB-013): quantity = 1 kg is a clear placeholder.
--        Preserved as-is, flagged for engineering/quantity review.
--      - item 19 (RAB-019): UNP truss quantity = 25.5 m is the ORIGINAL
--        RAB value. A later engineering/procurement revision (different
--        truss-line/chord/web breakdown) must be a NEW BOQ version
--        (cm_new_boq_version), never an edit of this row.
--      - Rp0 items are NOT "not required" — they're UNPRICED/NOT YET
--        BUDGETED in the original tender and stay visible as such.
--
--    This Rp83,501,750 tender subtotal is DELIBERATELY NOT the same
--    figure as material_procurement_budget (Rp58,387,454) or
--    labor_contract_budget (Rp75,000,000) set on construction_projects
--    above — three distinct budgeting layers per the owner's explicit
--    instruction, never added together.
-- ----------------------------------------------------------------------------
do $$
declare
  v_project_id uuid;
  v_version_id uuid;
begin
  select id into v_project_id from public.construction_projects
  where branch_id = (select id from public.branches where code = 'LNC') limit 1;

  if v_project_id is null then
    raise exception 'Loonars Coffee project not found — run step 1 first';
  end if;
  if exists (select 1 from public.cm_project_boq_versions where project_id = v_project_id) then
    return; -- already seeded (re-run safety)
  end if;

  insert into public.cm_project_boq_versions (project_id, version_no, label, is_current, material_budget_snapshot, labor_budget_snapshot)
  values (v_project_id, 1, 'Original Tender Final (RAB/BOQ Tender) — Rp83,501,750 subtotal, historical baseline', true, 83501750, null)
  returning id into v_version_id;

  insert into public.cm_project_boq (
    project_id, version_id, category, category_label, cost_code, description, quantity, unit, unit_price,
    amount_override, review_flag, engineering_status, sort_order
  ) values
    (v_project_id, v_version_id, 'other', 'PERSIAPAN', 'RAB-001', 'Mobilisasi & demobilisasi', 1, 'ls', 7500000, null, null, 'PROVISIONAL', 1),
    (v_project_id, v_version_id, 'other', 'PERSIAPAN', 'RAB-002', 'Pengukuran / setting out bangunan 8,5 x 6 m', 1, 'ls', 4500000, null, null, 'PROVISIONAL', 2),
    (v_project_id, v_version_id, 'other', 'PERSIAPAN', 'RAB-003', 'Pembersihan area kerja', 51, 'm2', 25000, 4500000, 'CALCULATION_MISMATCH / NEEDS_REVIEW — original spreadsheet amount (Rp4,500,000) does not equal 51 x Rp25,000 (Rp1,275,000); original amount preserved, not recalculated', 'PROVISIONAL', 3),

    (v_project_id, v_version_id, 'other', 'TANAH & PONDASI', 'RAB-004', 'Galian pondasi batu kali', 5.23, 'm3', 75000, null, null, 'PROVISIONAL', 4),
    (v_project_id, v_version_id, 'other', 'TANAH & PONDASI', 'RAB-005', 'Urugan pasir bawah pondasi', 5, 'm3', 75000, null, null, 'PROVISIONAL', 5),
    (v_project_id, v_version_id, 'other', 'TANAH & PONDASI', 'RAB-006', 'Pondasi batu kali tinggi ±50 cm', 5.08, 'm3', 275000, null, null, 'PROVISIONAL', 6),
    (v_project_id, v_version_id, 'other', 'TANAH & PONDASI', 'RAB-007', 'Urugan kembali & pemadatan', 3, 'm3', 125000, null, null, 'PROVISIONAL', 7),

    (v_project_id, v_version_id, 'other', 'BETON', 'RAB-008', 'Footing/cakar ayam 6 titik', 6, 'titik', 350000, null, null, 'PROVISIONAL', 8),
    (v_project_id, v_version_id, 'other', 'BETON', 'RAB-009', 'Pedestal beton tinggi ±1 m, 6 titik', 6, 'titik', 250000, null, null, 'PROVISIONAL', 9),
    (v_project_id, v_version_id, 'other', 'BETON', 'RAB-010', 'Balok/sloof beton bila ditetapkan engineer', 29, 'm', 75000, null, null, 'ENGINEER_REVIEW', 10),
    (v_project_id, v_version_id, 'other', 'BETON', 'RAB-011', 'Plat lantai beton area bangunan', 51, 'm2', 65000, null, null, 'PROVISIONAL', 11),
    (v_project_id, v_version_id, 'other', 'BETON', 'RAB-012', 'Bekisting beton', 20, 'm2', 55000, null, null, 'PROVISIONAL', 12),
    (v_project_id, v_version_id, 'other', 'BETON', 'RAB-013', 'Pembesian footing/pedestal/plat', 1, 'kg', 2500, null, 'QUANTITY_PLACEHOLDER / NEEDS_ENGINEERING_REVIEW — 1 kg is clearly a placeholder in the original tender, preserved as-is', 'ENGINEER_REVIEW', 13),

    (v_project_id, v_version_id, 'other', 'LANTAI', 'RAB-014', 'Trowel finish seluruh lantai', 51, 'm2', 125000, null, null, 'PROVISIONAL', 14),

    (v_project_id, v_version_id, 'material', 'BAJA STRUKTUR', 'RAB-015', 'Kolom IWF 150, tinggi ±3 m', 18, 'm', 85000, null, null, 'PROVISIONAL', 15),
    (v_project_id, v_version_id, 'material', 'BAJA STRUKTUR', 'RAB-016', 'Ringbal baja keliling', 29, 'm', 125000, null, null, 'PROVISIONAL', 16),
    (v_project_id, v_version_id, 'material', 'BAJA STRUKTUR', 'RAB-017', 'Base plate kolom', 6, 'set', 125000, null, null, 'PROVISIONAL', 17),
    (v_project_id, v_version_id, 'material', 'BAJA STRUKTUR', 'RAB-018', 'Anchor bolt set', 6, 'set', 15000, null, null, 'PROVISIONAL', 18),
    (v_project_id, v_version_id, 'material', 'BAJA STRUKTUR', 'RAB-019', 'Kuda-kuda UNP bentang ±8,5 m', 25.5, 'm', 75000, null, 'ORIGINAL_VALUE_PRESERVED — later engineering/procurement analysis (3 truss lines with top/bottom chord + web) must be a separate BOQ version, not an overwrite of this original tender value', 'PROVISIONAL', 19),
    (v_project_id, v_version_id, 'material', 'BAJA STRUKTUR', 'RAB-020', 'Bracing / pengaku atap', 1, 'ls', 1500000, null, null, 'PROVISIONAL', 20),
    (v_project_id, v_version_id, 'material', 'BAJA STRUKTUR', 'RAB-021', 'Gording atap', 60, 'm', 85000, null, null, 'PROVISIONAL', 21),
    (v_project_id, v_version_id, 'material', 'BAJA STRUKTUR', 'RAB-022', 'Plat sambungan, cleat, stiffener & hardware', 1, 'ls', 85000, null, null, 'PROVISIONAL', 22),
    (v_project_id, v_version_id, 'labor', 'BAJA STRUKTUR', 'RAB-023', 'Pengelasan, fabrikasi & erection baja', 1, 'ls', 3500000, null, null, 'PROVISIONAL', 23),

    (v_project_id, v_version_id, 'material', 'ATAP', 'RAB-024', 'Penutup atap spandek', 59, 'm2', 65000, null, null, 'PROVISIONAL', 24),
    (v_project_id, v_version_id, 'material', 'ATAP', 'RAB-025', 'Aluminium foil insulation', 59, 'm2', 15000, null, null, 'PROVISIONAL', 25),
    (v_project_id, v_version_id, 'material', 'ATAP', 'RAB-026', 'Sekrup roofing + washer', 1, 'ls', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 26),
    (v_project_id, v_version_id, 'material', 'ATAP', 'RAB-027', 'Nok / flashing / lis tepi', 18, 'm', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 27),
    (v_project_id, v_version_id, 'material', 'ATAP', 'RAB-028', 'Sealant & waterproofing joint atap', 1, 'ls', 35000, null, null, 'PROVISIONAL', 28),

    (v_project_id, v_version_id, 'material', 'FACADE', 'RAB-029', 'Hollow 40x20 mm rangka facade', 115, 'm', 125000, null, null, 'PROVISIONAL', 29),
    (v_project_id, v_version_id, 'material', 'FACADE', 'RAB-030', 'Kaca facade', 28, 'm2', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 30),
    (v_project_id, v_version_id, 'material', 'FACADE', 'RAB-031', 'Pintu utama facade', 1, 'set', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 31),
    (v_project_id, v_version_id, 'material', 'FACADE', 'RAB-032', 'Pintu servis/kitchen', 1, 'set', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 32),
    (v_project_id, v_version_id, 'material', 'FACADE', 'RAB-033', 'Hardware pintu, handle, lock & stopper', 2, 'set', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 33),
    (v_project_id, v_version_id, 'material', 'FACADE', 'RAB-034', 'Coating/cat rangka hollow', 115, 'm2', 22500, null, null, 'PROVISIONAL', 34),

    (v_project_id, v_version_id, 'other', 'DINDING & SERVIS', 'RAB-035', 'Dinding area kitchen/servis', 20, 'm2', 55000, null, null, 'PROVISIONAL', 35),
    (v_project_id, v_version_id, 'other', 'DINDING & SERVIS', 'RAB-036', 'Finishing dinding area servis', 20, 'm2', 125000, null, null, 'PROVISIONAL', 36),

    (v_project_id, v_version_id, 'other', 'KITCHEN', 'RAB-037', 'Counter/meja kerja kitchen built-in', 4, 'm', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 37),
    (v_project_id, v_version_id, 'other', 'KITCHEN', 'RAB-038', 'Backsplash kitchen', 8, 'm2', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 38),
    (v_project_id, v_version_id, 'other', 'KITCHEN', 'RAB-039', 'Sink kitchen + faucet', 1, 'set', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 39),

    (v_project_id, v_version_id, 'material', 'PLUMBING', 'RAB-040', 'Pipa air bersih + fitting', 30, 'm', 12500, null, null, 'PROVISIONAL', 40),
    (v_project_id, v_version_id, 'material', 'PLUMBING', 'RAB-041', 'Pipa air buangan + fitting', 30, 'm', 25000, null, null, 'PROVISIONAL', 41),
    (v_project_id, v_version_id, 'material', 'PLUMBING', 'RAB-042', 'Floor drain', 2, 'unit', 25000, null, null, 'PROVISIONAL', 42),
    (v_project_id, v_version_id, 'material', 'PLUMBING', 'RAB-043', 'Clean out', 2, 'unit', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 43),
    (v_project_id, v_version_id, 'material', 'PLUMBING', 'RAB-044', 'Valve, flexible hose & accessories', 1, 'ls', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 44),

    (v_project_id, v_version_id, 'material', 'ELEKTRIKAL', 'RAB-045', 'Panel/DB + MCB/RCD sesuai perhitungan', 1, 'set', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 45),
    (v_project_id, v_version_id, 'material', 'ELEKTRIKAL', 'RAB-046', 'Kabel + conduit + accessories', 1, 'ls', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 46),
    (v_project_id, v_version_id, 'material', 'ELEKTRIKAL', 'RAB-047', 'Titik lampu indoor', 8, 'titik', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 47),
    (v_project_id, v_version_id, 'material', 'ELEKTRIKAL', 'RAB-048', 'Titik lampu facade/outdoor', 4, 'titik', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 48),
    (v_project_id, v_version_id, 'material', 'ELEKTRIKAL', 'RAB-049', 'Stop kontak', 10, 'titik', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 49),
    (v_project_id, v_version_id, 'material', 'ELEKTRIKAL', 'RAB-050', 'Switch', 6, 'titik', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 50),
    (v_project_id, v_version_id, 'material', 'ELEKTRIKAL', 'RAB-051', 'Grounding system', 1, 'set', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 51),
    (v_project_id, v_version_id, 'material', 'ELEKTRIKAL', 'RAB-052', 'Testing & commissioning listrik', 1, 'ls', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 52),

    (v_project_id, v_version_id, 'material', 'DRAINASE', 'RAB-053', 'Talang atap', 18, 'm', 45000, null, null, 'PROVISIONAL', 53),
    (v_project_id, v_version_id, 'material', 'DRAINASE', 'RAB-054', 'Downpipe', 12, 'm', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 54),
    (v_project_id, v_version_id, 'material', 'DRAINASE', 'RAB-055', 'Outlet / drain connection', 1, 'ls', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 55),

    (v_project_id, v_version_id, 'other', 'FINISHING', 'RAB-056', 'Touch-up, sealant & minor hardware', 1, 'ls', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 56),
    (v_project_id, v_version_id, 'other', 'FINISHING', 'RAB-057', 'Pembersihan akhir', 1, 'ls', 2500000, null, null, 'PROVISIONAL', 57),
    (v_project_id, v_version_id, 'other', 'FINISHING', 'RAB-058', 'Testing & handover', 1, 'ls', 0, null, 'UNPRICED / NOT_YET_BUDGETED', 'PROVISIONAL', 58);
end $$;

-- ----------------------------------------------------------------------------
-- 4. WBS — reuse the existing default 15-phase template (already matches
--    the brief's requested sequence: mobilization -> earthwork ->
--    foundation -> structure -> wall -> roof -> MEP -> flooring -> ceiling
--    -> painting -> doors -> sanitary -> furniture -> landscaping ->
--    final inspection).
-- ----------------------------------------------------------------------------
do $$
declare
  v_project_id uuid;
  v_template_id uuid;
begin
  select id into v_project_id from public.construction_projects
  where branch_id = (select id from public.branches where code = 'LNC') limit 1;
  select id into v_template_id from public.cm_wbs_templates where is_default = true limit 1;

  if v_project_id is not null and v_template_id is not null
     and not exists (select 1 from public.cm_project_wbs where project_id = v_project_id and unit_id is null) then
    insert into public.cm_project_wbs (project_id, unit_id, code, name, weight, sort_order)
    select v_project_id, null, code, name, weight, sort_order
    from public.cm_wbs_template_items where template_id = v_template_id;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Labor contract — Rp75,000,000 borongan, weighted against the WBS
--    phases above (earned-value payment engine already built in 0213).
--    Contractor is Anang (owner-confirmed) — already a real
--    contractor_wa_senders row (0237's nota-report flow) with a known
--    phone/bank account; reused here by name/phone match rather than
--    re-entering his details, so cm_contractors and contractor_wa_senders
--    both point at the same person.
-- ----------------------------------------------------------------------------
do $$
declare
  v_project_id uuid;
  v_contractor_id uuid;
  v_contract_id uuid;
  v_weights jsonb;
  v_anang_phone text;
  v_anang_bank text;
begin
  select id into v_project_id from public.construction_projects
  where branch_id = (select id from public.branches where code = 'LNC') limit 1;

  if v_project_id is null or exists (select 1 from public.cm_labor_contracts where project_id = v_project_id) then
    return;
  end if;

  select phone, bank_account into v_anang_phone, v_anang_bank
  from public.contractor_wa_senders where full_name ilike '%anang%' limit 1;

  insert into public.cm_contractors (full_name, contractor_type, phone, bank_account, is_active)
  values (coalesce((select full_name from public.contractor_wa_senders where full_name ilike '%anang%' limit 1), 'Anang'), 'subcontractor', v_anang_phone, v_anang_bank, true)
  returning id into v_contractor_id;

  insert into public.cm_labor_contracts (project_id, contractor_id, contract_value, start_date, target_completion, notes)
  values (v_project_id, v_contractor_id, 75000000, '2026-09-15', '2026-10-20', 'Borongan kontraktor (Anang) — nilai kontrak baseline dari RAB awal, durasi 5 minggu (15 Sep s/d 20 Okt 2026)')
  returning id into v_contract_id;

  select jsonb_agg(jsonb_build_object('project_wbs_id', id, 'weight_pct', weight))
  into v_weights
  from public.cm_project_wbs where project_id = v_project_id and unit_id is null;

  if v_weights is not null then
    delete from public.cm_labor_contract_weights where contract_id = v_contract_id;
    insert into public.cm_labor_contract_weights (contract_id, project_wbs_id, weight_pct)
    select v_contract_id, (elem->>'project_wbs_id')::uuid, (elem->>'weight_pct')::numeric
    from jsonb_array_elements(v_weights) as elem;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Weekly labor schedule (PLANNING table only — never posts money on its
--    own; actual payment always goes through cm_generate_labor_payment /
--    cm_approve_labor_payment, same as every other project).
-- ----------------------------------------------------------------------------
create table if not exists public.cm_labor_weekly_schedule (
  id uuid primary key default gen_random_uuid(),
  labor_contract_id uuid not null references public.cm_labor_contracts(id) on delete cascade,
  week_number int not null,
  period_start date not null,
  period_end date not null,
  planned_progress_pct numeric(5, 2) not null default 0 check (planned_progress_pct >= 0 and planned_progress_pct <= 100),
  actual_progress_pct numeric(5, 2) check (actual_progress_pct >= 0 and actual_progress_pct <= 100),
  planned_payment numeric(16, 2) not null default 0,
  requested_payment numeric(16, 2),
  approved_payment numeric(16, 2),
  paid_amount numeric(16, 2),
  notes text,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'submitted', 'paid', 'closed')),
  linked_payment_id uuid references public.cm_labor_payments(id),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (labor_contract_id, week_number)
);
create index cm_labor_weekly_schedule_contract_idx on public.cm_labor_weekly_schedule (labor_contract_id);

alter table public.cm_labor_weekly_schedule enable row level security;
create policy cm_labor_weekly_schedule_select on public.cm_labor_weekly_schedule for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (
    select 1 from public.cm_labor_contracts c
    join public.construction_projects p on p.id = c.project_id
    join public.employees e on e.branch_id = p.branch_id
    where c.id = cm_labor_weekly_schedule.labor_contract_id and e.id = auth.uid()
  )
);

-- cm_upsert_labor_weekly_schedule(): editable planning row — actual
-- construction may deviate from plan, per the brief's explicit requirement.
create or replace function public.cm_upsert_labor_weekly_schedule(
  p_labor_contract_id uuid, p_week_number int, p_period_start date, p_period_end date,
  p_planned_progress_pct numeric, p_planned_payment numeric, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  insert into public.cm_labor_weekly_schedule (
    labor_contract_id, week_number, period_start, period_end, planned_progress_pct, planned_payment, notes, created_by
  ) values (
    p_labor_contract_id, p_week_number, p_period_start, p_period_end, p_planned_progress_pct, p_planned_payment, nullif(trim(p_notes), ''), auth.uid()
  )
  on conflict (labor_contract_id, week_number) do update
    set period_start = excluded.period_start, period_end = excluded.period_end,
        planned_progress_pct = excluded.planned_progress_pct, planned_payment = excluded.planned_payment,
        notes = coalesce(excluded.notes, cm_labor_weekly_schedule.notes), updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.cm_record_labor_weekly_actual(
  p_id uuid, p_actual_progress_pct numeric default null, p_requested_payment numeric default null, p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('construction_finance.submit') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.cm_labor_weekly_schedule
    set actual_progress_pct = coalesce(p_actual_progress_pct, actual_progress_pct),
        requested_payment = coalesce(p_requested_payment, requested_payment),
        notes = coalesce(nullif(trim(p_notes), ''), notes),
        status = case when p_requested_payment is not null then 'submitted' else status end,
        updated_at = now()
    where id = p_id;
  if not found then
    raise exception 'Jadwal minggu tidak ditemukan';
  end if;
end;
$$;

-- Seed 5 weeks starting Tuesday 15 Sep 2026 (owner-confirmed total
-- construction duration: 5 weeks, ending ~20 Oct 2026, matching
-- cm_labor_contracts.target_completion above). Planned progress/payment
-- split is a REASONABLE INITIAL PLANNING ASSUMPTION (front-loaded
-- structure/foundation work, tapering into finishing), not a re-derivation
-- of the Rp75,000,000 contract value itself (section 10 of the brief: "do
-- not simply divide equally"). Fully editable via
-- cm_upsert_labor_weekly_schedule.
do $$
declare
  v_contract_id uuid;
  v_start date := date '2026-09-15';
  v_plan numeric[] := array[15, 25, 25, 20, 15]; -- sums to 100, 5 weeks
  v_i int;
begin
  select id into v_contract_id from public.cm_labor_contracts
  where project_id = (select id from public.construction_projects where branch_id = (select id from public.branches where code = 'LNC') limit 1)
  limit 1;

  if v_contract_id is null or exists (select 1 from public.cm_labor_weekly_schedule where labor_contract_id = v_contract_id) then
    return;
  end if;

  for v_i in 1..5 loop
    insert into public.cm_labor_weekly_schedule (
      labor_contract_id, week_number, period_start, period_end, planned_progress_pct, planned_payment
    ) values (
      v_contract_id, v_i, v_start + ((v_i - 1) * 7), v_start + ((v_i - 1) * 7) + 6,
      v_plan[v_i], round(75000000 * v_plan[v_i] / 100.0, 2)
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 7. construction_cost_requests — the WhatsApp-first
--    DRAFT->SUBMITTED->APPROVED->TRANSFERRED->PAID->POSTED workflow. On
--    posting, calls the EXISTING construction_submit_expense (money-moving
--    logic lives there, unchanged) — this table is the request/approval
--    layer in front of it, not a second ledger.
-- ----------------------------------------------------------------------------
create table public.construction_cost_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.construction_projects(id) on delete cascade,
  request_type text not null check (request_type in ('material_purchase', 'contractor_payment', 'other_expense')),
  cm_project_boq_id uuid references public.cm_project_boq(id),
  cost_code text,
  description text not null,
  items jsonb,
  amount numeric(16, 2) not null check (amount > 0),
  party_name text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'transferred', 'paid', 'posted', 'cancelled')),
  requested_by uuid references public.employees(id),
  requested_at timestamptz,
  approved_by uuid references public.employees(id),
  approved_at timestamptz,
  reject_reason text,
  transferred_at timestamptz,
  transfer_confirmed_by uuid references public.employees(id),
  posted_expense_id uuid references public.construction_expenses(id),
  posted_labor_payment_id uuid references public.cm_labor_payments(id),
  wa_request_id text,
  source text not null default 'web' check (source in ('web', 'whatsapp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index construction_cost_requests_project_idx on public.construction_cost_requests (project_id);
create index construction_cost_requests_status_idx on public.construction_cost_requests (status);

alter table public.construction_cost_requests enable row level security;
create policy construction_cost_requests_select on public.construction_cost_requests for select to authenticated using (
  public.app_has_permission('construction_finance.manage')
  or exists (select 1 from public.construction_projects p join public.employees e on e.branch_id = p.branch_id where p.id = construction_cost_requests.project_id and e.id = auth.uid())
);

-- construction_submit_cost_request(): Vando (or anyone with .submit) creates
-- a draft request. p_source/'whatsapp' + p_wa_request_id let the WhatsApp
-- layer trace a request back to the conversation that created it.
create or replace function public.construction_submit_cost_request(
  p_project_id uuid, p_request_type text, p_description text, p_amount numeric,
  p_party_name text default null, p_cost_code text default null, p_items jsonb default null,
  p_source text default 'web', p_wa_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_branch uuid;
  v_project public.construction_projects%rowtype;
  v_boq_id uuid;
  v_id uuid;
  v_admin record;
begin
  if not public.app_has_permission('construction_finance.submit') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_request_type not in ('material_purchase', 'contractor_payment', 'other_expense') then
    raise exception 'Jenis pengajuan tidak valid';
  end if;
  if p_amount <= 0 then
    raise exception 'Nominal harus lebih dari 0';
  end if;

  select * into v_project from public.construction_projects where id = p_project_id and status = 'active';
  if not found then
    raise exception 'Proyek tidak ditemukan atau sudah tidak aktif';
  end if;

  select branch_id into v_caller_branch from public.employees where id = v_caller;
  if not public.app_has_permission('construction_finance.manage') and v_project.branch_id is distinct from v_caller_branch then
    raise exception 'Proyek ini bukan bagian dari cabang Anda' using errcode = '42501';
  end if;

  if p_cost_code is not null then
    select id into v_boq_id from public.cm_project_boq
    where project_id = p_project_id and cost_code = p_cost_code
    order by version_id desc nulls last limit 1;
  end if;

  insert into public.construction_cost_requests (
    project_id, request_type, cm_project_boq_id, cost_code, description, items, amount, party_name,
    status, requested_by, requested_at, source, wa_request_id
  ) values (
    p_project_id, p_request_type, v_boq_id, p_cost_code, trim(p_description), p_items, p_amount, nullif(trim(p_party_name), ''),
    'submitted', v_caller, now(), coalesce(p_source, 'web'), p_wa_request_id
  )
  returning id into v_id;

  for v_admin in
    select em.id from public.employees em
    join public.roles r on r.id = em.role_id
    where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
  loop
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_admin.id, 'system', 'construction_cost_request_submitted',
      'Pengajuan Baru — ' || v_project.name,
      E'📋 ' || trim(p_description) || E'\n💰 Rp ' || to_char(p_amount, 'FM999,999,999,999')
        || coalesce(E'\n🏷️ ' || p_cost_code, '') || coalesce(E'\n👤 ' || p_party_name, ''),
      '/construction-finance',
      jsonb_build_object('cost_request_id', v_id, 'project_id', p_project_id)
    );
  end loop;

  return v_id;
end;
$$;

-- construction_decide_cost_request(): approve/reject. Owner-only
-- (.manage). Requester can never approve their own request — enforced
-- server-side, not just by hiding a button.
create or replace function public.construction_decide_cost_request(p_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_req public.construction_cost_requests%rowtype;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_req from public.construction_cost_requests where id = p_id and status = 'submitted';
  if not found then
    raise exception 'Pengajuan tidak ditemukan atau sudah diputuskan';
  end if;
  if v_req.requested_by = v_caller then
    raise exception 'Tidak boleh menyetujui pengajuan milik sendiri' using errcode = '42501';
  end if;

  update public.construction_cost_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        approved_by = v_caller, approved_at = now(),
        reject_reason = case when p_approve then null else nullif(trim(p_reason), '') end,
        updated_at = now()
    where id = p_id;

  if v_req.requested_by is not null then
    insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
    values (
      v_req.requested_by, 'system', 'construction_cost_request_decided',
      case when p_approve then 'Pengajuan Disetujui' else 'Pengajuan Ditolak' end,
      trim(v_req.description) || ' — Rp ' || to_char(v_req.amount, 'FM999,999,999,999')
        || case when not p_approve and coalesce(trim(p_reason), '') <> '' then E'\nAlasan: ' || trim(p_reason) else '' end,
      '/construction-finance',
      jsonb_build_object('cost_request_id', p_id)
    );
  end if;
end;
$$;

-- construction_confirm_cost_request_transfer(): owner confirms they've
-- actually sent the money (their own normal transfer process — this
-- system never automates the transfer itself, only records it, per the
-- brief's explicit rule that APPROVED != PAID).
create or replace function public.construction_confirm_cost_request_transfer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  update public.construction_cost_requests
    set status = 'transferred', transferred_at = now(), transfer_confirmed_by = auth.uid(), updated_at = now()
    where id = p_id and status = 'approved';
  if not found then
    raise exception 'Pengajuan tidak ditemukan atau belum disetujui';
  end if;
end;
$$;

-- construction_post_cost_request(): the actual posting step — creates the
-- REAL financial record via the existing, unchanged money-moving RPCs
-- (construction_submit_expense for material/other; a linked
-- cm_labor_payments row for contractor payments must already exist and is
-- just referenced here). Fires the outbound sync to mkh-properti's new
-- construction_project_financial_records table (see trigger below).
-- Posts the actual construction_expenses row directly (same shape
-- construction_submit_expense would insert) rather than calling that RPC,
-- because construction_submit_expense re-checks 'construction_finance.submit'
-- against the CALLER — here the caller is the owner/manager finalizing a
-- posting after transfer confirmation, not the original Kepala Cabang
-- submitter, and manage-holders aren't necessarily also submit-holders.
-- The permission boundary for this step is '.manage' (checked below); the
-- submit-time boundary was already enforced back in
-- construction_submit_cost_request.
create or replace function public.construction_post_cost_request(p_id uuid, p_labor_payment_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.construction_cost_requests%rowtype;
  v_project public.construction_projects%rowtype;
  v_expense_id uuid;
begin
  if not public.app_has_permission('construction_finance.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_req from public.construction_cost_requests where id = p_id and status = 'transferred';
  if not found then
    raise exception 'Pengajuan tidak ditemukan atau belum ditransfer';
  end if;

  if v_req.request_type = 'contractor_payment' then
    if p_labor_payment_id is null or not exists (select 1 from public.cm_labor_payments where id = p_labor_payment_id and status = 'approved') then
      raise exception 'p_labor_payment_id harus mengacu ke cm_labor_payments yang sudah approved';
    end if;
    update public.construction_cost_requests
      set status = 'posted', posted_labor_payment_id = p_labor_payment_id, updated_at = now()
      where id = p_id;
    return p_labor_payment_id;
  end if;

  select * into v_project from public.construction_projects where id = v_req.project_id;

  insert into public.construction_expenses (
    project_id, branch_id, expense_type, party_name, description, amount, payment_method, expense_date, created_by
  ) values (
    v_req.project_id, v_project.branch_id,
    case when v_req.request_type = 'material_purchase' then 'pembelian_material' else 'pembelian_lain_lain' end,
    coalesce(v_req.party_name, 'Vando (WhatsApp)'), v_req.description, v_req.amount, 'utang', current_date, auth.uid()
  )
  returning id into v_expense_id;

  update public.construction_cost_requests
    set status = 'posted', posted_expense_id = v_expense_id, updated_at = now()
    where id = p_id;

  return v_expense_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Outbound sync to mkh-properti's dedicated construction_project_
--    financial_records table — fires only at 'posted' (i.e. money has
--    actually moved), same "only sync the real thing, once" principle as
--    trg_construction_expense_sync (0194/0224).
-- ----------------------------------------------------------------------------
create or replace function public.trg_construction_cost_request_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_branch public.branches%rowtype;
  v_project public.construction_projects%rowtype;
  v_requester public.employees%rowtype;
  v_approver public.employees%rowtype;
begin
  if new.status <> 'posted' or old.status = 'posted' then
    return new;
  end if;

  select * into v_project from public.construction_projects where id = new.project_id;
  select * into v_branch from public.branches where id = v_project.branch_id;
  if v_branch.mkh_project_code is null then
    return new;
  end if;

  select * into v_requester from public.employees where id = new.requested_by;
  select * into v_approver from public.employees where id = new.approved_by;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload)
  values (
    'outbound', 'construction_project_financial_record', 'construction_cost_requests', new.id,
    'mkc:construction_cost_request:' || new.id,
    jsonb_build_object(
      'cost_request_id', new.id,
      'construction_project_code', 'LOONARS_COFFEE',
      'construction_project_name', v_project.name,
      'mkh_project_code', v_branch.mkh_project_code,
      'request_type', new.request_type,
      'cost_code', new.cost_code,
      'description', new.description,
      'amount', new.amount,
      'party_name', new.party_name,
      'requester_name', v_requester.full_name,
      'approver_name', v_approver.full_name,
      'wa_request_id', new.wa_request_id,
      'source', new.source,
      'posted_expense_id', new.posted_expense_id,
      'posted_labor_payment_id', new.posted_labor_payment_id,
      'requested_at', new.requested_at,
      'approved_at', new.approved_at,
      'transferred_at', new.transferred_at,
      'posted_at', now()
    )
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$function$;

create trigger construction_cost_requests_sync
  after update on public.construction_cost_requests
  for each row execute function public.trg_construction_cost_request_sync();

-- ----------------------------------------------------------------------------
-- 9. Notification categories
-- ----------------------------------------------------------------------------
alter table public.mkc_notifications drop constraint mkc_notifications_category_check;
alter table public.mkc_notifications add constraint mkc_notifications_category_check
  check (category is null or category = any (array[
    'attendance_reminder', 'late_attendance', 'forgot_checkout', 'leave_approved', 'leave_rejected', 'payroll_available',
    'new_prospect', 'follow_up_reminder', 'new_assignment', 'closing_approved', 'customer_verification', 'target_reminder',
    'markom_new_task', 'task_revision', 'task_approved', 'weekly_reminder',
    'project_progress', 'material_request', 'inspection_reminder',
    'payment_received', 'invoice_due', 'reimbursement_approved',
    'waiting_approval', 'approved', 'rejected',
    'new_announcement', 'new_memo',
    'maintenance', 'version_update', 'emergency_notice',
    'stuck_prospect_reminder', 'stuck_prospect_alert', 'branch_target_reminder',
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation',
    'task_pending_verification',
    'daily_motivation', 'daily_report',
    'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'new_ad_lead', 'content_published', 'content_publish_reminder', 'finance_expense_alert',
    'branch_balance_alert', 'sales_coaching_tip', 'ad_lead_followup_reminder', 'ad_lead_escalation_branch',
    'ad_lead_escalation_director', 'whatsapp_webhook_silence_alert', 'finance_expense_pending_verification',
    'sales_conduct_warning', 'meta_ads_balance_low', 'content_publish_failed', 'database_followup_push',
    'lead_wants_info', 'loonars_fee_alert', 'automation_dispatch_failed', 'automation_job_dead_letter',
    'automation_queue_stalled', 'disciplinary_warning', 'employee_terminated', 'content_review_pending',
    'salary_transfer_request', 'salary_transferred', 'salary_transfer_summary',
    'construction_expense_submitted', 'construction_weekly_report', 'material_purchase_missing_photo',
    'construction_progress_report', 'approval_request_submitted', 'approval_request_decided',
    'lead_hot_handoff', 'pending_question_timeout',
    -- This migration
    'construction_cost_request_submitted', 'construction_cost_request_decided'
  ]));

create or replace function public.mkc_notifications_whatsapp_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.category = any (array[
    'attendance_reminder', 'late_attendance', 'forgot_checkout',
    'new_memo',
    'target_reminder',
    'weekly_reminder', 'markom_new_task', 'task_revision',
    'payroll_available',
    'waiting_approval',
    'project_progress', 'material_request', 'inspection_reminder',
    'stuck_prospect_reminder', 'stuck_prospect_alert', 'branch_target_reminder',
    'sp1_pending_review', 'sp1_issued', 'sp1_escalation',
    'task_pending_verification',
    'daily_motivation', 'daily_report',
    'birthday_wish',
    'ad_campaign_launched', 'ad_campaign_failed',
    'finance_expense_alert', 'branch_balance_alert',
    'sales_coaching_tip',
    'ad_lead_followup_reminder', 'ad_lead_escalation_branch', 'ad_lead_escalation_director',
    'whatsapp_webhook_silence_alert',
    'finance_expense_pending_verification',
    'sales_conduct_warning',
    'meta_ads_balance_low',
    'lead_wants_info',
    'loonars_fee_alert',
    'automation_dispatch_failed', 'automation_job_dead_letter', 'automation_queue_stalled',
    'content_review_pending',
    'salary_transfer_summary',
    'construction_expense_submitted',
    'construction_weekly_report',
    'material_purchase_missing_photo',
    'construction_progress_report',
    'approval_request_submitted', 'approval_request_decided',
    'labor_payment_pending_approval',
    'salary_transferred',
    -- This migration -- Vando/owner see cost-request submit/decide as it happens.
    'construction_cost_request_submitted', 'construction_cost_request_decided'
  ]) then
    perform public.automation_post('/api/ai/whatsapp-relay', jsonb_build_object('notification_id', new.id), 5000);
  end if;
  return new;
end;
$$;
