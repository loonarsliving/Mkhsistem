-- ============================================================================
-- MK Connect — 0141: Multi-photo (carousel/slide) Meta ads
--
-- meta_ad_campaigns.photo_id only ever pointed at ONE crm_project_photos
-- row, so every ad -- AI-drafted or manually launched -- was hard-limited
-- to a single image, even though Meta's Click-to-WhatsApp ads support a
-- carousel format (2-10 photo cards a lead can swipe through). This adds
-- the many-photos-per-campaign join table; photo_id itself is left alone
-- (still populated with the first photo, so every existing thumbnail
-- query/display keeps working untouched) -- meta_ad_campaign_photos is the
-- new source of truth for "every photo this ad actually uses", ordered.
-- ============================================================================

create table public.meta_ad_campaign_photos (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.meta_ad_campaigns(id) on delete cascade,
  photo_id uuid not null references public.crm_project_photos(id),
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (campaign_id, photo_id)
);
create index meta_ad_campaign_photos_campaign_idx on public.meta_ad_campaign_photos (campaign_id, display_order);

alter table public.meta_ad_campaign_photos enable row level security;

-- Mirrors meta_ad_campaigns' own select/write policies (0079) exactly,
-- joined back to the parent campaign's branch_id since this table has none
-- of its own.
create policy "meta_ad_campaign_photos_select" on public.meta_ad_campaign_photos for select to authenticated
  using (
    exists (
      select 1 from public.meta_ad_campaigns c
      where c.id = campaign_id
        and (
          public.app_has_permission('ad_campaign.manage')
          or (public.app_has_permission('ad_campaign.view') and c.branch_id = public.app_current_branch_id())
        )
    )
  );
create policy "meta_ad_campaign_photos_write" on public.meta_ad_campaign_photos for all to authenticated
  using (public.app_has_permission('ad_campaign.manage'))
  with check (public.app_has_permission('ad_campaign.manage'));

comment on table public.meta_ad_campaign_photos is
  'Ordered set of every photo one ad campaign uses (0141) -- 1 row means a plain single-image ad, 2-10 rows means the creative is built as a Meta carousel (see lib/meta/ads.ts createAdCreative). meta_ad_campaigns.photo_id still holds display_order=0''s photo for backward-compat thumbnail queries.';
