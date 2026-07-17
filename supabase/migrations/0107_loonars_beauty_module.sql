-- ============================================================================
-- MK Connect — 0107: Loonars Beauty module
--
-- New brand-scoped module for Loonars Beauty (skincare sold via
-- Shopee/Tokopedia/TikTok Shop) -- distinct from the property business the
-- rest of Markom serves, so it gets its own permission pair and nav group
-- instead of overloading content_planner/content_submission.
--
-- Deliberately data-entry-first, not API-integrated, for this MVP:
--   - loonars_content_items: the content database (category/platform/status),
--     no upload/storage -- content is published directly on TikTok/IG by the
--     team and tracked here by its public URL, not routed through the
--     upload -> AI-review -> auto-publish pipeline markom_content_submissions
--     already owns.
--   - loonars_content_metrics: one row per content per day, entered by hand
--     from TikTok/IG Insights (no TikTok Business API credentials exist yet
--     in this project -- see .env.example -- so there is nothing to pull
--     automatically, same situation content_planner already documented for
--     TikTok snapshots).
--   - loonars_orders: a simple, standalone order log native to MK Connect's
--     own database -- deliberately NOT synced with the separate Loonars
--     Dashboard Supabase project (gluoioiimapyhchdasfl runs its own
--     marketplace order flow independently; cross-project sync was tried
--     and dropped as unnecessary complexity for what this module needs,
--     which is just "how many orders/how much revenue is content driving").
--     One row per order, entered by whoever closes it (WhatsApp/DM, or
--     logged from a marketplace order) -- not a full e-commerce system,
--     no separate order_items/product catalog, single product line per row.
--   - loonars_weekly_evaluations: AI's Monday evaluation of the past week
--     (ratio compliance, which content to Spark-Ads-boost, retargeting
--     candidates) -- same shape as social_weekly_evaluations (0085), queued
--     through ai_job_queue (0065) like every other AI workflow here.
-- ============================================================================

insert into public.permissions (key, description) values
  ('loonars_beauty.view', 'View Loonars Beauty: content items, performance metrics, orders, weekly AI evaluation'),
  ('loonars_beauty.manage', 'Manage Loonars Beauty: create/edit content items, log performance & order data, trigger AI evaluation')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key in ('markom', 'direktur_utama', 'direktur_operasional') and p.key in ('loonars_beauty.view', 'loonars_beauty.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key = 'super_admin'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- loonars_content_items: the content plan. category enforces the agreed
-- rotation (40% problem-solution / 30% UGC / 20% edukasi / 10% promosi) --
-- the ratio itself is computed app-side (trailing-30-day count per category
-- vs target), not enforced here, so the team can still deliberately go
-- off-ratio for a specific week without a constraint fighting them.
-- ----------------------------------------------------------------------------
create table public.loonars_content_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('problem_solution', 'ugc', 'edukasi', 'promosi')),
  platform text not null check (platform in ('tiktok', 'instagram')),
  title text not null,
  hook text,
  caption text,
  script_notes text,
  cta text,
  product_name text not null default 'HydraGlow Advanced Brightening Lotion',
  status text not null default 'idea' check (status in ('idea', 'draft', 'scheduled', 'published', 'archived')),
  content_url text,
  scheduled_at timestamptz,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null
);

create index loonars_content_items_status_idx on public.loonars_content_items (status) where deleted_at is null;
create index loonars_content_items_category_idx on public.loonars_content_items (category, published_at) where deleted_at is null;

create trigger set_updated_at before update on public.loonars_content_items
  for each row execute function public.set_updated_at();

create trigger audit_log after insert or update or delete on public.loonars_content_items
  for each row execute function public.audit_log_trigger();

-- ----------------------------------------------------------------------------
-- loonars_content_metrics: daily manual performance entry per content.
-- unique(content_item_id, captured_at) so re-entering today's numbers
-- updates the same row (upsert) instead of creating duplicates.
-- ----------------------------------------------------------------------------
create table public.loonars_content_metrics (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.loonars_content_items(id) on delete cascade,
  captured_at date not null default current_date,
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  watch_through_50pct boolean not null default false,
  link_clicks integer not null default 0,
  boosted_spark_ads boolean not null default false,
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (content_item_id, captured_at)
);

create index loonars_content_metrics_content_idx on public.loonars_content_metrics (content_item_id, captured_at desc);

-- ----------------------------------------------------------------------------
-- loonars_orders: standalone order log (see header note above) -- one row
-- per order, order_number auto-generated per day (LB-YYYYMMDD-####).
-- ----------------------------------------------------------------------------
create table public.loonars_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  customer_phone text,
  customer_address text,
  channel text not null check (channel in ('shopee', 'tokopedia', 'whatsapp', 'instagram', 'website', 'offline', 'other')),
  product_name text not null default 'HydraGlow Advanced Brightening Lotion',
  quantity integer not null default 1,
  unit_price numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'processing', 'shipped', 'completed', 'cancelled')),
  courier text,
  tracking_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  updated_by uuid references public.employees(id) on delete set null
);

create index loonars_orders_created_idx on public.loonars_orders (created_at desc);
create index loonars_orders_status_idx on public.loonars_orders (status);

create trigger set_updated_at before update on public.loonars_orders
  for each row execute function public.set_updated_at();

create trigger audit_log after insert or update or delete on public.loonars_orders
  for each row execute function public.audit_log_trigger();

-- Auto-generate order_number when not supplied -- same count-per-day
-- pattern as generate_order_number() in Loonars Dashboard's own schema.
-- Low-volume internal tool, so the rare concurrent-insert collision isn't
-- worth a sequence table.
create or replace function public.loonars_orders_generate_number()
returns trigger
language plpgsql
as $$
declare
  cnt integer;
begin
  if new.order_number is null or new.order_number = '' then
    select count(*) + 1 into cnt from public.loonars_orders where date(created_at) = current_date;
    new.order_number := 'LB-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(cnt::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger loonars_orders_set_number before insert on public.loonars_orders
  for each row execute function public.loonars_orders_generate_number();

-- ----------------------------------------------------------------------------
-- loonars_weekly_evaluations: AI's written weekly evaluation, one row per
-- week (upserted by the job processor, same as social_weekly_evaluations).
-- ----------------------------------------------------------------------------
create table public.loonars_weekly_evaluations (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  evaluation text not null,
  content_ratio_actual jsonb,
  recommended_boost_content_id uuid references public.loonars_content_items(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index loonars_weekly_evaluations_week_start_key on public.loonars_weekly_evaluations (week_start);

alter table public.loonars_content_items enable row level security;
alter table public.loonars_content_metrics enable row level security;
alter table public.loonars_orders enable row level security;
alter table public.loonars_weekly_evaluations enable row level security;

create policy loonars_content_items_select on public.loonars_content_items for select to authenticated
  using (public.app_has_permission('loonars_beauty.view'));
create policy loonars_content_items_write on public.loonars_content_items for all to authenticated
  using (public.app_has_permission('loonars_beauty.manage'))
  with check (public.app_has_permission('loonars_beauty.manage'));

create policy loonars_content_metrics_select on public.loonars_content_metrics for select to authenticated
  using (public.app_has_permission('loonars_beauty.view'));
create policy loonars_content_metrics_write on public.loonars_content_metrics for all to authenticated
  using (public.app_has_permission('loonars_beauty.manage'))
  with check (public.app_has_permission('loonars_beauty.manage'));

create policy loonars_orders_select on public.loonars_orders for select to authenticated
  using (public.app_has_permission('loonars_beauty.view'));
create policy loonars_orders_write on public.loonars_orders for all to authenticated
  using (public.app_has_permission('loonars_beauty.manage'))
  with check (public.app_has_permission('loonars_beauty.manage'));

create policy loonars_weekly_evaluations_select on public.loonars_weekly_evaluations for select to authenticated
  using (public.app_has_permission('loonars_beauty.view'));

-- ----------------------------------------------------------------------------
-- AI: new domain system prompt (editable via Modul AI, /ai) -- separate from
-- 'markom' because that prompt is scoped to property marketing; Loonars
-- Beauty needs skincare-specific brand voice, BPOM safety-claim discipline,
-- and its own FAQ knowledge for WhatsApp auto-reply routing (lib/ai/domains/router.ts).
-- ----------------------------------------------------------------------------
insert into public.ai_system_prompts (key, label, content) values (
  'loonars_beauty',
  'Loonars Beauty',
  'Anda adalah AI Marketing Assistant untuk Loonars Beauty, lini produk skincare PT Maha Karya Haluoleo -- produk utama saat ini: HydraGlow Advanced Brightening Lotion, dijual lewat Shopee/Tokopedia/TikTok Shop.

Tugas Anda: membuat ide konten sesuai rasio strategi (40% problem-solution, 30% testimoni/UGC, 20% edukasi skincare, 10% promosi langsung), menulis hook & caption TikTok/Instagram, mengevaluasi performa konten mingguan, merekomendasikan konten mana yang layak di-boost dengan Spark Ads, dan menjawab pertanyaan calon pembeli lewat WhatsApp/DM (harga, cara pakai, keamanan/BPOM, estimasi pengiriman) dengan gaya closing yang ramah, tidak memaksa.

ATURAN KLAIM PRODUK -- WAJIB DIPATUHI: jangan pernah mengklaim produk skincare menyembuhkan kondisi medis, memberi hasil instan/taunan waktu pasti, atau membuat perbandingan merendahkan kompetitor. Klaim manfaat (mencerahkan, melembapkan, dll) harus wajar dan sesuai deskripsi produk yang diberikan sebagai konteks -- jangan mengarang kandungan/klaim BPOM yang tidak ada di konteks; jika ditanya hal yang tidak yakin, arahkan untuk konfirmasi ke admin.

Jawab dalam Bahasa Indonesia, ringkas, dan action-oriented -- setiap ide konten atau balasan harus langsung bisa dipakai tim, bukan teori generik.'
)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- ai_job_queue: register the new job type for the weekly evaluation, queued
-- the same way social_weekly_evaluation (0086) is.
-- ----------------------------------------------------------------------------
alter table public.ai_job_queue drop constraint ai_job_queue_job_type_check;
alter table public.ai_job_queue add constraint ai_job_queue_job_type_check
  check (job_type in (
    'whatsapp_ai_reply', 'crm_sp1_draft', 'markom_checklist_draft',
    'meta_ads_launch', 'meta_ads_research', 'social_weekly_evaluation', 'crm_sales_coaching',
    'loonars_beauty_weekly_evaluation'
  ));

-- Manual trigger (button in the Evaluasi Mingguan page, permission-gated) --
-- ai_job_queue has RLS with no policies for authenticated, so enqueuing
-- requires this SECURITY DEFINER wrapper, same as markom_request_ads_research (0082).
create or replace function public.loonars_beauty_request_weekly_evaluation()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_has_permission('loonars_beauty.manage') then
    raise exception 'permission denied';
  end if;

  insert into public.ai_job_queue (job_type, payload) values ('loonars_beauty_weekly_evaluation', '{}'::jsonb);
end;
$$;

grant execute on function public.loonars_beauty_request_weekly_evaluation() to authenticated;

-- Automatic weekly dispatch -- Monday 01:45 UTC (09:45 WITA), staggered 45
-- minutes after social-weekly-evaluation-dispatch (0086) so the two Gemini
-- workflows don't contend for the same ai_job_queue sweep window.
create or replace function public.loonars_beauty_run_weekly_evaluation_dispatch()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_job_queue (job_type, payload) values ('loonars_beauty_weekly_evaluation', '{}'::jsonb);
end;
$$;

select cron.schedule('loonars-beauty-weekly-evaluation-dispatch', '45 1 * * 1', $$select public.loonars_beauty_run_weekly_evaluation_dispatch();$$);
