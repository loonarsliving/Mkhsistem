-- Minimal stand-ins for the Supabase platform + existing MK Connect / villa
-- objects 0291 depends on. Columns mirror the live schema (queried 2026-10-23).
create extension if not exists pgcrypto;
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
create table public.divisions (id uuid primary key default gen_random_uuid(), branch_id uuid references public.branches(id), code text, name text, description text, is_active boolean default true, unique (branch_id, name));
create table public.roles (id uuid primary key default gen_random_uuid(), key text unique, name text);
create table public.permissions (id uuid primary key default gen_random_uuid(), key text unique, description text);
create table public.role_permissions (role_id uuid references public.roles(id), permission_id uuid references public.permissions(id), primary key (role_id, permission_id));
create table public.employees (id uuid primary key, full_name text, branch_id uuid, division_id uuid, role_id uuid, employment_status text default 'active', approval_status text default 'approved', is_active boolean default true, deleted_at timestamptz);
create table public.units (id uuid primary key default gen_random_uuid(), nomor text, status text default 'available');
create table public.housekeeping (id uuid primary key default gen_random_uuid(), unit_id uuid, unit_nomor text, tugas text, tgl date default current_date, status text default 'pending', done_at timestamptz, done_by text, created_at timestamptz default now(), jenis text default 'bersih');
create table public.audit_logs (id uuid primary key default gen_random_uuid(), table_name text, record_id uuid, action text check (action in ('INSERT','UPDATE','DELETE')), old_data jsonb, new_data jsonb, changed_by uuid, changed_at timestamptz default now());
create table public.mkc_notifications (id uuid primary key default gen_random_uuid(), user_id uuid, type text, title text, body text, link text, is_read boolean default false, metadata jsonb, created_at timestamptz default now(), category text, constraint mkc_notifications_category_check check (category is null or category = 'x'),
  -- mirrors the live mkc_notifications_type_check (missing here let 0291 ship type 'info', fixed in 0293)
  constraint mkc_notifications_type_check check (type = any (array['memo','announcement','attendance','leave_request','system','registration','crm','kpi_task','hr','finance','project','approval'])));
create table public.automation_calls (path text, body jsonb, at timestamptz default now());
create function public.automation_post(p_path text, p_body jsonb default '{}', p_timeout_ms integer default 15000) returns bigint language sql as $$ insert into public.automation_calls(path, body) values (p_path, p_body); select 1::bigint $$;
create function public.mkc_notifications_whatsapp_trigger() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger mkc_notifications_after_insert_whatsapp after insert on public.mkc_notifications for each row execute function public.mkc_notifications_whatsapp_trigger();
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
