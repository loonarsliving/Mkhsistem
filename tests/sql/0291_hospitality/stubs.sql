-- Minimal stand-ins for the Supabase platform + existing MK Connect / villa
-- objects 0291 depends on. Columns mirror the live schema (queried 2026-10-23).
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
set search_path = public, extensions;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage; create schema cron;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, storage to authenticated, anon, service_role;

create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant select, insert on storage.objects to authenticated;

create table cron.job (jobid serial, jobname text unique, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname, schedule, command) values (n, s, c) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create publication supabase_realtime;

create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create table public.branches (id uuid primary key default gen_random_uuid(), code text unique, name text, city text, is_head_office boolean default false, is_active boolean default true);
create table public.divisions (id uuid primary key default gen_random_uuid(), branch_id uuid references public.branches(id), code text, name text, description text, is_active boolean default true, deleted_at timestamptz, unique (branch_id, name));
create table public.roles (id uuid primary key default gen_random_uuid(), key text unique, name text);
create table public.permissions (id uuid primary key default gen_random_uuid(), key text unique, description text);
create table public.role_permissions (role_id uuid references public.roles(id), permission_id uuid references public.permissions(id), primary key (role_id, permission_id));
create table public.positions (id uuid primary key default gen_random_uuid(), code text, name text);
create table public.employees (id uuid primary key, full_name text, branch_id uuid, division_id uuid, position_id uuid, role_id uuid, employment_status text default 'active', approval_status text default 'approved', is_active boolean default true, deleted_at timestamptz);
create table public.units (id uuid primary key default gen_random_uuid(), nomor text, status text default 'available');
create table public.housekeeping (id uuid primary key default gen_random_uuid(), unit_id uuid, unit_nomor text, tugas text, tgl date default current_date, status text default 'pending', done_at timestamptz, done_by text, created_at timestamptz default now(), jenis text default 'bersih');
create table public.audit_logs (id uuid primary key default gen_random_uuid(), table_name text, record_id uuid, action text check (action in ('INSERT','UPDATE','DELETE')), old_data jsonb, new_data jsonb, changed_by uuid, changed_at timestamptz default now());
create table public.mkc_notifications (id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, body text, link text, is_read boolean default false, metadata jsonb, created_at timestamptz default now(), category text, status text not null default 'unread' check (status in ('unread', 'read', 'archived')), constraint mkc_notifications_category_check check (category is null or category = 'x'),
  -- mirrors the live mkc_notifications_type_check (missing here let 0291 ship type 'info', fixed in 0293)
  constraint mkc_notifications_type_check check (type = any (array['memo','announcement','attendance','leave_request','system','registration','crm','kpi_task','hr','finance','project','approval'])));
create table public.automation_calls (path text, body jsonb, at timestamptz default now());
create function public.automation_post(p_path text, p_body jsonb default '{}', p_timeout_ms integer default 15000) returns bigint language sql as $$ insert into public.automation_calls(path, body) values (p_path, p_body); select 1::bigint $$;
create function public.mkc_notifications_whatsapp_trigger() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger mkc_notifications_after_insert_whatsapp after insert on public.mkc_notifications for each row execute function public.mkc_notifications_whatsapp_trigger();
-- mirrors the live push trigger (0054/0176): every notification row is POSTed to /api/push/send
create function public.mkc_notifications_push_trigger() returns trigger language plpgsql as $$ begin perform public.automation_post('/api/push/send', jsonb_build_object('notification_id', new.id), 5000); return new; end $$;
create trigger mkc_notifications_after_insert_push after insert on public.mkc_notifications for each row execute function public.mkc_notifications_push_trigger();
create function public.app_has_permission(p_permission_key text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employees e join public.role_permissions rp on rp.role_id = e.role_id join public.permissions p on p.id = rp.permission_id
                 where e.id = auth.uid() and e.deleted_at is null and p.key = p_permission_key) $$;
grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public grant select on tables to authenticated;
grant select on all tables in schema public to authenticated;

-- Seed mirroring production shape
insert into public.branches (code, name) values ('LPL', 'Loonars Private Living'), ('JOG', 'Jogja');
insert into public.divisions (branch_id, code, name) select id, v.c, v.n from public.branches, (values ('LPL-FO','Front Office'),('LPL-SEC','Security'),('LPL-HEAD','Head of Loonars Villa')) v(c,n) where code = 'LPL';
insert into public.divisions (branch_id, code, name) select id, 'JOG-PROD', 'Produksi' from public.branches where code = 'JOG';
insert into public.roles (key, name) values ('super_admin','Super Admin'), ('staff','Staff'), ('pending','Pending');
insert into public.permissions (key) values ('dashboard.view');

-- ---- 0294 dependencies (villa / CRM / siteplan / markom), columns as live ----
create table public.bookings (id uuid primary key default gen_random_uuid(), unit_id uuid, unit_nomor text, status text default 'terjadwal',
  tgl_checkin date, tgl_checkout date, checkin_at timestamptz, checkout_at timestamptz, kol_voucher_id uuid, created_at timestamptz default now());
create table public.villa_room_maintenance (unit_id uuid primary key, tutup_mulai date, tutup_sampai date, alasan text);
create table public.villa_kol_vouchers (id uuid primary key default gen_random_uuid(), kode text unique check (kode ~ '^KOL-[A-Z0-9]{6}$'), untuk text,
  malam_gratis integer check (malam_gratis between 1 and 7), berlaku_sampai date, aktif boolean default true, catatan text, dibuat_lewat text default 'wa', created_at timestamptz default now());
create table public.prospects (id uuid primary key default gen_random_uuid(), customer_name text, phone text, project_id uuid, house_type text, city text,
  lead_source text, notes text, status text default 'red', sales_id uuid, branch_id uuid, last_follow_up_at timestamptz, deleted_at timestamptz,
  lead_temperature text default 'cold', created_at timestamptz default now(), updated_by uuid,
  -- mirrors live (0303 needs them)
  phone_normalized text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored,
  ai_mode text not null default 'nurture' check (ai_mode in ('nurture', 'standby')), updated_at timestamptz default now());
create unique index prospects_phone_normalized_key on public.prospects (phone_normalized) where deleted_at is null;
create table public.crm_projects (id uuid primary key default gen_random_uuid(), name text, city text, project_type text, branch_id uuid);
create table public.meta_ad_campaigns (id uuid primary key default gen_random_uuid(), name text, headline text, project_id uuid references public.crm_projects(id),
  branch_id uuid not null references public.branches(id), meta_ad_id text, meta_adset_id text, meta_creative_id text,
  status text not null default 'active', welcome_message text, updated_at timestamptz not null default now());
create table public.prospect_follow_ups (id uuid primary key default gen_random_uuid(), prospect_id uuid references public.prospects(id), activity_type text,
  activity_date date, activity_time time, notes text, created_by uuid, created_at timestamptz default now());
create function public.crm_add_follow_up(p_prospect_id uuid, p_activity_type text, p_activity_date date, p_activity_time time, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v public.prospects%rowtype;
begin
  if not public.app_has_permission('prospect.follow_up_create') then raise exception 'Insufficient permission' using errcode = '42501'; end if;
  select * into v from public.prospects where id = p_prospect_id;
  if not (v.sales_id = auth.uid() or public.app_has_permission('prospect.manage')) then raise exception 'Insufficient permission' using errcode = '42501'; end if;
  insert into public.prospect_follow_ups (prospect_id, activity_type, activity_date, activity_time, notes, created_by)
  values (p_prospect_id, p_activity_type, p_activity_date, p_activity_time, p_notes, auth.uid()) returning id into v_id;
  update public.prospects set last_follow_up_at = now(), status = case when status in ('red','inactive') then 'yellow' else status end where id = p_prospect_id;
  return v_id;
end $$;
create table public.loonars_projects (id uuid primary key default gen_random_uuid(), kode text, branch_id uuid);
create table public.loonars_units (id uuid primary key default gen_random_uuid(), project_id uuid, blok text, tipe text, status text default 'tersedia');
create table public.loonars_unit_purchases (id uuid primary key default gen_random_uuid(), unit_id uuid, marketing_employee_id uuid, transaction_type text,
  status text, booking_fee numeric, transaction_date date, verified_at timestamptz, reject_reason text, branch_id uuid,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table public.loonars_unit_fee_requests (id uuid primary key default gen_random_uuid(), purchase_id uuid, status text, created_at timestamptz default now());
create table public.markom_content_submissions (id uuid primary key default gen_random_uuid(), branch_id uuid, status text, published_at timestamptz,
  deleted_at timestamptz, updated_at timestamptz default now());
create table public.sales_targets (id uuid primary key default gen_random_uuid(), sales_id uuid, period_month int, period_year int, target_units int);
grant select on all tables in schema public to authenticated;
