import "server-only";

import { askAI } from "../service";
import { HR_SYSTEM_PROMPT } from "./hr";
import { MARKOM_SYSTEM_PROMPT } from "./markom";
import { CRM_SYSTEM_PROMPT } from "./crm";

const GENERAL_SYSTEM_PROMPT = `Anda adalah MK Connect AI, asisten AI internal PT Maha Karya Haluoleo yang bisa membantu topik HR, Markom (Marketing & Komunikasi), dan CRM (penjualan/prospek).
Jawab dalam Bahasa Indonesia, singkat dan jelas. Jika pertanyaan di luar cakupan HR/Markom/CRM perusahaan, katakan Anda hanya bisa membantu topik tersebut.`;

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

  let systemPrompt = GENERAL_SYSTEM_PROMPT;
  if (matchesAny(question, HR_KEYWORDS)) systemPrompt = HR_SYSTEM_PROMPT;
  else if (matchesAny(question, MARKOM_KEYWORDS)) systemPrompt = MARKOM_SYSTEM_PROMPT;
  else if (matchesAny(question, CRM_KEYWORDS)) systemPrompt = CRM_SYSTEM_PROMPT;

  return askAI(systemPrompt, `${greeting}\n\nPesan:\n${question}`, opts);
}
