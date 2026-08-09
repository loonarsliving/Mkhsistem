-- ============================================================================
-- MK Connect — 0196: Construction unit sales targets (SP3K) + reminders
--
-- Owner's ask: Kendari's Kepala Cabang (Fasly) has a unit-sales target for
-- September 2026 -- 17 SP3K for "Al Fath Puuwatu" at Rp160.000.000/unit.
-- "Al Fath Puuwatu" isn't a CRM project in MK Connect (it only exists as an
-- MKH Property bank account name) and Fasly holds no CRM permissions at
-- all (see KENDARI_KEPALA_CABANG_ALLOWED_PERMISSIONS), so this is a small,
-- standalone target table -- not the CRM sales_targets/branch_sales_targets
-- machinery, which assumes a crm_products row and Sales-role reps.
--
-- Deliberately no "achieved units" tracking yet -- the owner asked for the
-- target to be set and shown, not for a unit-closing input flow. Easy to
-- add a construction_target_progress table later if that's wanted.
-- ============================================================================

create table public.construction_targets (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  project_name text not null,
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null check (period_year >= 2020),
  target_units int not null check (target_units > 0),
  value_per_unit numeric(14, 2) not null check (value_per_unit > 0),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);
create index construction_targets_branch_idx on public.construction_targets (branch_id, period_year, period_month);

alter table public.construction_targets enable row level security;

create policy construction_targets_select on public.construction_targets for select
  using (
    public.app_has_permission('construction_finance.manage')
    or branch_id = (select branch_id from public.employees where id = auth.uid())
  );

comment on table public.construction_targets is
  'Standalone unit-sales targets (SP3K) for a branch''s construction project -- not tied to CRM (no crm_products row / Sales rep required). Read-only to the branch itself; writes are admin-only via direct SQL/migration for now.';

-- ----------------------------------------------------------------------------
-- construction_target_reminder_log: throttle guard so the WhatsApp reminder
-- fires at most once every 3 days per target, per the owner's ask.
-- ----------------------------------------------------------------------------
create table public.construction_target_reminder_log (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.construction_targets(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index construction_target_reminder_log_target_idx on public.construction_target_reminder_log (target_id, sent_at desc);
alter table public.construction_target_reminder_log enable row level security;

-- ----------------------------------------------------------------------------
-- construction_send_target_reminders(): every active target (current period
-- not yet fully elapsed) reminds that branch's Kepala Cabang via WhatsApp,
-- at most once every 3 days, until the target period ends.
-- ----------------------------------------------------------------------------
create or replace function public.construction_send_target_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target record;
  v_kepala record;
  v_period_end date;
  v_days_left int;
  v_total_value numeric;
  v_body text;
begin
  for v_target in select * from public.construction_targets
  loop
    v_period_end := (make_date(v_target.period_year, v_target.period_month, 1) + interval '1 month' - interval '1 day')::date;
    if v_period_end < current_date then
      continue; -- target period already over
    end if;

    if exists (
      select 1 from public.construction_target_reminder_log
      where target_id = v_target.id and sent_at >= now() - interval '3 days'
    ) then
      continue;
    end if;

    v_days_left := greatest(v_period_end - current_date, 0);
    v_total_value := v_target.target_units * v_target.value_per_unit;

    for v_kepala in
      select em.id, em.full_name from public.employees em
      join public.roles r on r.id = em.role_id
      where em.branch_id = v_target.branch_id and r.key = 'kepala_cabang'
        and em.deleted_at is null and em.employment_status = 'active' and em.phone is not null
    loop
      v_body :=
        '🎯 Pengingat Target — ' || v_target.project_name || E'\n\n' ||
        '📦 Target: ' || v_target.target_units || ' unit SP3K' || E'\n' ||
        '💰 Nilai per unit: Rp ' || to_char(v_target.value_per_unit, 'FM999,999,999,999') || E'\n' ||
        '💵 Total nilai target: Rp ' || to_char(v_total_value, 'FM999,999,999,999') || E'\n' ||
        '📅 Periode: ' || to_char(make_date(v_target.period_year, v_target.period_month, 1), 'FMMonth YYYY') || E'\n' ||
        '⏳ Sisa waktu: ' || v_days_left || ' hari lagi' || E'\n\n' ||
        'Target ini HARUS tercapai. Semangat, Pak ' || v_kepala.full_name || '! 💪';

      insert into public.mkc_notifications (user_id, type, category, title, body, link)
      values (
        v_kepala.id, 'system', 'waiting_approval',
        'Pengingat Target — ' || v_target.project_name,
        v_body,
        '/dashboard'
      );
    end loop;

    insert into public.construction_target_reminder_log (target_id) values (v_target.id);
  end loop;
end;
$$;

comment on function public.construction_send_target_reminders is
  'Every 3 days (throttled via construction_target_reminder_log), reminds each active target''s branch Kepala Cabang via WhatsApp of their unit-sales target and days remaining. Checked daily by pg_cron.';

-- Daily at 08:00 WIB (01:00 UTC); the 3-day cadence is enforced by the log throttle above.
select cron.schedule('construction-target-reminder-daily', '0 1 * * *', $$select public.construction_send_target_reminders();$$);

-- ----------------------------------------------------------------------------
-- Seed: Fasly / Kendari's September 2026 target.
-- ----------------------------------------------------------------------------
do $$
declare
  v_branch_id uuid;
begin
  select id into v_branch_id from public.branches where name = 'Kendari';
  if v_branch_id is null then
    raise exception 'Kendari branch not found';
  end if;

  insert into public.construction_targets (branch_id, project_name, period_month, period_year, target_units, value_per_unit)
  values (v_branch_id, 'Al Fath Puuwatu', 9, 2026, 17, 160000000);
end $$;

-- ----------------------------------------------------------------------------
-- construction_tukang_teaching_log: throttle guard for the AI-driven
-- tukang/construction-management coaching tip (weekly), sent to each
-- Kepala Cabang running an active construction project. WhatsApp-only,
-- no mkc_notifications row -- same pattern as sales_closing_tips_broadcast
-- (0117) and the Cashflow Teaching Engine (0129): pure automation_post
-- (pg_net) -> a dedicated Next.js endpoint that calls Gemini and sends
-- via WhatsApp directly, no UI trace.
-- ----------------------------------------------------------------------------
create table public.construction_tukang_teaching_log (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index construction_tukang_teaching_log_branch_idx on public.construction_tukang_teaching_log (branch_id, sent_at desc);
alter table public.construction_tukang_teaching_log enable row level security;

create or replace function public.construction_run_tukang_teaching_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project record;
  v_kepala record;
begin
  for v_project in select distinct branch_id from public.construction_projects where status = 'active'
  loop
    if exists (
      select 1 from public.construction_tukang_teaching_log
      where branch_id = v_project.branch_id and sent_at >= now() - interval '7 days'
    ) then
      continue;
    end if;

    select em.id, em.full_name into v_kepala
      from public.employees em
      join public.roles r on r.id = em.role_id
      where em.branch_id = v_project.branch_id and r.key = 'kepala_cabang'
        and em.deleted_at is null and em.employment_status = 'active' and em.phone is not null
      limit 1;

    if v_kepala.id is null then
      continue;
    end if;

    perform public.automation_post(
      '/api/automation/construction-tukang-tip',
      jsonb_build_object('branch_id', v_project.branch_id, 'employee_id', v_kepala.id),
      15000
    );

    insert into public.construction_tukang_teaching_log (branch_id) values (v_project.branch_id);
  end loop;
end;
$$;

comment on function public.construction_run_tukang_teaching_check is
  'Weekly (throttled via construction_tukang_teaching_log): for each branch with an active construction project, dispatches an AI-generated tukang/construction-management coaching tip to that branch''s Kepala Cabang via /api/automation/construction-tukang-tip -- WhatsApp direct, no in-app notification. Checked daily by pg_cron.';

-- Daily at 08:30 WIB (01:30 UTC), offset from the target-reminder job above.
select cron.schedule('construction-tukang-teaching-daily', '30 1 * * *', $$select public.construction_run_tukang_teaching_check();$$);
