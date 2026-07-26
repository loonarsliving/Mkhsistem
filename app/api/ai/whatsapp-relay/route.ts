import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Invoked by the mkc_notifications_after_insert_whatsapp Postgres trigger
 * (see supabase/migrations/0063_ai_operating_system.sql) every time a
 * notification in a WhatsApp-eligible category is inserted — Reminder
 * Absen, Reminder Memo, Reminder Target Sales, Reminder Markom, Reminder
 * Payroll, Reminder Approval, Reminder Project. Mirrors the exact security
 * model already established by app/api/push/send/route.ts: guarded by
 * requireCronAuth once CRON_SECRET is configured, and independently of
 * that, this endpoint re-fetches the notification by id itself and only
 * acts on rows created in the last 2 minutes, so a forged call can only
 * cause an already-legitimate, already-persisted, very recent notification
 * to be (re-)sent to its rightful owner.
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
    .select("id, user_id, title, body, created_at")
    .eq("id", notificationId)
    .single();

  if (notificationError || !notification) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }
  if (Date.now() - new Date(notification.created_at).getTime() > 2 * 60 * 1000) {
    return NextResponse.json({ error: "Notification too old to relay" }, { status: 410 });
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("phone")
    .eq("id", notification.user_id)
    .single();

  if (employeeError || !employee?.phone) {
    return NextResponse.json({ sent: false, reason: "employee has no phone number on file" });
  }

  const text = notification.body ? `*${notification.title}*\n${notification.body}` : notification.title;
  const result = await sendWhatsAppText(employee.phone, text);

  return NextResponse.json({ sent: result.success, error: result.error });
}
