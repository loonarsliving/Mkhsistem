-- ============================================================================
-- MK Connect — 0061: Target Management V2 (Branch -> many Products)
--
-- The old model assumed 1 Branch = 1 Product per month (branch_sales_targets
-- had a single target_units/selling_price_per_unit/commission_percent row
-- per branch/period, evenly split across every active Marketing & Sales
-- employee in the branch). That's wrong: a branch sells multiple products
-- (houses, villas, Loonars Beauty, ...) at different prices/commissions,
-- and distribution should only reach Sales assigned to that specific
-- product.
--
-- New model:
--   crm_products                  -- master product catalog
--   crm_product_sales_assignments -- which Sales reps sell which product
--   crm_target_headers            -- one per (branch, month, year)
--   crm_target_details            -- one per (header, product) -- the
--                                     actual target unit/price/commission
--   sales_targets.product_id      -- new column: which product a
--                                     distributed per-Sales target row is for
--
-- Old branch_sales_targets is left in place, untouched, as a frozen
-- historical table (no code writes to it anymore after this migration) --
-- nothing is dropped, no data is lost. Every existing branch_sales_targets
-- row is migrated into the new header/detail tables under one migrated
-- "Produk Lama (Migrasi)" product, and every existing sales_targets row is
-- backfilled to point at that same product, so all historical
-- reporting (crm_sales_stats, crm_branch_stats, crm_national_stats,
-- crm_sales_ranking, crm_monthly_trend) keeps working unchanged for past
-- periods.
-- ============================================================================

-- ── 1. MASTER PRODUCT TABLE ──────────────────────────────────────────────
create table public.crm_products (
  id uuid primary key default gen_random_uuid(),
  -- Reserved for future multi-tenancy. This system is single-company today
  -- (no `companies` table exists -- only the singleton `company_settings`),
  -- so there is nothing to foreign-key against yet; kept nullable/unenforced
  -- per the requested field list.
  company_id uuid,
  product_name text not null,
  category text,
  unit text not null default 'unit',
  default_price numeric(16,2) not null default 0 check (default_price >= 0),
  default_commission numeric(5,2) not null default 0 check (default_commission >= 0 and default_commission <= 100),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index crm_products_status_idx on public.crm_products(status);

create trigger set_updated_at before update on public.crm_products
  for each row execute function set_updated_at();
create trigger audit_log after insert or delete or update on public.crm_products
  for each row execute function audit_log_trigger();

alter table public.crm_products enable row level security;
-- Open read (mirrors `branches`): the product catalog isn't sensitive and is
-- needed by the target form, future per-product reporting, etc.
create policy crm_products_select on public.crm_products
  for select using (status = 'active' or app_has_permission('sales_target.manage'));
create policy crm_products_write on public.crm_products
  for all using (app_has_permission('sales_target.manage')) with check (app_has_permission('sales_target.manage'));

-- ── 2. PRODUCT <-> SALES ASSIGNMENT ──────────────────────────────────────
-- "Sales A sells only Rumah Subsidi", "Sales B sells only Villa", etc. --
-- this is what scopes Target Distribution to the right people.
create table public.crm_product_sales_assignments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.crm_products(id) on delete cascade,
  sales_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (product_id, sales_id)
);
create index crm_product_sales_assignments_sales_idx on public.crm_product_sales_assignments(sales_id);
create index crm_product_sales_assignments_product_idx on public.crm_product_sales_assignments(product_id);

create trigger audit_log after insert or delete or update on public.crm_product_sales_assignments
  for each row execute function audit_log_trigger();

alter table public.crm_product_sales_assignments enable row level security;
create policy crm_product_sales_assignments_select on public.crm_product_sales_assignments
  for select using (
    sales_id = auth.uid()
    or app_has_permission('sales_target.view_all')
    or (
      app_has_permission('sales_target.view_branch')
      and exists (select 1 from public.employees e where e.id = crm_product_sales_assignments.sales_id and e.branch_id = app_current_branch_id())
    )
  );
create policy crm_product_sales_assignments_write on public.crm_product_sales_assignments
  for all using (app_has_permission('sales_target.manage')) with check (app_has_permission('sales_target.manage'));

-- ── 3. TARGET HEADER (one per branch/month/year) ─────────────────────────
create table public.crm_target_headers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid, -- see crm_products.company_id note above
  branch_id uuid not null references public.branches(id) on delete restrict,
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null check (period_year between 2020 and 2100),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, period_month, period_year)
);
create index crm_target_headers_period_idx on public.crm_target_headers(period_year, period_month);

create trigger set_updated_at before update on public.crm_target_headers
  for each row execute function set_updated_at();
create trigger audit_log after insert or delete or update on public.crm_target_headers
  for each row execute function audit_log_trigger();

alter table public.crm_target_headers enable row level security;
create policy crm_target_headers_select on public.crm_target_headers
  for select using (
    app_has_permission('sales_target.view_all')
    or (app_has_permission('sales_target.view_branch') and branch_id = app_current_branch_id())
  );
create policy crm_target_headers_write on public.crm_target_headers
  for all using (app_has_permission('sales_target.manage')) with check (app_has_permission('sales_target.manage'));

-- ── 4. TARGET DETAIL (one row PER PRODUCT within a header) ───────────────
create table public.crm_target_details (
  id uuid primary key default gen_random_uuid(),
  target_header_id uuid not null references public.crm_target_headers(id) on delete cascade,
  product_id uuid not null references public.crm_products(id) on delete restrict,
  target_unit integer not null default 0 check (target_unit >= 0),
  selling_price numeric(16,2) not null default 0 check (selling_price >= 0),
  commission_percent numeric(5,2) not null default 0 check (commission_percent >= 0 and commission_percent <= 100),
  target_revenue numeric(18,2) generated always as (target_unit * selling_price) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_header_id, product_id)
);
create index crm_target_details_header_idx on public.crm_target_details(target_header_id);
create index crm_target_details_product_idx on public.crm_target_details(product_id);

create trigger set_updated_at before update on public.crm_target_details
  for each row execute function set_updated_at();
create trigger audit_log after insert or delete or update on public.crm_target_details
  for each row execute function audit_log_trigger();

alter table public.crm_target_details enable row level security;
create policy crm_target_details_select on public.crm_target_details
  for select using (
    exists (
      select 1 from public.crm_target_headers h
      where h.id = crm_target_details.target_header_id
        and (
          app_has_permission('sales_target.view_all')
          or (app_has_permission('sales_target.view_branch') and h.branch_id = app_current_branch_id())
        )
    )
  );
create policy crm_target_details_write on public.crm_target_details
  for all using (app_has_permission('sales_target.manage')) with check (app_has_permission('sales_target.manage'));

-- ── 5. sales_targets gains a product dimension ───────────────────────────
-- Nullable during migration only -- immediately backfilled below to the
-- migrated legacy product, and every new row from crm_save_and_distribute_target
-- always supplies a real product_id from here on.
alter table public.sales_targets add column product_id uuid references public.crm_products(id) on delete set null;

alter table public.sales_targets drop constraint sales_targets_sales_id_period_month_period_year_key;
alter table public.sales_targets add constraint sales_targets_sales_product_period_key
  unique (sales_id, product_id, period_month, period_year);

create index sales_targets_product_idx on public.sales_targets(product_id);

-- ── 6. SEED: baseline product catalog + migrate ALL existing target data ─
do $$
declare
  v_legacy_product_id uuid;
begin
  -- One migrated product absorbs every pre-refactor branch/sales target row,
  -- so historical months keep reporting exactly as before (no data lost).
  insert into public.crm_products (product_name, category, unit, default_price, default_commission, status)
  values ('Produk Lama (Migrasi)', 'Legacy', 'unit', 0, 0, 'active')
  returning id into v_legacy_product_id;

  update public.sales_targets set product_id = v_legacy_product_id where product_id is null;

  insert into public.crm_target_headers (branch_id, period_month, period_year, created_by, created_at)
  select branch_id, period_month, period_year, created_by, created_at
  from public.branch_sales_targets;

  insert into public.crm_target_details (target_header_id, product_id, target_unit, selling_price, commission_percent, created_at)
  select h.id, v_legacy_product_id, b.target_units, b.selling_price_per_unit, b.commission_percent, b.created_at
  from public.branch_sales_targets b
  join public.crm_target_headers h
    on h.branch_id = b.branch_id and h.period_month = b.period_month and h.period_year = b.period_year;

  -- Baseline real product catalog per the business requirement's examples.
  insert into public.crm_products (product_name, category, unit, default_price, default_commission, status) values
    ('Rumah Subsidi', 'Rumah', 'unit', 0, 0, 'active'),
    ('Rumah Komersial', 'Rumah', 'unit', 0, 0, 'active'),
    ('Villa', 'Properti Lain', 'unit', 0, 0, 'active'),
    ('Loonars Body Lotion', 'Loonars Beauty', 'pcs', 0, 0, 'active');
end $$;

-- ── 7. Product Master + Assignment write RPCs ─────────────────────────────
create or replace function public.crm_upsert_product(
  p_id uuid default null,
  p_product_name text default null,
  p_category text default null,
  p_unit text default 'unit',
  p_default_price numeric default 0,
  p_default_commission numeric default 0,
  p_status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if not public.app_has_permission('sales_target.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_product_name is null or length(trim(p_product_name)) = 0 then
    raise exception 'Nama produk wajib diisi';
  end if;

  if p_id is null then
    insert into public.crm_products (product_name, category, unit, default_price, default_commission, status, created_by, updated_by)
    values (p_product_name, p_category, coalesce(p_unit, 'unit'), coalesce(p_default_price, 0), coalesce(p_default_commission, 0), coalesce(p_status, 'active'), v_user_id, v_user_id)
    returning id into v_id;
  else
    update public.crm_products set
      product_name = p_product_name,
      category = p_category,
      unit = coalesce(p_unit, unit),
      default_price = coalesce(p_default_price, default_price),
      default_commission = coalesce(p_default_commission, default_commission),
      status = coalesce(p_status, status),
      updated_by = v_user_id
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.crm_set_product_sales_assignment(p_product_id uuid, p_sales_id uuid, p_assigned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.app_has_permission('sales_target.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  if p_assigned then
    insert into public.crm_product_sales_assignments (product_id, sales_id, created_by)
    values (p_product_id, p_sales_id, v_user_id)
    on conflict (product_id, sales_id) do nothing;
  else
    delete from public.crm_product_sales_assignments where product_id = p_product_id and sales_id = p_sales_id;
  end if;
end;
$$;

-- ── 8. Save + Distribute (replaces crm_set_branch_target for new writes) ─
-- p_details: jsonb array of {product_id, target_unit, selling_price, commission_percent}.
-- Saves the header + one detail row per product, then -- per product --
-- evenly distributes that product's target_unit only to Sales reps
-- assigned to that product in this branch (crm_product_sales_assignments),
-- same remainder-to-earliest-joined split crm_set_branch_target used, just
-- now scoped per product instead of to every Marketing & Sales employee in
-- the branch. Re-running this (e.g. after editing target_unit or the
-- assigned roster) cleanly replaces the prior distribution for each product
-- -- idempotent, no leftover stale rows.
create or replace function public.crm_save_and_distribute_target(
  p_branch_id uuid,
  p_period_month smallint,
  p_period_year smallint,
  p_details jsonb
)
returns table (header_id uuid, distributed_count integer, total_target_units integer, total_target_revenue numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_header_id uuid;
  v_detail jsonb;
  v_product_id uuid;
  v_target_unit integer;
  v_selling_price numeric(16,2);
  v_commission_percent numeric(5,2);
  v_assigned_count integer;
  v_base integer;
  v_remainder integer;
  v_total_distributed integer := 0;
  v_total_units integer := 0;
  v_total_revenue numeric(18,2) := 0;
  v_submitted_product_ids uuid[];
begin
  if not public.app_has_permission('sales_target.manage') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if p_details is null or jsonb_array_length(p_details) = 0 then
    raise exception 'Minimal satu produk wajib diisi';
  end if;

  select array_agg((d->>'product_id')::uuid) into v_submitted_product_ids
  from jsonb_array_elements(p_details) d;

  insert into public.crm_target_headers (branch_id, period_month, period_year, created_by)
  values (p_branch_id, p_period_month, p_period_year, v_user_id)
  on conflict (branch_id, period_month, period_year) do update set updated_at = now()
  returning id into v_header_id;

  -- Drop distributed sales_targets + detail rows for any product removed from this save.
  -- NOTE: the return column is named `header_id` (not `target_header_id`) specifically
  -- to avoid colliding with the crm_target_details.target_header_id column below --
  -- PL/pgSQL resolves bare column references against OUT params first, so naming this
  -- `target_header_id` made every unqualified `target_header_id` reference in this
  -- function body ambiguous with the table column of the same name.
  delete from public.sales_targets st
  using public.employees e
  where st.sales_id = e.id and e.branch_id = p_branch_id
    and st.period_month = p_period_month and st.period_year = p_period_year
    and st.product_id in (
      select ctd.product_id from public.crm_target_details ctd
      where ctd.target_header_id = v_header_id and not (ctd.product_id = any (v_submitted_product_ids))
    );

  delete from public.crm_target_details ctd
  where ctd.target_header_id = v_header_id and not (ctd.product_id = any (v_submitted_product_ids));

  for v_detail in select * from jsonb_array_elements(p_details)
  loop
    v_product_id := (v_detail->>'product_id')::uuid;
    v_target_unit := coalesce((v_detail->>'target_unit')::integer, 0);
    v_selling_price := coalesce((v_detail->>'selling_price')::numeric, 0);
    v_commission_percent := coalesce((v_detail->>'commission_percent')::numeric, 0);

    insert into public.crm_target_details (target_header_id, product_id, target_unit, selling_price, commission_percent, updated_at)
    values (v_header_id, v_product_id, v_target_unit, v_selling_price, v_commission_percent, now())
    on conflict (target_header_id, product_id) do update set
      target_unit = excluded.target_unit,
      selling_price = excluded.selling_price,
      commission_percent = excluded.commission_percent,
      updated_at = now();

    v_total_units := v_total_units + v_target_unit;
    v_total_revenue := v_total_revenue + (v_target_unit * v_selling_price);

    delete from public.sales_targets st
    using public.employees e
    where st.sales_id = e.id and e.branch_id = p_branch_id
      and st.product_id = v_product_id
      and st.period_month = p_period_month and st.period_year = p_period_year;

    select count(*) into v_assigned_count
    from public.crm_product_sales_assignments psa
    join public.employees e on e.id = psa.sales_id
    where psa.product_id = v_product_id and e.branch_id = p_branch_id
      and e.deleted_at is null and e.employment_status = 'active';

    if v_assigned_count > 0 then
      v_base := v_target_unit / v_assigned_count;
      v_remainder := v_target_unit % v_assigned_count;

      with ranked as (
        select e.id as sales_id, row_number() over (order by e.join_date, e.id) as rn
        from public.crm_product_sales_assignments psa
        join public.employees e on e.id = psa.sales_id
        where psa.product_id = v_product_id and e.branch_id = p_branch_id
          and e.deleted_at is null and e.employment_status = 'active'
      )
      insert into public.sales_targets (sales_id, product_id, period_month, period_year, target_units, selling_price_per_unit, commission_percent, created_by, updated_by)
      select r.sales_id, v_product_id, p_period_month, p_period_year,
        v_base + case when r.rn <= v_remainder then 1 else 0 end,
        v_selling_price, v_commission_percent, v_user_id, v_user_id
      from ranked r
      on conflict (sales_id, product_id, period_month, period_year) do update set
        target_units = excluded.target_units,
        selling_price_per_unit = excluded.selling_price_per_unit,
        commission_percent = excluded.commission_percent,
        updated_by = v_user_id;

      v_total_distributed := v_total_distributed + v_assigned_count;
    end if;
  end loop;

  return query select v_header_id, v_total_distributed, v_total_units, v_total_revenue;
end;
$$;

-- ── 9. Fix reporting RPCs for the new "many rows per Sales per period" shape ─
--
-- crm_national_stats and crm_monthly_trend already aggregate sales_targets
-- with sum()/group by and are unaffected by a Sales rep now potentially
-- having multiple target rows (one per product) in the same period -- left
-- unchanged. crm_sales_stats, crm_branch_stats, and crm_sales_ranking
-- previously assumed exactly one sales_targets row per (sales_id, period);
-- with multiple product rows now possible, they must sum instead.

create or replace function public.crm_sales_stats(
  p_sales_id uuid default null,
  p_month smallint default null,
  p_year smallint default null
)
returns table (
  sales_id uuid,
  period_month smallint,
  period_year smallint,
  target_units integer,
  selling_price_per_unit numeric,
  commission_percent numeric,
  target_revenue numeric,
  max_commission numeric,
  closing_units bigint,
  achievement_percent numeric,
  remaining_target integer,
  collection numeric,
  estimated_commission numeric,
  verified_commission numeric,
  prospects_red bigint,
  prospects_yellow bigint,
  prospects_green bigint,
  prospects_closing bigint,
  today_prospect bigint,
  today_follow_up bigint,
  late_follow_up bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_sales_id uuid := coalesce(p_sales_id, v_caller);
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
  v_target_units integer;
  v_target_revenue numeric(18,2);
  v_max_commission numeric(18,2);
  v_closing_units bigint;
  v_collection numeric(14,2);
  v_estimated_commission numeric(14,2);
  v_verified_commission numeric(14,2);
  v_red bigint;
  v_yellow bigint;
  v_green bigint;
  v_closing bigint;
  v_today_prospect bigint;
  v_today_follow_up bigint;
  v_late_follow_up bigint;
begin
  if v_sales_id <> v_caller then
    if not (
      public.app_has_permission('sales_target.view_all')
      or (
        public.app_has_permission('sales_target.view_branch')
        and exists (select 1 from public.employees e where e.id = v_sales_id and e.branch_id = public.app_current_branch_id())
      )
    ) then
      raise exception 'Insufficient permission' using errcode = '42501';
    end if;
  end if;

  -- Sum across every product a Sales rep is targeted on this period (was a
  -- single-row lookup pre-refactor; now a Sales rep can have one
  -- sales_targets row per assigned product).
  select coalesce(sum(st.target_units), 0),
         coalesce(sum(st.target_units * st.selling_price_per_unit), 0),
         coalesce(sum(st.target_units * st.selling_price_per_unit * st.commission_percent / 100), 0)
    into v_target_units, v_target_revenue, v_max_commission
  from public.sales_targets st
  where st.sales_id = v_sales_id and st.period_month = v_month and st.period_year = v_year;

  select count(*) into v_closing_units from public.prospects p
    where p.sales_id = v_sales_id and p.status = 'closing' and p.closed_at is not null
      and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year;

  select coalesce(sum(pp.amount), 0), coalesce(sum(pp.commission_amount), 0) into v_collection, v_estimated_commission
    from public.prospect_payments pp
    join public.prospects p on p.id = pp.prospect_id
    where p.sales_id = v_sales_id and pp.status = 'approved'
      and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year;

  select coalesce(sum(pp.commission_amount), 0) into v_verified_commission
    from public.prospect_payments pp
    join public.prospects p on p.id = pp.prospect_id
    where p.sales_id = v_sales_id and pp.status = 'approved' and p.status = 'closing'
      and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year;

  select count(*) filter (where p.status = 'red'),
         count(*) filter (where p.status = 'yellow'),
         count(*) filter (where p.status = 'green'),
         count(*) filter (where p.status = 'closing'),
         count(*) filter (where p.created_at::date = current_date)
    into v_red, v_yellow, v_green, v_closing, v_today_prospect
    from public.prospects p
    where p.sales_id = v_sales_id and p.deleted_at is null;

  select count(*) into v_today_follow_up from public.prospect_follow_ups f
    join public.prospects p on p.id = f.prospect_id
    where p.sales_id = v_sales_id and f.activity_date = current_date;

  select count(*) into v_late_follow_up from public.prospects p
    where p.sales_id = v_sales_id and p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and coalesce(p.last_follow_up_at, p.created_at) < now() - interval '7 days';

  return query select
    v_sales_id, v_month, v_year, v_target_units,
    -- Blended figures across every assigned product -- kept for backward
    -- compatibility with existing callers; use crm_target_details for the
    -- true per-product breakdown.
    case when v_target_units = 0 then 0 else round(v_target_revenue / v_target_units, 2) end,
    case when v_target_revenue = 0 then 0 else round(v_max_commission / v_target_revenue * 100, 2) end,
    v_target_revenue, v_max_commission,
    v_closing_units,
    case when v_target_units = 0 then 0 else round(v_closing_units::numeric / v_target_units * 100, 1) end,
    greatest(v_target_units - v_closing_units::integer, 0),
    v_collection, v_estimated_commission, v_verified_commission,
    v_red, v_yellow, v_green, v_closing, v_today_prospect, v_today_follow_up, v_late_follow_up;
end;
$$;

create or replace function public.crm_branch_stats(
  p_branch_id uuid default null,
  p_month smallint default null,
  p_year smallint default null
)
returns table (
  branch_id uuid,
  period_month smallint,
  period_year smallint,
  target_units bigint,
  target_revenue numeric,
  closing_units bigint,
  achievement_percent numeric,
  collection numeric,
  active_sales_count bigint,
  pending_finance_verification bigint,
  prospects_red bigint,
  prospects_yellow bigint,
  prospects_green bigint,
  prospects_closing bigint,
  sales_performance jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch_id uuid := coalesce(p_branch_id, public.app_current_branch_id());
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
begin
  if not (
    public.app_has_permission('crm_analytics.view_all')
    or (public.app_has_permission('crm_analytics.view_branch') and v_branch_id = public.app_current_branch_id())
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  return query
  with branch_sales as (
    select e.id as sales_id, e.full_name
    from public.employees e
    join public.divisions d on d.id = e.division_id
    where e.branch_id = v_branch_id and e.deleted_at is null and e.employment_status = 'active' and d.name = 'Marketing & Sales'
  ),
  -- Pre-aggregate per Sales rep FIRST (a rep can now have one sales_targets
  -- row per assigned product) so the join below never duplicates a rep's row
  -- and double-counts their closing_units/collection.
  target_agg as (
    select st.sales_id,
           sum(st.target_units) as target_units,
           sum(st.target_units * st.selling_price_per_unit) as target_revenue
    from public.sales_targets st
    where st.period_month = v_month and st.period_year = v_year
    group by st.sales_id
  ),
  per_sales as (
    select
      bs.sales_id, bs.full_name,
      coalesce(ta.target_units, 0) as target_units,
      coalesce(ta.target_revenue, 0) as target_revenue,
      (select count(*) from public.prospects p where p.sales_id = bs.sales_id and p.status = 'closing'
        and p.closed_at is not null and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year) as closing_units,
      (select coalesce(sum(pp.amount), 0) from public.prospect_payments pp join public.prospects p on p.id = pp.prospect_id
        where p.sales_id = bs.sales_id and pp.status = 'approved'
          and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year) as collection
    from branch_sales bs
    left join target_agg ta on ta.sales_id = bs.sales_id
  )
  select
    v_branch_id, v_month, v_year,
    coalesce(sum(ps.target_units), 0)::bigint,
    coalesce(sum(ps.target_revenue), 0),
    coalesce(sum(ps.closing_units), 0)::bigint,
    case when coalesce(sum(ps.target_units), 0) = 0 then 0
      else round(coalesce(sum(ps.closing_units), 0)::numeric / sum(ps.target_units) * 100, 1) end,
    coalesce(sum(ps.collection), 0),
    (select count(*) from branch_sales)::bigint,
    (select count(*) from public.prospect_payments pp join public.prospects p on p.id = pp.prospect_id
      where p.branch_id = v_branch_id and pp.status = 'pending')::bigint,
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'red'),
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'yellow'),
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'green'),
    (select count(*) from public.prospects p where p.branch_id = v_branch_id and p.deleted_at is null and p.status = 'closing'),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
        'sales_id', ps.sales_id, 'full_name', ps.full_name,
        'target_units', ps.target_units, 'closing_units', ps.closing_units,
        'achievement_percent', case when ps.target_units = 0 then 0 else round(ps.closing_units::numeric / ps.target_units * 100, 1) end,
        'collection', ps.collection
      ) order by (case when ps.target_units = 0 then 0 else ps.closing_units::numeric / ps.target_units end) desc)
      from per_sales ps),
      '[]'::jsonb
    )
  from per_sales ps;
end;
$$;

create or replace function public.crm_sales_ranking(p_month smallint default null, p_year smallint default null, p_branch_id uuid default null)
returns table (rank bigint, sales_id uuid, full_name text, branch_name text, target_units integer, closing_units bigint, achievement_percent numeric, collection numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month smallint := coalesce(p_month, extract(month from now())::smallint);
  v_year smallint := coalesce(p_year, extract(year from now())::smallint);
begin
  if not (
    public.app_has_permission('crm_analytics.view_all')
    or (public.app_has_permission('crm_analytics.view_branch') and coalesce(p_branch_id, public.app_current_branch_id()) = public.app_current_branch_id())
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  return query
  with target_agg as (
    select st.sales_id, sum(st.target_units) as target_units
    from public.sales_targets st
    where st.period_month = v_month and st.period_year = v_year
    group by st.sales_id
  ),
  ranked as (
    select
      e.id as sales_id, e.full_name, b.name as branch_name,
      coalesce(ta.target_units, 0)::integer as target_units,
      coalesce((select count(*) from public.prospects p where p.sales_id = e.id and p.status = 'closing'
        and p.closed_at is not null and extract(month from p.closed_at) = v_month and extract(year from p.closed_at) = v_year), 0) as closing_units,
      coalesce((select sum(pp.amount) from public.prospect_payments pp join public.prospects p on p.id = pp.prospect_id
        where p.sales_id = e.id and pp.status = 'approved'
          and extract(month from pp.approved_at) = v_month and extract(year from pp.approved_at) = v_year), 0) as collection
    from public.employees e
    join public.divisions d on d.id = e.division_id
    join public.branches b on b.id = e.branch_id
    left join target_agg ta on ta.sales_id = e.id
    where e.deleted_at is null and e.employment_status = 'active' and d.name = 'Marketing & Sales'
      and (p_branch_id is null or e.branch_id = p_branch_id)
  )
  select
    row_number() over (order by (case when ranked.target_units = 0 then 0 else ranked.closing_units::numeric / ranked.target_units end) desc, ranked.closing_units desc),
    ranked.sales_id, ranked.full_name, ranked.branch_name, ranked.target_units, ranked.closing_units,
    case when ranked.target_units = 0 then 0 else round(ranked.closing_units::numeric / ranked.target_units * 100, 1) end,
    ranked.collection
  from ranked
  order by (case when ranked.target_units = 0 then 0 else ranked.closing_units::numeric / ranked.target_units end) desc, ranked.closing_units desc;
end;
$$;

-- crm_approve_payment's commission lookup was an implicit single-row
-- SELECT INTO keyed by (sales_id, month/year); with multiple product target
-- rows now possible for the same Sales/period, that pick was silently
-- non-deterministic (Postgres just takes whichever row a non-STRICT
-- SELECT INTO scans first). A payment does not yet carry which product it
-- belongs to (prospects/prospect_payments are unchanged by this refactor --
-- out of scope, see migration header), so this cannot be made fully
-- correct here; make it deterministic instead: prefer a legacy
-- (product_id-agnostic-era) row if one exists, else the earliest-created
-- product row. Flagged in the CTO review as follow-up work once
-- prospects/payments gain a product dimension.
create or replace function public.crm_approve_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_payment public.prospect_payments%rowtype;
  v_prospect public.prospects%rowtype;
  v_commission_percent numeric(5,2);
  v_commission_amount numeric(14,2);
  v_period_month smallint;
  v_period_year smallint;
begin
  if not public.app_has_permission('prospect.finance_verify') then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  select * into v_payment from public.prospect_payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Payment already decided';
  end if;

  select * into v_prospect from public.prospects where id = v_payment.prospect_id for update;

  v_period_month := extract(month from v_payment.payment_date)::smallint;
  v_period_year := extract(year from v_payment.payment_date)::smallint;

  select commission_percent into v_commission_percent
  from public.sales_targets
  where sales_id = v_prospect.sales_id and period_month = v_period_month and period_year = v_period_year
  order by product_id nulls first, created_at asc
  limit 1;
  v_commission_percent := coalesce(v_commission_percent, 0);
  v_commission_amount := round(v_payment.amount * v_commission_percent / 100, 2);

  update public.prospect_payments set
    status = 'approved',
    commission_amount = v_commission_amount,
    approved_by = v_user_id,
    approved_at = now()
  where id = p_payment_id;

  update public.prospects set
    total_collection = total_collection + v_payment.amount,
    total_commission = total_commission + v_commission_amount,
    status = case when status = 'green' then 'closing' else status end,
    closed_at = case when status = 'green' then now() else closed_at end,
    updated_by = v_user_id
  where id = v_prospect.id;

  insert into public.mkc_notifications (user_id, type, category, title, body, link)
  values (
    v_prospect.sales_id,
    'crm',
    case when v_prospect.status = 'closing' then 'closing_approved' else 'customer_verification' end,
    'Pembayaran disetujui: ' || v_prospect.customer_name,
    'Finance menyetujui ' || v_payment.payment_type || ' sebesar Rp ' || to_char(v_payment.amount, 'FM999,999,999,999'),
    '/crm/prospects/' || v_prospect.id
  );
end;
$$;

grant execute on function public.crm_upsert_product(uuid, text, text, text, numeric, numeric, text) to authenticated;
grant execute on function public.crm_set_product_sales_assignment(uuid, uuid, boolean) to authenticated;
grant execute on function public.crm_save_and_distribute_target(uuid, smallint, smallint, jsonb) to authenticated;
