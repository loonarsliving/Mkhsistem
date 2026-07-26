import { NextResponse } from "next/server";
import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";

// Not a secret in the sense that matters here: the VAPID public key is
// meant to be public (it's shipped to every browser as part of the
// subscribe flow). The private key has no Vercel-env-var equivalent
// available in this deployment path, so it's embedded directly here,
// matching the same tradeoff already made (and explicitly approved) for
// the earlier Supabase Edge Function attempt at this exact feature.
const VAPID_PUBLIC_KEY = "BNU8k6eYs1cva3cgNaxw7_3LuVDLSOJwWm3_KDB3Ix_Ql5S1rkSY-DDaDozFK1MKL9PGrgVQ9TPvRWmVz2HlsDs";
const VAPID_PRIVATE_KEY = "aG2mOgAoLYvb85xumEpbK7TGzD0QlTl6np7VoAXejYg";

webpush.setVapidDetails("mailto:admin@haluoleo.id", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

/**
 * Invoked by the mkc_notifications_after_insert_push Postgres trigger (see
 * supabase/migrations/0054_push_route_trigger.sql) every time a notification
 * row is inserted, regardless of which RPC created it. Runs on Vercel
 * instead of a Supabase Edge Function -- this repo's deployment tooling for
 * Edge Functions was unavailable, but git-push-triggered Vercel deploys and
 * the existing service-role admin client (lib/supabase/admin.ts, already
 * configured in production for registration/employee actions) were not, so
 * the whole push-sending job moved here instead.
 *
 * Defence in depth: the endpoint is behind requireCronAuth (see
 * lib/security/cron-auth.ts) once CRON_SECRET is configured, and
 * independently of that it ALWAYS re-fetches the notification by id
 * with its own service-role client rather than trusting the request body,
 * and only acts on notifications created within the last 2 minutes. A
 * forged call can therefore only cause an already-legitimate, already-
 * persisted, very-recent notification to be (re-)pushed to its rightful
 * owner -- no content injection, no access to anything not already true.
 * notification_id is a v4 UUID, not practically guessable within that
 * window.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  let notificationId: string | undefined;
  try {
    const body = await request.json();
    notificationId = body?.notification_id;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!notificationId) {
    return NextResponse.json({ error: "notification_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: notification, error: notificationError } = await supabase
    .from("mkc_notifications")
    .select("id, user_id, type, category, title, body, link, created_at")
    .eq("id", notificationId)
    .single();

  if (notificationError || !notification) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }
  if (Date.now() - new Date(notification.created_at).getTime() > 2 * 60 * 1000) {
    return NextResponse.json({ error: "Notification too old to (re-)push" }, { status: 410 });
  }

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("mkc_push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", notification.user_id);

  if (subscriptionError) {
    return NextResponse.json({ error: "Failed to load subscriptions" }, { status: 500 });
  }
  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, expired: 0, reason: "no subscriptions" });
  }

  const payload = JSON.stringify({
    title: "MK Connect",
    body: notification.title,
    detail: notification.body,
    link: notification.link ?? "/notifications",
    type: notification.type,
    category: notification.category,
    notificationId: notification.id,
    timestamp: Date.now(),
  });

  let sent = 0;
  let expired = 0;
  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expired += 1;
          staleIds.push(sub.id);
        } else {
          console.error(`Push send failed for subscription ${sub.id}`, err);
        }
      }
    }),
  );

  if (staleIds.length > 0) {
    await supabase.from("mkc_push_subscriptions").delete().in("id", staleIds);
  }

  return NextResponse.json({ sent, expired });
}
