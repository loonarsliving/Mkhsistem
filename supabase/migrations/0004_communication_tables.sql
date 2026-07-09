-- ============================================================================
-- MK Connect — 0004: Communication domain
-- memos (+ targets/attachments/reads), announcements (+ categories/targets/attachments)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- memos
-- ----------------------------------------------------------------------------
create table public.memos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  is_pinned boolean not null default false,
  is_mandatory_read boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.employees(id),
  updated_by uuid references public.employees(id)
);
create index memos_published_at_idx on public.memos (published_at desc);
create index memos_is_pinned_idx on public.memos (is_pinned);
create index memos_title_trgm_idx on public.memos using gin (title gin_trgm_ops);
create index memos_content_trgm_idx on public.memos using gin (content gin_trgm_ops);

create table public.memo_attachments (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.memos(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id)
);
create index memo_attachments_memo_id_idx on public.memo_attachments (memo_id);

create table public.memo_targets (
  id uuid primary key default gen_random_uuid(),
  memo_id uuid not null references public.memos(id) on delete cascade,
  target_type text not null
    check (target_type in ('all_branch', 'branch', 'all_division', 'division', 'position', 'user')),
  target_id uuid,
  created_at timestamptz not null default now(),
  constraint memo_targets_target_id_required check (
    (target_type in ('all_branch', 'all_division') and target_id is null)
    or (target_type not in ('all_branch', 'all_division') and target_id is not null)
  )
);
create index memo_targets_memo_id_idx on public.memo_targets (memo_id);
create index memo_targets_lookup_idx on public.memo_targets (target_type, target_id);

create table public.memo_reads (
  memo_id uuid not null references public.memos(id) on delete cascade,
  user_id uuid not null references public.employees(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (memo_id, user_id)
);
create index memo_reads_user_id_idx on public.memo_reads (user_id);

-- ----------------------------------------------------------------------------
-- announcements
-- ----------------------------------------------------------------------------
create table public.announcement_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#2563eb',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.announcement_categories(id) on delete set null,
  title text not null,
  content text not null,
  is_pinned boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.employees(id),
  updated_by uuid references public.employees(id)
);
create index announcements_published_at_idx on public.announcements (published_at desc);
create index announcements_is_pinned_idx on public.announcements (is_pinned);
create index announcements_category_id_idx on public.announcements (category_id);
create index announcements_title_trgm_idx on public.announcements using gin (title gin_trgm_ops);

create table public.announcement_attachments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id)
);
create index announcement_attachments_announcement_id_idx on public.announcement_attachments (announcement_id);

create table public.announcement_targets (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  target_type text not null
    check (target_type in ('all_branch', 'branch', 'all_division', 'division', 'position', 'user')),
  target_id uuid,
  created_at timestamptz not null default now(),
  constraint announcement_targets_target_id_required check (
    (target_type in ('all_branch', 'all_division') and target_id is null)
    or (target_type not in ('all_branch', 'all_division') and target_id is not null)
  )
);
create index announcement_targets_announcement_id_idx on public.announcement_targets (announcement_id);
create index announcement_targets_lookup_idx on public.announcement_targets (target_type, target_id);
