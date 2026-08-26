-- ============================================================================
-- MK Connect — 0245: Company File Manager (local-storage catalog + WA delivery)
--
-- Owner's ask: a WhatsApp-driven "kirim saya file X" flow, backed by a
-- catalog of company files that are categorized and organized, but whose
-- actual bytes live on a Mac Mini at the owner's home, NOT in Supabase
-- Storage or on Vercel. This repo only ever holds METADATA (category,
-- filename, tags, description, size, checksum, and the file's path relative
-- to that Mac Mini's storage root) -- never the file content itself. The
-- separate `Filemanager` repo is a local agent that runs on the Mac Mini,
-- pushes this catalog up via /api/files/agent/sync, and later fetches the
-- matched file's bytes to POST to /api/files/agent/requests/:id/deliver
-- when someone's WhatsApp request matches one of its files.
--
-- Why the actual file never touches this table: a jsonb/bytea column here
-- would mean every company document (potentially large, potentially
-- sensitive -- contracts, legal, HR files) sits in a Supabase project this
-- repo's own docs describe as shared/free-tier. The design keeps this
-- database as the searchable INDEX only; a short-lived temp Storage bucket
-- (mkc-file-delivery-temp, below) exists purely as a relay hop while a
-- single requested file is being attached to one outbound WhatsApp message,
-- and is deleted immediately after (see lib/ai/domains/file-request.ts's
-- caller in app/api/files/agent/requests/[id]/deliver/route.ts).
-- ============================================================================

create table public.mkc_file_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.mkc_file_categories(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  slug text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_id, slug)
);

create index mkc_file_categories_parent_idx on public.mkc_file_categories (parent_id);

create table public.mkc_files (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.mkc_file_categories(id) on delete set null,
  -- Path relative to the agent's configured STORAGE_ROOT, e.g.
  -- "Legal/Kontrak/kontrak-abc-2026.pdf" -- deliberately never an absolute
  -- OS path (would leak the Mac Mini's local username/directory layout into
  -- a database shared with another application).
  agent_relative_path text not null unique,
  original_filename text not null,
  display_name text not null,
  extension text,
  mime_type text,
  size_bytes bigint not null default 0,
  checksum_sha256 text,
  tags text[] not null default '{}',
  description text,
  is_deleted boolean not null default false,
  indexed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mkc_files_category_idx on public.mkc_files (category_id) where not is_deleted;
create index mkc_files_search_idx on public.mkc_files using gin (
  to_tsvector('simple', display_name || ' ' || coalesce(description, '') || ' ' || array_to_string(tags, ' '))
) where not is_deleted;

create table public.mkc_file_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by_employee_id uuid references public.employees(id) on delete set null,
  wa_phone_number text not null,
  raw_query text not null,
  matched_file_id uuid references public.mkc_files(id) on delete set null,
  candidate_file_ids uuid[] not null default '{}',
  status text not null default 'pending_match' check (
    status in ('pending_match', 'matched', 'ambiguous', 'no_match', 'delivering', 'sent', 'failed')
  ),
  error_message text,
  wa_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index mkc_file_requests_status_idx on public.mkc_file_requests (status, created_at);
create index mkc_file_requests_wa_idx on public.mkc_file_requests (wa_phone_number, created_at desc);

alter table public.mkc_file_categories enable row level security;
alter table public.mkc_files enable row level security;
alter table public.mkc_file_requests enable row level security;

-- Application-layer access is via requirePermission('files.view' / 'files.manage')
-- in Server Actions; the Mac Mini agent and the WhatsApp webhook path both
-- use the service-role admin client (lib/supabase/admin.ts), which bypasses
-- RLS by design -- these policies are the independent second layer for any
-- direct authenticated-user access (e.g. a future in-app file browser UI).
drop policy if exists mkc_file_categories_select on public.mkc_file_categories;
create policy mkc_file_categories_select on public.mkc_file_categories
  for select using (public.app_has_permission('files.view'));

drop policy if exists mkc_file_categories_manage on public.mkc_file_categories;
create policy mkc_file_categories_manage on public.mkc_file_categories
  for all using (public.app_has_permission('files.manage'))
  with check (public.app_has_permission('files.manage'));

drop policy if exists mkc_files_select on public.mkc_files;
create policy mkc_files_select on public.mkc_files
  for select using (public.app_has_permission('files.view'));

drop policy if exists mkc_files_manage on public.mkc_files;
create policy mkc_files_manage on public.mkc_files
  for all using (public.app_has_permission('files.manage'))
  with check (public.app_has_permission('files.manage'));

drop policy if exists mkc_file_requests_select on public.mkc_file_requests;
create policy mkc_file_requests_select on public.mkc_file_requests
  for select using (public.app_has_permission('files.view'));

drop policy if exists mkc_file_requests_manage on public.mkc_file_requests;
create policy mkc_file_requests_manage on public.mkc_file_requests
  for all using (public.app_has_permission('files.manage'))
  with check (public.app_has_permission('files.manage'));

drop trigger if exists mkc_file_categories_set_updated_at on public.mkc_file_categories;
create trigger mkc_file_categories_set_updated_at
  before update on public.mkc_file_categories
  for each row execute function public.set_updated_at();

drop trigger if exists mkc_files_set_updated_at on public.mkc_files;
create trigger mkc_files_set_updated_at
  before update on public.mkc_files
  for each row execute function public.set_updated_at();

drop trigger if exists mkc_file_requests_set_updated_at on public.mkc_file_requests;
create trigger mkc_file_requests_set_updated_at
  before update on public.mkc_file_requests
  for each row execute function public.set_updated_at();

insert into public.permissions (key, description) values
  ('files.view', 'View the company file catalog (categories, files, WhatsApp request history)'),
  ('files.manage', 'Manage the company file catalog: create/rename categories, edit file metadata, resolve stuck requests')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('files.view', 'files.manage')
where r.key = 'super_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'files.view'
where r.key in ('direktur_operasional', 'hr')
on conflict do nothing;

-- Short-lived relay bucket: the Mac Mini agent has no public URL of its own
-- (it sits behind a home NAT with no port forwarding, by design -- see
-- docs/FILE_MANAGER.md), so it POSTs the requested file's bytes to this
-- app, which stages them here just long enough to hand the WhatsApp
-- connector (Whacenter) a fetchable URL, then deletes the object. Private
-- (public = false): every access is a signed URL with a 10-minute TTL,
-- mirroring services/storage.service.ts's SIGNED_URL_TTL_SECONDS. No client
-- (browser or mobile) ever uploads to this bucket directly -- only the
-- server-side admin client, from app/api/files/agent/requests/[id]/deliver.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mkc-file-delivery-temp', 'mkc-file-delivery-temp', false, 104857600, null)
on conflict (id) do nothing;

comment on table public.mkc_file_categories is
  'Category tree for the company file manager (Filemanager repo agent). Mirrors the Mac Mini''s folder structure; metadata only.';
comment on table public.mkc_files is
  'Searchable catalog of company files whose actual bytes live only on the owner''s local Mac Mini (Filemanager repo agent), never in this database.';
comment on table public.mkc_file_requests is
  'One row per "kirim saya file X" WhatsApp request, tracking match -> agent delivery -> sent/failed.';
