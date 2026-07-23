-- ============================================================================
-- MK Connect — 0078: Project photo gallery (Ads Specialist creative source)
--
-- Ad creative images come from REAL photos Markom uploads for each
-- crm_projects (villa/property) row -- never AI-generated -- so the AI ads
-- pipeline (lib/meta/ads.ts, built next) has a pool of real photos per
-- project to pick the most relevant one from when assembling an ad
-- creative. crm_projects itself (0022/0028) is already readable by every
-- authenticated user, so this table follows the exact same read-everyone /
-- write-gated shape, just with a narrower crm_project_photo.manage
-- permission for the write side (only Markom + project-managing directors,
-- not everyone who can create a prospect).
-- ============================================================================

insert into public.permissions (key, description) values
  ('crm_project_photo.manage', 'Upload and manage real property photos for CRM projects (source material for ad creatives)'),
  ('ad_campaign.view', 'View Meta ad campaigns and their performance'),
  ('ad_campaign.manage', 'Create, launch, pause, and manage Meta ad campaigns (Ads Specialist module)')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'markom' and p.key in ('crm_project_photo.manage', 'ad_campaign.view', 'ad_campaign.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key in ('direktur_utama', 'direktur_operasional') and p.key in ('crm_project_photo.manage', 'ad_campaign.view', 'ad_campaign.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'kepala_cabang' and p.key = 'ad_campaign.view'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- crm_project_photos
-- ----------------------------------------------------------------------------
create table public.crm_project_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  caption text,
  uploaded_by uuid not null references public.employees(id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index crm_project_photos_project_id_idx on public.crm_project_photos (project_id) where deleted_at is null;

alter table public.crm_project_photos enable row level security;

create policy crm_project_photos_select on public.crm_project_photos for select to authenticated using (true);
create policy crm_project_photos_write on public.crm_project_photos for all to authenticated
  using (public.app_has_permission('crm_project_photo.manage'))
  with check (public.app_has_permission('crm_project_photo.manage'));

-- ----------------------------------------------------------------------------
-- Storage bucket: public read (these become public ad images anyway), write
-- gated the same as the table row itself.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-photos', 'project-photos', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy project_photos_bucket_select on storage.objects for select to authenticated, anon
  using (bucket_id = 'project-photos');
create policy project_photos_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-photos' and public.app_has_permission('crm_project_photo.manage'));
create policy project_photos_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-photos' and public.app_has_permission('crm_project_photo.manage'));
