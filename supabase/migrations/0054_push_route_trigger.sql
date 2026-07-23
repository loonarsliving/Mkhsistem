-- ============================================================================
-- MK Connect — 0054: Point the push trigger at the Vercel API route
-- instead of a Supabase Edge Function.
--
-- The send-push job now lives at app/api/push/send/route.ts (Vercel,
-- deployed via the existing git-push pipeline) rather than a Supabase Edge
-- Function -- this repo's Edge Function deployment tooling was unavailable.
-- No Authorization header is needed: the route re-fetches the notification
-- by id itself and only acts on rows created in the last 2 minutes (see the
-- route's own doc comment for the full reasoning).
-- ============================================================================
create or replace function public.mkc_notifications_push_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://mkh.haluoleo.id/api/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
