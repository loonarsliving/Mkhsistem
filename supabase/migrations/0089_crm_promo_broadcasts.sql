-- ============================================================================
-- MK Connect — 0089: CRM Promo Broadcast (scheduled template promos to prospects)
--
-- Answers a direct business problem surfaced while studying the sales
-- database: 113/120 prospects (94%) have never been followed up by a human.
-- Rather than lean harder on manual follow-up, Markom now defines reusable
-- promo templates (text + optional photo, per branch or all branches, on a
-- recurring cadence) and the system does the following-through:
--
--   1. crm_run_promo_cadence_dispatch() (daily cron) -- for every active
--      template whose cadence is due, enqueues one crm_promo_sends row per
--      matching prospect (not closing/inactive), with the template's
--      placeholders ({nama}/{kota}/{tipe_rumah}/{proyek}) already substituted
--      from that prospect's real data.
--   2. A separate frequent cron (every 5 min, app/api/crm/dispatch-promo-sends)
--      sends only a small batch of queued rows per tick, and only inside
--      WITA business hours -- this is what "atur waktu terbaik agar tidak
--      kena banned" actually means here: a deterministic rate limiter +
--      business-hours guard, not a black-box ML timing model. Splitting
--      enqueue (bulk, instant) from send (paced, gradual) is what makes the
--      anti-ban behavior possible without complex interval math in SQL.
--
-- Deliberately NOT reusing ai_job_queue: that queue's insert trigger
-- dispatches every row immediately (see 0065), which is correct for AI
-- replies but is exactly the "blast everything at once" pattern we're
-- avoiding here.
-- ============================================================================

insert into public.permissions (key, description) values
  ('promo_template.view', 'View CRM promo broadcast templates and send history'),
  ('promo_template.manage', 'Create, edit, and deactivate CRM promo broadcast templates')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'markom' and p.key in ('promo_template.view', 'promo_template.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key in ('direktur_utama', 'direktur_operasional') and p.key in ('promo_template.view', 'promo_template.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'kepala_cabang' and p.key = 'promo_template.view'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- crm_promo_templates
-- ----------------------------------------------------------------------------
create table public.crm_promo_templates (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  name text not null,
  message_body text not null,
  photo_storage_path text,
  photo_public_url text,
  cadence_days integer not null default 7 check (cadence_days > 0),
  send_hour_local integer not null default 10 check (send_hour_local between 0 and 23),
  is_active boolean not null default true,
  last_dispatched_at timestamptz,
  created_by uuid not null references public.employees(id) on delete restrict,
  updated_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index crm_promo_templates_active_idx on public.crm_promo_templates (is_active) where deleted_at is null;

create trigger set_updated_at before update on public.crm_promo_templates
  for each row execute function public.set_updated_at();

alter table public.crm_promo_templates enable row level security;

create policy crm_promo_templates_select on public.crm_promo_templates for select to authenticated
  using (public.app_has_permission('promo_template.view') or public.app_has_permission('promo_template.manage'));
create policy crm_promo_templates_write on public.crm_promo_templates for all to authenticated
  using (public.app_has_permission('promo_template.manage'))
  with check (public.app_has_permission('promo_template.manage'));

-- ----------------------------------------------------------------------------
-- crm_promo_sends — the pacing queue. message_body is snapshotted at enqueue
-- time (not re-read from the template) so editing/deactivating a template
-- later never changes a message that's already queued/sent.
-- ----------------------------------------------------------------------------
create table public.crm_promo_sends (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.crm_promo_templates(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  message_body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index crm_promo_sends_queued_idx on public.crm_promo_sends (created_at) where status = 'queued';
create unique index crm_promo_sends_template_prospect_queued_idx on public.crm_promo_sends (template_id, prospect_id) where status = 'queued';

alter table public.crm_promo_sends enable row level security;

create policy crm_promo_sends_select on public.crm_promo_sends for select to authenticated
  using (public.app_has_permission('promo_template.view') or public.app_has_permission('promo_template.manage'));

-- ----------------------------------------------------------------------------
-- Storage bucket for promo photos — public read (sent as WA image links),
-- write gated the same as the template row itself.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promo-templates', 'promo-templates', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy promo_templates_bucket_select on storage.objects for select to authenticated, anon
  using (bucket_id = 'promo-templates');
create policy promo_templates_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'promo-templates' and public.app_has_permission('promo_template.manage'));
create policy promo_templates_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'promo-templates' and public.app_has_permission('promo_template.manage'));

-- ----------------------------------------------------------------------------
-- crm_run_promo_cadence_dispatch: daily. For every active template whose
-- cadence has elapsed (rolling-window check against last_dispatched_at, same
-- self-healing pattern as 0087 -- not a fixed calendar anchor), enqueue one
-- send per eligible prospect with placeholders already substituted.
-- ----------------------------------------------------------------------------
create or replace function public.crm_run_promo_cadence_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template record;
  v_inserted integer;
begin
  for v_template in
    select * from public.crm_promo_templates
    where is_active and deleted_at is null
      and (last_dispatched_at is null or last_dispatched_at < now() - (cadence_days || ' days')::interval)
  loop
    insert into public.crm_promo_sends (template_id, prospect_id, message_body)
    select
      v_template.id,
      p.id,
      replace(replace(replace(replace(
        v_template.message_body,
        '{nama}', coalesce(p.customer_name, 'Bapak/Ibu')),
        '{kota}', coalesce(p.city, '')),
        '{tipe_rumah}', coalesce(p.house_type, '')),
        '{proyek}', coalesce(proj.name, '')
      )
    from public.prospects p
    left join public.crm_projects proj on proj.id = p.project_id
    where p.deleted_at is null
      and p.status not in ('closing', 'inactive')
      and (v_template.branch_id is null or p.branch_id = v_template.branch_id)
      and not exists (
        select 1 from public.crm_promo_sends s
        where s.template_id = v_template.id and s.prospect_id = p.id and s.status = 'queued'
      );
    get diagnostics v_inserted = row_count;

    update public.crm_promo_templates set last_dispatched_at = now() where id = v_template.id;
  end loop;
end;
$$;

-- Daily 22:00 UTC = 06:00 WITA, well before send_hour_local business hours start -- the sender worker below only ever sends within business hours regardless.
select cron.schedule('crm-promo-cadence-dispatch', '0 22 * * *', $$select public.crm_run_promo_cadence_dispatch();$$);

-- Every 5 minutes, ask the app to send a small paced batch of due messages.
-- The route itself enforces business hours and batch size -- this cron just
-- provides the tick.
select cron.schedule(
  'crm-promo-sends-worker',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://mkh.haluoleo.id/api/crm/dispatch-promo-sends',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
