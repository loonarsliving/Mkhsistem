-- ============================================================================
-- MK Connect — 0188: Kepala Cabang must not see closing/fee monetary values
--
-- Kepala Cabang is allowed to know a closing happened (counts, status,
-- achievement %) but the actual Rupiah value of a closing or a fee claim is
-- Super Admin / CFO territory only. Several branch-scoped surfaces were
-- leaking real amounts to Kepala Cabang (who only holds the `*.view_branch`
-- permissions -- no other role holds these, see constants/rbac.ts seed):
--
-- 1. prospect_payments RLS let prospect.view_branch read every payment row
--    (amount included) for prospects in the caller's branch -- exposed via
--    the Prospect Detail page's payment table.
-- 2. crm_branch_stats / crm_sales_stats / crm_sales_ranking / crm_monthly_trend
--    returned real `collection` (and, for crm_sales_stats, commission) figures
--    to any caller satisfying the branch-scoped permission, not just
--    company-wide (`*.view_all`) callers -- exposed on the Home Dashboard,
--    /crm/dashboard, /crm/branches/[id], /crm/sales/[id], and /crm/analytics.
-- 3. crm_sales_ranking additionally ignored branch scoping entirely when no
--    p_branch_id was passed (the actual call site never passes one), so a
--    Kepala Cabang saw company-wide sales collection figures, not just their
--    own branch's.
-- 4. The loonars_closing_approved sync branch wrote the raw closing price
--    into prospects.notes ("... Harga: 1.500.000.000"), readable by anyone
--    with prospect.view_branch on that branch.
--
-- Fix: redact monetary fields to NULL (not 0 -- 0 would itself be a false
-- claim about the amount) whenever the caller only holds the branch-scoped
-- permission, keep everything unchanged for `*.view_all` holders (Finance/
-- CFO, Direktur, Super Admin) and for a Sales rep looking at their own row.
-- Frontend components must treat these fields as "hide the value", not
-- "format as currency" -- see accompanying app-layer changes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. prospect_payments: drop the branch-wide grant. Kepala Cabang no longer
--    has any path to prospect_payments rows; Sales still sees their own via
--    the `p.sales_id = auth.uid()` clause, Finance/view_all/recorder unaffected.
-- ----------------------------------------------------------------------------
drop policy if exists prospect_payments_select on public.prospect_payments;

create policy prospect_payments_select on public.prospect_payments for select to authenticated
  using (
    recorded_by = auth.uid()
    or public.app_has_permission('prospect.finance_verify')
    or public.app_has_permission('prospect.view_all')
    or exists (
      select 1 from public.prospects p where p.id = prospect_payments.prospect_id and p.sales_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 2. crm_sales_stats -- null out collection/commission when the caller is
--    viewing someone else's numbers through the branch-scoped permission
--    only (a Sales rep viewing their own stats is unaffected).
-- ----------------------------------------------------------------------------
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
  v_hide_amounts boolean := false;
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
    -- Viewing another Sales rep's numbers without company-wide access means
    -- the caller only got in via the branch-scoped grant (Kepala Cabang) --
    -- closing/fee value is Super Admin/CFO territory, not theirs to see.
    v_hide_amounts := not public.app_has_permission('sales_target.view_all');
  end if;

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

  if v_hide_amounts then
    v_collection := null;
    v_estimated_commission := null;
    v_verified_commission := null;
  end if;

  return query select
    v_sales_id, v_month, v_year, v_target_units,
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

-- ----------------------------------------------------------------------------
-- 3. crm_branch_stats -- null out the branch-total collection and every
--    per-sales `collection` figure in sales_performance when the caller
--    doesn't hold crm_analytics.view_all.
-- ----------------------------------------------------------------------------
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
  v_hide_amounts boolean;
begin
  if not (
    public.app_has_permission('crm_analytics.view_all')
    or (public.app_has_permission('crm_analytics.view_branch') and v_branch_id = public.app_current_branch_id())
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  v_hide_amounts := not public.app_has_permission('crm_analytics.view_all');

  return query
  with branch_sales as (
    select e.id as sales_id, e.full_name
    from public.employees e
    join public.divisions d on d.id = e.division_id
    where e.branch_id = v_branch_id and e.deleted_at is null and e.employment_status = 'active' and d.name = 'Marketing & Sales'
  ),
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
    case when v_hide_amounts then null else coalesce(sum(ps.collection), 0) end,
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
        'collection', case when v_hide_amounts then null else ps.collection end
      ) order by (case when ps.target_units = 0 then 0 else ps.closing_units::numeric / ps.target_units end) desc)
      from per_sales ps),
      '[]'::jsonb
    )
  from per_sales ps;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. crm_sales_ranking -- lock the branch scope for branch-only callers
--    (previously a null p_branch_id meant "every branch" even for a Kepala
--    Cabang caller, since the permission check only validated p_branch_id
--    *when supplied*) and null out `collection` for the same callers.
-- ----------------------------------------------------------------------------
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
  v_branch_id uuid := p_branch_id;
  v_hide_amounts boolean;
begin
  if not (
    public.app_has_permission('crm_analytics.view_all')
    or (public.app_has_permission('crm_analytics.view_branch') and coalesce(p_branch_id, public.app_current_branch_id()) = public.app_current_branch_id())
  ) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;

  v_hide_amounts := not public.app_has_permission('crm_analytics.view_all');
  if v_hide_amounts then
    v_branch_id := public.app_current_branch_id();
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
      and (v_branch_id is null or e.branch_id = v_branch_id)
  )
  select
    row_number() over (order by (case when ranked.target_units = 0 then 0 else ranked.closing_units::numeric / ranked.target_units end) desc, ranked.closing_units desc),
    ranked.sales_id, ranked.full_name, ranked.branch_name, ranked.target_units, ranked.closing_units,
    case when ranked.target_units = 0 then 0 else round(ranked.closing_units::numeric / ranked.target_units * 100, 1) end,
    case when v_hide_amounts then null else ranked.collection end
  from ranked
  order by (case when ranked.target_units = 0 then 0 else ranked.closing_units::numeric / ranked.target_units end) desc, ranked.closing_units desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. crm_monthly_trend -- null out `collection` whenever the caller isn't
--    company-wide (view_all) and isn't looking at their own p_sales_id.
-- ----------------------------------------------------------------------------
create or replace function public.crm_monthly_trend(
  p_months_back smallint default 6,
  p_branch_id uuid default null,
  p_sales_id uuid default null
)
returns table (
  period_month smallint,
  period_year smallint,
  target_units integer,
  closing_units bigint,
  achievement_percent numeric,
  collection numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_hide_amounts boolean;
begin
  if p_sales_id is not null then
    if p_sales_id <> v_caller and not (
      public.app_has_permission('sales_target.view_all')
      or (
        public.app_has_permission('sales_target.view_branch')
        and exists (select 1 from public.employees e where e.id = p_sales_id and e.branch_id = public.app_current_branch_id())
      )
    ) then
      raise exception 'Insufficient permission' using errcode = '42501';
    end if;
    v_hide_amounts := p_sales_id <> v_caller and not public.app_has_permission('sales_target.view_all');
  else
    if not (
      public.app_has_permission('crm_analytics.view_all')
      or (public.app_has_permission('crm_analytics.view_branch') and coalesce(p_branch_id, public.app_current_branch_id()) = public.app_current_branch_id())
    ) then
      raise exception 'Insufficient permission' using errcode = '42501';
    end if;
    v_hide_amounts := not public.app_has_permission('crm_analytics.view_all');
  end if;

  return query
  with months as (
    select
      extract(month from d)::smallint as period_month,
      extract(year from d)::smallint as period_year
    from generate_series(
      date_trunc('month', current_date) - ((greatest(p_months_back, 1) - 1)::text || ' months')::interval,
      date_trunc('month', current_date),
      interval '1 month'
    ) as d
  )
  select
    m.period_month,
    m.period_year,
    coalesce((
      select sum(st.target_units)::integer
      from public.sales_targets st
      join public.employees e on e.id = st.sales_id
      join public.divisions dv on dv.id = e.division_id and dv.name = 'Marketing & Sales'
      where st.period_month = m.period_month and st.period_year = m.period_year
        and (p_sales_id is null or st.sales_id = p_sales_id)
        and (p_branch_id is null or e.branch_id = p_branch_id)
    ), 0),
    coalesce((
      select count(*)
      from public.prospects p
      where p.status = 'closing' and p.closed_at is not null
        and extract(month from p.closed_at) = m.period_month and extract(year from p.closed_at) = m.period_year
        and (p_sales_id is null or p.sales_id = p_sales_id)
        and (p_branch_id is null or p.branch_id = p_branch_id)
    ), 0)::bigint,
    case
      when coalesce((
        select sum(st.target_units)
        from public.sales_targets st
        join public.employees e on e.id = st.sales_id
        join public.divisions dv on dv.id = e.division_id and dv.name = 'Marketing & Sales'
        where st.period_month = m.period_month and st.period_year = m.period_year
          and (p_sales_id is null or st.sales_id = p_sales_id)
          and (p_branch_id is null or e.branch_id = p_branch_id)
      ), 0) = 0 then 0
      else round(
        coalesce((
          select count(*) from public.prospects p
          where p.status = 'closing' and p.closed_at is not null
            and extract(month from p.closed_at) = m.period_month and extract(year from p.closed_at) = m.period_year
            and (p_sales_id is null or p.sales_id = p_sales_id)
            and (p_branch_id is null or p.branch_id = p_branch_id)
        ), 0)::numeric
        / (
          select sum(st.target_units)
          from public.sales_targets st
          join public.employees e on e.id = st.sales_id
          join public.divisions dv on dv.id = e.division_id and dv.name = 'Marketing & Sales'
          where st.period_month = m.period_month and st.period_year = m.period_year
            and (p_sales_id is null or st.sales_id = p_sales_id)
            and (p_branch_id is null or e.branch_id = p_branch_id)
        ) * 100, 1)
    end,
    case when v_hide_amounts then null else coalesce((
      select sum(pp.amount)
      from public.prospect_payments pp
      join public.prospects p on p.id = pp.prospect_id
      where pp.status = 'approved'
        and extract(month from pp.approved_at) = m.period_month and extract(year from pp.approved_at) = m.period_year
        and (p_sales_id is null or p.sales_id = p_sales_id)
        and (p_branch_id is null or p.branch_id = p_branch_id)
    ), 0) end
  from months m
  order by m.period_year, m.period_month;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Stop writing the closing price into prospects.notes for loonars-sales
--    auto-synced closings (CREATE OR REPLACE with the full live body -- see
--    0175's header for why this matters -- plus this one wording change),
--    and scrub the price back out of every already-synced row.
-- ----------------------------------------------------------------------------
update public.prospects
set notes = regexp_replace(notes, ', Harga: [^,]*$', '')
where notes like 'Auto-synced from loonars-sales.%, Harga:%';

create or replace function public.sync_inbound(p_idempotency_key text, p_event_type text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
  v_provided text;
  v_sync_log_id uuid;
  v_target_ref text;
  v_mkc_payment_id uuid;
  v_admin record;
  v_branch_id uuid;
  v_employee record;
  v_phone_norm text;
  v_prospect_id uuid;
  v_city text;
  v_closing_id uuid;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'mk_sync_shared_secret';
  v_provided := coalesce(
    current_setting('request.headers', true)::json ->> 'x-sync-secret',
    current_setting('request.header.x-sync-secret', true)
  );
  if v_secret is null or v_provided is distinct from v_secret then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  insert into public.sync_log (direction, event_type, source_table, source_id, idempotency_key, payload, status)
  values ('inbound', p_event_type, 'mkh_property', gen_random_uuid(), p_idempotency_key, p_payload, 'sent')
  on conflict (idempotency_key) do nothing
  returning id into v_sync_log_id;

  if v_sync_log_id is null then
    select target_ref into v_target_ref from public.sync_log where idempotency_key = p_idempotency_key;
    return jsonb_build_object('status', 'duplicate', 'target_ref', v_target_ref);
  end if;

  begin
    if p_event_type = 'finance_payment_confirmed' then
      v_mkc_payment_id := (p_payload ->> 'mkc_payment_id')::uuid;

      update public.prospect_payments set
        finance_confirmed_at = coalesce((p_payload ->> 'confirmed_at')::timestamptz, now()),
        finance_confirmed_by = coalesce(p_payload ->> 'confirmed_by', 'mkh_property'),
        finance_reference_no = p_payload ->> 'jurnal_no'
      where id = v_mkc_payment_id;

      if not found then
        raise exception 'prospect_payments % not found', v_mkc_payment_id;
      end if;

      v_target_ref := v_mkc_payment_id::text;

    elsif p_event_type = 'finance_expense_submitted' then
      select id into v_branch_id from public.branches where lower(name) = lower(p_payload ->> 'branch_name') limit 1;
      if v_branch_id is not null then
        for v_admin in
          select em.id from public.employees em
          join public.roles r on r.id = em.role_id
          where em.branch_id = v_branch_id and em.deleted_at is null and em.employment_status = 'active' and r.key = 'kepala_cabang'
        loop
          insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
          values (
            v_admin.id, 'system', 'finance_expense_pending_verification',
            'Pengajuan Baru Menunggu Verifikasi — ' || coalesce(p_payload ->> 'proyek_nama', p_payload ->> 'proyek', '-'),
            '🧾 Item: ' || coalesce(p_payload ->> 'item', '-')
              || case when coalesce(p_payload ->> 'supplier', '') <> '' then ' (' || (p_payload ->> 'supplier') || ')' else '' end
              || E'\n💰 Nilai: Rp ' || to_char(coalesce((p_payload ->> 'nominal')::numeric, 0), 'FM999,999,999,999')
              || E'\n📝 Keterangan: ' || coalesce(p_payload ->> 'keterangan', '-')
              || E'\n👤 Diinput oleh: ' || coalesce(p_payload ->> 'admin_email', '-')
              || E'\n\n🔗 Verifikasi di sini: ' || coalesce(p_payload ->> 'verification_link', 'https://finance.haluoleo.id/verifikasi.html'),
            coalesce(p_payload ->> 'verification_link', 'https://finance.haluoleo.id/verifikasi.html'),
            jsonb_build_object('pengajuan_id', p_payload ->> 'pengajuan_id', 'proyek', p_payload ->> 'proyek')
          );
        end loop;
      end if;
      v_target_ref := p_payload ->> 'pengajuan_id';

    elsif p_event_type = 'finance_expense_approved' then
      for v_admin in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_admin.id, 'system', 'finance_expense_alert',
          'Pengeluaran Disetujui — ' || coalesce(p_payload ->> 'proyek_nama', p_payload ->> 'proyek', '-'),
          '🧾 Item: ' || coalesce(p_payload ->> 'item', '-')
            || case when coalesce(p_payload ->> 'supplier', '') <> '' then ' (' || (p_payload ->> 'supplier') || ')' else '' end
            || E'\n💰 Nilai: Rp ' || to_char(coalesce((p_payload ->> 'nominal')::numeric, 0), 'FM999,999,999,999')
            || E'\n📝 Keterangan: ' || coalesce(p_payload ->> 'keterangan', '-')
            || E'\n👤 Diinput oleh: ' || coalesce(p_payload ->> 'admin_email', '-')
            || E'\n✅ Disetujui oleh: ' || coalesce(p_payload ->> 'approved_by', '-'),
          '/hr/finance-sync',
          jsonb_build_object('pengajuan_id', p_payload ->> 'pengajuan_id', 'proyek', p_payload ->> 'proyek')
        );
      end loop;
      v_target_ref := p_payload ->> 'pengajuan_id';

    elsif p_event_type = 'finance_branch_balance_updated' then
      select id into v_branch_id from public.branches where lower(name) = lower(p_payload ->> 'branch_name') limit 1;
      if v_branch_id is null then
        raise exception 'Unmapped branch name "%": add it to MK Connect''s branches table before this balance can sync.',
          p_payload ->> 'branch_name';
      end if;

      insert into public.finance_branch_balances (branch_id, branch_name, saldo, synced_at)
      values (
        v_branch_id, p_payload ->> 'branch_name', coalesce((p_payload ->> 'saldo')::numeric, 0),
        coalesce((p_payload ->> 'as_of')::timestamptz, now())
      )
      on conflict (branch_id) do update set
        branch_name = excluded.branch_name,
        saldo = excluded.saldo,
        synced_at = excluded.synced_at,
        updated_at = now()
      where excluded.synced_at >= public.finance_branch_balances.synced_at;

      v_target_ref := v_branch_id::text;

    elsif p_event_type = 'loonars_fee_submitted' then
      insert into public.loonars_fee_wa_requests (fee_id, proyek, unit, buyer, marketing, fee_amount)
      values (
        (p_payload ->> 'fee_id')::bigint, p_payload ->> 'proyek', p_payload ->> 'unit',
        p_payload ->> 'buyer', p_payload ->> 'marketing', coalesce((p_payload ->> 'fee_amount')::numeric, 0)
      )
      on conflict (fee_id) do nothing;

      for v_admin in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_admin.id, 'system', 'loonars_fee_alert',
          'Pengajuan Fee — Unit ' || coalesce(p_payload ->> 'unit', '-'),
          'Marketing ' || coalesce(p_payload ->> 'marketing', '-')
            || ' mengajukan fee closing unit ' || coalesce(p_payload ->> 'unit', '-')
            || ' (' || coalesce(p_payload ->> 'proyek', '-') || ')'
            || E'\nPembeli: ' || coalesce(p_payload ->> 'buyer', '-')
            || E'\nNilai fee: Rp ' || to_char(coalesce((p_payload ->> 'fee_amount')::numeric, 0), 'FM999,999,999,999')
            || E'\n\n💬 Balas *YA* di WhatsApp ini untuk menyetujui (sementara, selama CFO belum bertugas di halaman Verifikasi Pengajuan).',
          '/hr/finance-sync',
          jsonb_build_object('fee_id', p_payload ->> 'fee_id', 'proyek', p_payload ->> 'proyek')
        );
      end loop;
      v_target_ref := p_payload ->> 'fee_id';

    elsif p_event_type = 'loonars_fee_decided' then
      for v_admin in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_admin.id, 'system', 'loonars_fee_alert',
          (case when p_payload ->> 'status' = 'approved' then 'Fee Disetujui' else 'Fee Ditolak' end)
            || ' — Unit ' || coalesce(p_payload ->> 'unit', '-'),
          'Fee marketing ' || coalesce(p_payload ->> 'marketing', '-')
            || ' untuk unit ' || coalesce(p_payload ->> 'unit', '-')
            || ' (' || coalesce(p_payload ->> 'proyek', '-') || ') '
            || (case when p_payload ->> 'status' = 'approved' then 'disetujui' else 'ditolak' end)
            || ' oleh ' || coalesce(p_payload ->> 'verified_by', 'CFO') || '.'
            || E'\nPembeli: ' || coalesce(p_payload ->> 'buyer', '-')
            || E'\nNilai fee: Rp ' || to_char(coalesce((p_payload ->> 'fee_amount')::numeric, 0), 'FM999,999,999,999'),
          '/hr/finance-sync',
          jsonb_build_object('fee_id', p_payload ->> 'fee_id', 'proyek', p_payload ->> 'proyek')
        );
      end loop;
      v_target_ref := p_payload ->> 'fee_id';

    elsif p_event_type = 'loonars_closing_approved' then
      v_phone_norm := regexp_replace(coalesce(p_payload ->> 'phone', ''), '[^0-9]', '', 'g');

      if v_phone_norm = '' then
        insert into public.loonars_integration_log (event_type, fee_id, phone, status, detail, payload)
        values ('loonars_closing_approved', p_payload ->> 'fee_id', p_payload ->> 'phone', 'error',
          'Empty/invalid phone in payload', p_payload);
        v_target_ref := null;
      else
        select e.id, e.branch_id, b.name as branch_name into v_employee
        from public.employees e
        join public.branches b on b.id = e.branch_id
        where regexp_replace(e.phone, '[^0-9]', '', 'g') = v_phone_norm
          and e.deleted_at is null and e.employment_status = 'active'
        limit 1;

        if v_employee.id is null then
          insert into public.loonars_integration_log (event_type, fee_id, phone, status, detail, payload)
          values ('loonars_closing_approved', p_payload ->> 'fee_id', p_payload ->> 'phone', 'unmatched',
            'No active employee matches this phone number', p_payload);
          v_target_ref := null;
        else
          v_city := coalesce(v_employee.branch_name, 'N/A');

          -- No price/nilai in the human-readable notes: this row is visible
          -- to Kepala Cabang via prospect.view_branch, and the actual
          -- closing value is Super Admin/CFO territory only (loonars_closings
          -- / loonars_fee already carry the real price under RLS that
          -- excludes Kepala Cabang).
          insert into public.prospects (
            customer_name, phone, house_type, city, lead_source, status,
            sales_id, branch_id, closed_at, notes, created_by, updated_by
          )
          values (
            coalesce(p_payload ->> 'buyer', 'Closing Loonars Villa'),
            p_payload ->> 'phone',
            coalesce(p_payload ->> 'unit', '-'),
            v_city,
            'other',
            'closing',
            v_employee.id, v_employee.branch_id, now(),
            'Auto-synced from loonars-sales. Proyek: ' || coalesce(p_payload ->> 'proyek', '-')
              || ', Unit: ' || coalesce(p_payload ->> 'unit', '-'),
            null, null
          )
          on conflict (phone_normalized) where deleted_at is null do update set
            status = 'closing',
            sales_id = excluded.sales_id,
            branch_id = excluded.branch_id,
            closed_at = excluded.closed_at,
            notes = excluded.notes,
            updated_at = now()
          returning id into v_prospect_id;

          insert into public.loonars_integration_log
            (event_type, fee_id, phone, matched_employee_id, prospect_id, status, payload)
          values (
            'loonars_closing_approved', p_payload ->> 'fee_id', p_payload ->> 'phone',
            v_employee.id, v_prospect_id, 'matched', p_payload
          );
          v_target_ref := v_prospect_id::text;
        end if;
      end if;

    elsif p_event_type = 'loonars_closing_declared' then
      select e.id, e.branch_id into v_employee
      from public.employees e
      join auth.users u on u.id = e.id
      where lower(u.email) = lower(coalesce(p_payload ->> 'marketing_email', ''))
        and e.deleted_at is null and e.employment_status = 'active'
      limit 1;

      insert into public.loonars_closings (
        aset_id, proyek, blok, buyer, nik, phone, address, tipe, price, tgl,
        marketing_name, marketing_email, matched_employee_id, branch_id, status
      ) values (
        (p_payload ->> 'aset_id')::bigint,
        p_payload ->> 'proyek', p_payload ->> 'blok', p_payload ->> 'buyer',
        p_payload ->> 'nik', p_payload ->> 'phone', p_payload ->> 'address', p_payload ->> 'tipe',
        nullif(p_payload ->> 'price', '')::numeric, nullif(p_payload ->> 'tgl', '')::date,
        p_payload ->> 'marketing_name', p_payload ->> 'marketing_email', v_employee.id, v_employee.branch_id,
        'pending_verification'
      )
      on conflict (aset_id) do update set
        proyek = excluded.proyek, blok = excluded.blok, buyer = excluded.buyer,
        nik = excluded.nik, phone = excluded.phone, address = excluded.address,
        tipe = excluded.tipe, price = excluded.price, tgl = excluded.tgl,
        marketing_name = excluded.marketing_name, marketing_email = excluded.marketing_email,
        matched_employee_id = excluded.matched_employee_id, branch_id = excluded.branch_id,
        status = 'pending_verification', verified_by = null, verified_at = null, reject_reason = null,
        fee_requested = false, fee_amount = null, fee_phone = null, fee_requested_at = null,
        updated_at = now()
      returning id into v_closing_id;

      for v_admin in
        select em.id from public.employees em
        join public.roles r on r.id = em.role_id
        where em.deleted_at is null and em.employment_status = 'active' and r.key = 'super_admin'
      loop
        insert into public.mkc_notifications (user_id, type, category, title, body, link, metadata)
        values (
          v_admin.id, 'system', 'loonars_fee_alert',
          'Closing Baru — Unit ' || coalesce(p_payload ->> 'blok', '-'),
          coalesce(p_payload ->> 'marketing_name', '-') || ' menutup unit ' || coalesce(p_payload ->> 'blok', '-')
            || ' (' || coalesce(p_payload ->> 'proyek', '-') || ')'
            || E'\nPembeli: ' || coalesce(p_payload ->> 'buyer', '-')
            || E'\nNilai: Rp ' || to_char(coalesce((p_payload ->> 'price')::numeric, 0), 'FM999,999,999,999')
            || E'\nMohon verifikasi apakah dana sudah masuk.',
          '/crm/finance',
          jsonb_build_object('loonars_closing_id', v_closing_id, 'aset_id', p_payload ->> 'aset_id')
        );
      end loop;

      v_target_ref := v_closing_id::text;

    else
      update public.sync_log set status = 'skipped', last_error = 'Unknown event_type: ' || p_event_type, updated_at = now()
        where id = v_sync_log_id;
      return jsonb_build_object('status', 'skipped');
    end if;

    update public.sync_log set status = 'succeeded', target_ref = v_target_ref, updated_at = now() where id = v_sync_log_id;
    return jsonb_build_object('status', 'ok', 'target_ref', v_target_ref);
  exception when others then
    update public.sync_log set status = 'failed', last_error = left(sqlerrm, 2000), updated_at = now() where id = v_sync_log_id;
    raise;
  end;
end;
$$;

comment on function public.sync_inbound is
  'PostgREST-callable receiver for MKH Property -> MK Connect sync events (finance_payment_confirmed, finance_expense_submitted, finance_expense_approved, finance_branch_balance_updated, loonars_fee_submitted, loonars_fee_decided, loonars_closing_approved, loonars_closing_declared). Authenticated via X-Sync-Secret header against Supabase Vault, not JWT.';
