import { NextResponse } from "next/server";

import { recommendTukangPayment, type TukangPaymentEvidencePhoto } from "@/lib/ai/domains/tukang-payment-recommendation";
import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { requireCronAuth } from "@/lib/security/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

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
    .select("id, user_id, title, body, category, metadata, created_at")
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

  let body = notification.body;
  if (notification.category === "finance_expense_pending_verification") {
    const aiNote = await buildTukangPaymentAiNote(supabase, notification.metadata);
    if (aiNote && body) body = `${body}\n\n${aiNote}`;
  }

  const text = body ? `*${notification.title}*\n${body}` : notification.title;
  const result = await sendWhatsAppText(employee.phone, text);

  return NextResponse.json({ sent: result.success, error: result.error });
}

/**
 * finance_expense_pending_verification (sync_inbound, 0221) carries
 * tipe/branch_id/tukang_nama/nominal/sisa_kontrak/terbayar_baru in its
 * metadata for tipe='tukang' pengajuan -- gathers recent photo-progress
 * evidence for that branch and asks the AI domain for a short recommendation
 * to append to the WA text. Never blocks the send: any failure (missing
 * fields, AI error) just means no AI line gets added.
 */
async function buildTukangPaymentAiNote(
  supabase: ReturnType<typeof createAdminClient>,
  metadata: unknown,
): Promise<string | null> {
  const meta = metadata as Record<string, unknown> | null;
  if (!meta || meta.tipe !== "tukang" || !meta.branch_id) return null;

  const nominal = Number(meta.nominal);
  const sisaKontrak = Number(meta.sisa_kontrak);
  const terbayarBaru = Number(meta.terbayar_baru);
  if (!Number.isFinite(nominal) || !Number.isFinite(sisaKontrak) || !Number.isFinite(terbayarBaru)) return null;

  try {
    const { data: branchEmployees } = await supabase.from("employees").select("id").eq("branch_id", meta.branch_id as string);
    const employeeIds = (branchEmployees ?? []).map((e) => e.id);

    let photos: TukangPaymentEvidencePhoto[] = [];
    if (employeeIds.length > 0) {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: photoRows } = await supabase
        .from("construction_progress_photos")
        .select("report_date, ai_stage, ai_progress_pct, ai_notes")
        .in("employee_id", employeeIds)
        .gte("report_date", fourteenDaysAgo)
        .order("report_date", { ascending: false })
        .limit(5);
      photos = (photoRows ?? []).map((p) => ({ reportDate: p.report_date, aiStage: p.ai_stage, aiProgressPct: p.ai_progress_pct, aiNotes: p.ai_notes }));
    }

    const rec = await recommendTukangPayment({
      tukangNama: typeof meta.tukang_nama === "string" ? meta.tukang_nama : "-",
      nominalDiajukan: nominal,
      terbayarSetelahIni: terbayarBaru,
      sisaKontrakSetelahIni: sisaKontrak,
      photos,
    });

    const emoji = rec.verdict === "wajar" ? "✅" : "⚠️";
    return `🤖 ${emoji} Rekomendasi AI: ${rec.note}`;
  } catch {
    return null;
  }
}
