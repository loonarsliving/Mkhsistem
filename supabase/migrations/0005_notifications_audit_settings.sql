-- ============================================================================
-- MK Connect — 0005: Notifications, audit log, company settings
-- ============================================================================

-- Named `mkc_notifications` (not `notifications`) because this Supabase
-- project is shared with other applications in the same org that already
-- own an unrelated `public.notifications` table. All other MK Connect
-- table/function names were verified collision-free against this project
-- and kept unprefixed.
create table public.mkc_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.employees(id) on delete cascade,
  type text not null check (type in ('memo', 'announcement', 'attendance', 'leave_request', 'system')),
  title text not null,
  body text,
  link text,
  is_read boolean not null default false,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index mkc_notifications_user_id_idx on public.mkc_notifications (user_id);
create index mkc_notifications_user_unread_idx on public.mkc_notifications (user_id) where not is_read;
create index mkc_notifications_created_at_idx on public.mkc_notifications (created_at desc);

-- Required for the client's `postgres_changes` realtime subscription
-- (features/notifications/hooks/use-notifications.ts) to receive events.
alter publication supabase_realtime add table public.mkc_notifications;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_changed_by_idx on public.audit_logs (changed_by);
create index audit_logs_changed_at_idx on public.audit_logs (changed_at desc);

-- Singleton settings row (enforced by fixed id below).
create table public.company_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001'::uuid,
  company_name text not null default 'PT Maha Karya Haluoleo',
  company_logo_url text,
  company_address text,
  timezone text not null default 'Asia/Makassar',
  default_radius_meters integer not null default 100,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint company_settings_singleton check (id = '00000000-0000-0000-0000-000000000001'::uuid)
);
