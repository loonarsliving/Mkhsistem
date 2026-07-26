import { NextResponse } from "next/server";

import { askAI } from "@/lib/ai/service";
import { AI_CONFIG } from "@/lib/ai/config";
import { corsHeaders } from "@/lib/ai/voice-bridge/cors";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdminBearer } from "@/lib/supabase/bearer";
import { getLatestDailyDigest, insertDailyDigest } from "@/repositories/voice-bridge-digest.repository";
import * as announcementRepo from "@/repositories/announcement.repository";
import * as attendanceRepo from "@/repositories/attendance.repository";
import * as beautyRepo from "@/repositories/loonars-beauty.repository";
import * as crmRepo from "@/repositories/crm.repository";
import * as memoRepo from "@/repositories/memo.repository";
import * as monitoringRepo from "@/repositories/monitoring.repository";
import * as socialRepo from "@/repositories/social.repository";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIGEST_SYSTEM_PROMPT = `Kamu adalah Ultron, asisten suara internal PT Maha Karya Haluoleo, sedang menulis ringkasan harian untuk Super Admin.
Tulis 4-8 kalimat bahasa Indonesia natural, akan dibacakan lewat text-to-speech: tanpa markdown/bullet/simbol, sebutkan angka yang relevan langsung.
Fokus ke hal yang penting diketahui: kondisi absensi hari ini, memo/pengumuman baru yang perlu perhatian, hal yang masih menunggu (izin/pembayaran), hasil audit media sosial terbaru, dan error sistem yang belum diselesaikan kalau ada.
Kalau suatu bagian data kosong/nol, boleh dilewatkan singkat saja atau tidak disebut sama sekali -- jangan mengarang.`;

/**
 * Daily digest generator -- triggered once a day by pg_cron
 * (voice-bridge-daily-digest, supabase/migrations/0171). No per-request
 * auth, same established pattern as the other pg_cron-triggered routes in
 * this app (e.g. /api/crm/dispatch-promo-sends, /api/social/capture-snapshots)
 * -- a forged call just generates one extra (harmless) digest.
 *
 * One Gemini call writes a short spoken-style summary of the day's MK
 * Connect activity, so Ultron can recite it instantly for "ringkasan hari
 * ini" style questions without spending a Gemini call on every ask.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  const supabase = createAdminClient();

  try {
    const [attendanceSummary, recentMemos, recentAnnouncements, pendingLeave, socialAudit, beautyAudit, pendingPayments, unresolvedErrors] =
      await Promise.all([
        attendanceRepo.getCompanyAttendanceSummary(supabase),
        memoRepo.listRecentMemos(supabase, 5),
        announcementRepo.listRecentAnnouncements(supabase, 5),
        attendanceRepo.listPendingLeaveRequests(supabase),
        socialRepo.getLatestWeeklyEvaluation(supabase),
        beautyRepo.getLatestWeeklyEvaluation(supabase),
        crmRepo.listPendingPayments(supabase),
        monitoringRepo.countUnresolvedErrors(supabase),
      ]);

    const userPrompt = JSON.stringify({
      tanggal: new Date().toISOString().slice(0, 10),
      absensi: attendanceSummary,
      memoTerbaru: recentMemos.map((m) => ({ judul: m.title, prioritas: m.priority })),
      pengumumanTerbaru: recentAnnouncements.map((a) => ({ judul: a.title })),
      izinMenunggu: pendingLeave.length,
      auditMediaSosialProperti: socialAudit,
      auditMediaSosialBeauty: beautyAudit,
      pembayaranCrmMenunggu: pendingPayments.length,
      errorSistemBelumSelesai: unresolvedErrors,
    });

    const digestText = await askAI(DIGEST_SYSTEM_PROMPT, userPrompt, { temperature: 0.4, maxOutputTokens: 512 });
    await insertDailyDigest(supabase, digestText, AI_CONFIG.geminiModel);

    return NextResponse.json({ ok: true, digestText });
  } catch (err) {
    logger.error("Daily digest generation failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Digest generation failed" }, { status: 500 });
  }
}

/** Ultron fetches the latest digest here -- a plain table read (no Gemini call), same Super Admin bearer + CORS gate as the other voice-bridge routes. */
export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const headers = corsHeaders(request);
  const result = await requireSuperAdminBearer(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers });
  }

  try {
    const digest = await getLatestDailyDigest(result.supabase);
    return NextResponse.json({ digest }, { headers });
  } catch (err) {
    logger.error("Fetching daily digest failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load digest" }, { status: 500, headers });
  }
}
