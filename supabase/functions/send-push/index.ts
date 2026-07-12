// MK Connect — send-push Edge Function
//
// Invoked by the mkc_notifications_after_insert_push trigger (see
// supabase/migrations/0052_web_push_notifications.sql) every time a
// notification row is inserted, regardless of which RPC created it.
//
// Security note: this function ALWAYS re-fetches the notification by id
// with its own service-role client rather than trusting the caller's
// payload — the only thing an untrusted caller could do by guessing/
// replaying a notification_id is cause an already-legitimate, already-
// persisted notification to be (re-)pushed to its rightful owner. No
// arbitrary content can be injected this way.
//
// NOT committed to git with real secrets inlined: the deployed version of
// this file has VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
// substituted with real values at deploy time. This checked-in copy reads
// them from environment variables so nothing sensitive lives in source
// control — see the deploy notes in the PR/commit description for how the
// live values are managed.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@haluoleo.id";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  category: string | null;
  title: string;
  body: string | null;
  link: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!VAPID_PRIVATE_KEY) {
    console.error("send-push misconfigured: VAPID_PRIVATE_KEY not set");
    return new Response(JSON.stringify({ error: "Push not configured" }), { status: 500 });
  }

  let notificationId: string | undefined;
  try {
    const payload = await req.json();
    notificationId = payload?.notification_id;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  if (!notificationId) {
    return new Response(JSON.stringify({ error: "notification_id is required" }), { status: 400 });
  }

  const { data: notification, error: notificationError } = await supabase
    .from("mkc_notifications")
    .select("id, user_id, type, category, title, body, link")
    .eq("id", notificationId)
    .single<NotificationRow>();

  if (notificationError || !notification) {
    return new Response(JSON.stringify({ error: "Notification not found" }), { status: 404 });
  }

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("mkc_push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", notification.user_id);

  if (subscriptionError) {
    console.error("Failed to load push subscriptions", subscriptionError);
    return new Response(JSON.stringify({ error: "Failed to load subscriptions" }), { status: 500 });
  }
  if (!subscriptions || subscriptions.length === 0) {
    return new Response(JSON.stringify({ sent: 0, expired: 0, reason: "no subscriptions" }), { status: 200 });
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
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload,
        );
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

  return new Response(JSON.stringify({ sent, expired }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
