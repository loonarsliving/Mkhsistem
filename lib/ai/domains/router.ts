import "server-only";

import { askAI } from "../service";
import { getSystemPrompt } from "./prompts";

const HR_KEYWORDS = ["absen", "cuti", "izin", "payroll", "gaji", "kontrak", "sop", "karyawan", "hr ", "evaluasi karyawan"];
const MARKOM_KEYWORDS = ["campaign", "konten", "marketing", "markom", "checklist marketing", "konten sosial media", "iklan"];
const CRM_KEYWORDS = ["prospek", "closing", "follow up", "pipeline", "customer", "pelanggan", "penjualan", "sales"];

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

  let domain: "general" | "hr" | "markom" | "crm" = "general";
  if (matchesAny(question, HR_KEYWORDS)) domain = "hr";
  else if (matchesAny(question, MARKOM_KEYWORDS)) domain = "markom";
  else if (matchesAny(question, CRM_KEYWORDS)) domain = "crm";

  return askAI(await getSystemPrompt(domain), `${greeting}\n\nPesan:\n${question}`, opts);
}
