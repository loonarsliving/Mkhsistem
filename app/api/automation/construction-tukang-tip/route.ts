import { NextResponse } from "next/server";

import { askAI } from "@/lib/ai/service";
import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Invoked by construction_run_tukang_teaching_check() (0196) via pg_net,
 * weekly per branch with an active construction project -- currently
 * Kendari only. WhatsApp-only, no mkc_notifications row, same posture as
 * sales_closing_tips_broadcast (0117) and the Cashflow Teaching Engine
 * (0129): a coaching message a Kepala Cabang gets directly, not something
 * that shows up in the app's notification bell.
 *
 * Deliberately calls Gemini directly per tip rather than maintaining a
 * separate weekly-refreshed "intelligence bank" table (unlike the
 * Cashflow/Occupancy Teaching Engines) -- scope here is a single rotating
 * practical tip, not a researched Action Plan, so the extra bank/refresh
 * machinery isn't worth it yet.
 */
const TOPICS = [
  "cara efektif mengelola dan mengawasi tukang harian/borongan di proyek pembangunan skala kecil-menengah",
  "cara mengendalikan pemborosan material bangunan dan menjaga stok tetap efisien",
  "cara membuat jadwal progres pembangunan yang realistis dan cara memantau keterlambatan sejak dini",
  "cara menjaga kualitas hasil kerja tukang tanpa harus terus-menerus mengawasi di lokasi",
  "cara mengelola pembayaran/upah tukang harian agar adil, tepat waktu, dan tidak membebani arus kas proyek",
  "cara menangani konflik atau tukang yang tidak disiplin/mangkir di proyek konstruksi",
  "cara memilih dan bernegosiasi dengan toko bangunan supaya harga material lebih hemat",
  "prinsip keselamatan kerja (K3) dasar yang wajib diterapkan di proyek pembangunan kecil",
];

export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  let employeeId: string | undefined;
  try {
    const body = await request.json();
    employeeId = body?.employee_id;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!employeeId) {
    return NextResponse.json({ error: "employee_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: employee } = await supabase.from("employees").select("full_name, phone").eq("id", employeeId).maybeSingle();
  if (!employee?.phone) {
    return NextResponse.json({ sent: false, reason: "employee has no phone number on file" });
  }

  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];

  const systemPrompt =
    "Kamu adalah konsultan manajemen konstruksi berpengalaman yang mengajari seorang Kepala Cabang (bukan insinyur) cara mengelola tukang dan proyek pembangunan kantor cabang secara praktis. Tulis dalam Bahasa Indonesia, gaya WhatsApp: ringkas, langsung ke praktik, gunakan poin-poin bernomor, boleh pakai emoji secukupnya. JANGAN tulis pembuka/penutup basa-basi panjang. Maksimal sekitar 150-200 kata.";
  const userPrompt = `Berikan tips praktis berdasarkan best practice industri konstruksi tentang: ${topic}. Tujuannya untuk ${employee.full_name}, yang sedang mengawasi pembangunan kantor cabang.`;

  const tip = await askAI(systemPrompt, userPrompt, { temperature: 0.7, maxOutputTokens: 512 });

  const message = `🎓 *Tips Manajemen Pembangunan*\n\n${tip}`;
  const result = await sendWhatsAppText(employee.phone, message);

  return NextResponse.json({ sent: result.success, error: result.error });
}
