-- ============================================================================
-- MK Connect — Device push tokens (Android app, Firebase Cloud Messaging)
-- ============================================================================

-- Stores one row per (employee, device) FCM registration token so a future
-- notification-sender (edge function or scheduled job) can fan out pushes
-- for the same events that already populate mkc_notifications. The Android
-- app registers/refreshes its token on launch and on FCM's own token-refresh
-- callback; nothing here duplicates the in-app notification logic, it's a
-- pure delivery-channel addition.
create table public.mkc_device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.employees (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);

create index mkc_device_push_tokens_user_id_idx on public.mkc_device_push_tokens (user_id);

alter table public.mkc_device_push_tokens enable row level security;

-- A device only ever registers/removes its own token; nothing reads other
-- users' tokens through the client API — only a service-role sender would,
-- via the admin client which bypasses RLS entirely.
create policy mkc_device_push_tokens_select on public.mkc_device_push_tokens
  for select to authenticated
  using (user_id = auth.uid());

create policy mkc_device_push_tokens_insert on public.mkc_device_push_tokens
  for insert to authenticated
  with check (user_id = auth.uid());

create policy mkc_device_push_tokens_delete on public.mkc_device_push_tokens
  for delete to authenticated
  using (user_id = auth.uid());

create trigger mkc_device_push_tokens_set_updated_at
  before update on public.mkc_device_push_tokens
  for each row execute function public.set_updated_at();
