import "server-only";

import { askAI } from "../service";
import { tryRelayMessageToEmployee } from "./message-relay";
import { getSystemPrompt } from "./prompts";

const HR_KEYWORDS = ["absen", "cuti", "izin", "payroll", "gaji", "kontrak", "sop", "karyawan", "hr ", "evaluasi karyawan"];
const MARKOM_KEYWORDS = ["campaign", "konten", "marketing", "markom", "checklist marketing", "konten sosial media", "iklan"];
const CRM_KEYWORDS = ["prospek", "closing", "follow up", "pipeline", "customer", "pelanggan", "penjualan", "sales"];
const LOONARS_BEAUTY_KEYWORDS = [
  "hydraglow",
  "loonars",
  "skincare",
  "lotion",
  "serum",
  "brightening",
  "mencerahkan",
  "cara pakai",
  "bpom",
  "cod",
  "shopee",
  "tokopedia",
];

function matchesAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

/**
 * AI Router — the WhatsApp webhook's simple keyword-based intent
 * classifier, deciding which domain system prompt (HR/Markom/CRM/general)
 * answers an inbound message. Ported concept from Aiagent's AIRouter,
 * simplified from agent-registry matching to direct keyword routing since
 * MK Connect has three domains, not ten digital employees.
 */
export async function routeAndAnswer(
  question: string,
  employee: { id: string; name: string } | null,
  opts?: { maxAttempts?: number; jobId?: string },
): Promise<string> {
  const greeting = employee ? `Pengguna: ${employee.name} (karyawan terdaftar).` : "Pengirim belum teridentifikasi sebagai karyawan terdaftar.";

  // "Sampaikan ke X: Y" -- must run before the general chat prompt below,
  // which otherwise just role-plays "akan segera saya teruskan" with no
  // actual delivery (see message-relay.ts's module doc). Only meaningful
  // for a confirmed employee -- an unrecognized sender never reaches this
  // function at all (webhook-handler.ts's early return), so no risk of an
  // outsider using this to message an employee.
  if (employee) {
    const relayResult = await tryRelayMessageToEmployee(employee, question);
    if (relayResult.outcome !== "not_a_relay_request") {
      switch (relayResult.outcome) {
        case "relayed":
          return `✅ Pesan sudah diteruskan ke ${relayResult.recipientName} via WhatsApp.`;
        case "recipient_not_found":
          return "Maaf, saya tidak menemukan karyawan aktif yang cocok dengan penerima yang dimaksud. Mohon cek lagi nama/jabatannya, atau sampaikan langsung.";
        case "recipient_ambiguous":
          return `Ada lebih dari satu karyawan yang cocok: ${relayResult.candidateNames?.join(", ")}. Mohon sebutkan nama lengkap yang lebih spesifik.`;
        case "send_failed":
          return `Maaf, saya menemukan ${relayResult.recipientName} tapi pesan WhatsApp gagal terkirim ke nomornya. Mohon sampaikan langsung atau cek nomor HP-nya di data karyawan.`;
      }
    }
  }

  let domain: "general" | "hr" | "markom" | "crm" | "loonars_beauty" = "general";
  if (matchesAny(question, LOONARS_BEAUTY_KEYWORDS)) domain = "loonars_beauty";
  else if (matchesAny(question, HR_KEYWORDS)) domain = "hr";
  else if (matchesAny(question, MARKOM_KEYWORDS)) domain = "markom";
  else if (matchesAny(question, CRM_KEYWORDS)) domain = "crm";

  return askAI(await getSystemPrompt(domain), `${greeting}\n\nPesan:\n${question}`, opts);
}
