import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MINUTES = 20;
const BATCH_SIZE = 50;

const HOLDING_MESSAGE =
  "Mohon maaf kak, tim kami masih mengecek pertanyaan kakak. Mohon ditunggu sebentar lagi ya 🙏";

/**
 * Sweeps pending_questions still 'waiting' after TIMEOUT_MINUTES with no
 * Super Admin answer (see lib/ai/domains/lead-nurture.ts's
 * notifySuperadminsPendingQuestion / tryHandleSuperadminAnswer) --
 * triggered every 5 minutes by pg_cron via automation_post (migration
 * 0229), same requireCronAuth-guarded worker pattern as
 * /api/crm/dispatch-promo-sends. Sends the lead one extra holding message
 * and re-escalates to Super Admin (never Kepala Cabang -- owner's explicit
 * ask: a lead's question is a Super Admin matter end to end, escalation
 * included) as a reminder backup, per spec: the question itself stays
 * 'waiting' (a Super Admin's later "[PQ-xxxx]: jawaban" still answers it
 * normally) -- only timeout_escalated_at is set, so a given question is
 * only ever escalated once.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - TIMEOUT_MINUTES * 60_000).toISOString();

  const { data: timedOut, error } = await supabase
    .from("pending_questions")
    .select(
      "id, code, pertanyaan, branch_id, prospect:prospect_id(phone, customer_name), project:project_id(name), branch:branch_id(name)",
    )
    .eq("status", "waiting")
    .is("timeout_escalated_at", null)
    .lte("dikirim_ke_admin_at", cutoff)
    .order("dikirim_ke_admin_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    logger.error("lead-pending-question-timeout: query failed", { error: error.message });
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }

  let escalated = 0;
  for (const row of timedOut ?? []) {
    const prospect = row.prospect as unknown as { phone: string; customer_name: string } | null;
    const project = row.project as unknown as { name: string } | null;
    const branch = row.branch as unknown as { name: string } | null;
    if (!prospect) continue;

    const holdSendResult = await sendWhatsAppText(prospect.phone, HOLDING_MESSAGE);
    if (!holdSendResult.success)
      logger.error("lead-pending-question-timeout: holding message failed", {
        pendingQuestionId: row.id,
        error: holdSendResult.error,
      });

    const { data: employeesRows } = await supabase
      .from("employees")
      .select("id, phone, roles:role_id(key)")
      .eq("employment_status", "active")
      .is("deleted_at", null)
      .not("phone", "is", null);
    const superAdmins = (employeesRows ?? []).filter(
      (e) => (e.roles as unknown as { key: string } | null)?.key === "super_admin",
    );

    const escalationText =
      `⏰ Pertanyaan lead belum dijawab lebih dari ${TIMEOUT_MINUTES} menit -- ${project?.name ?? "-"} (Cabang ${branch?.name ?? "-"})\n` +
      `[${row.code}]\n` +
      `Lead: ${prospect.customer_name || "Tidak diketahui"} (${prospect.phone})\n` +
      `Pertanyaan: ${row.pertanyaan}\n\n` +
      `Ini pengingat -- mohon segera dijawab. Balas dengan format: [${row.code}]: <jawaban Anda>.`;

    for (const admin of superAdmins) {
      if (!admin.phone) continue;
      const sendResult = await sendWhatsAppText(admin.phone, escalationText);
      if (!sendResult.success)
        logger.error("lead-pending-question-timeout: Super Admin escalation failed", {
          pendingQuestionId: row.id,
          superAdminId: admin.id,
          error: sendResult.error,
        });
      await supabase.from("mkc_notifications").insert({
        user_id: admin.id,
        type: "crm",
        category: "pending_question_timeout",
        title: "Pertanyaan lead belum dijawab",
        body: `${prospect.customer_name || "Lead"} (${prospect.phone}) menunggu jawaban lebih dari ${TIMEOUT_MINUTES} menit.`,
      });
    }

    await supabase
      .from("pending_questions")
      .update({ timeout_escalated_at: new Date().toISOString() })
      .eq("id", row.id);
    escalated += 1;
  }

  return NextResponse.json({ status: "ok", escalated });
}
