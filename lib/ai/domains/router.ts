import "server-only";

import { askAI } from "../service";
import { tryAnswerWithData } from "./data-queries";
import { formatFileRequestReply, tryHandleFileRequest } from "./file-request";
import { formatRelayReply, tryRelayToEmployees } from "./message-relay";
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
  opts?: { maxAttempts?: number; jobId?: string; senderWaNumber?: string },
): Promise<string> {
  const greeting = employee ? `Pengguna: ${employee.name} (karyawan terdaftar).` : "Pengirim belum teridentifikasi sebagai karyawan terdaftar.";

  // "Sampaikan ke X: Y" -- must run before the general chat prompt below,
  // which otherwise just role-plays "akan segera saya teruskan" with no
  // actual delivery (see message-relay.ts's module doc). Only meaningful
  // for a confirmed employee -- an unrecognized sender never reaches this
  // function at all (webhook-handler.ts's early return), so no risk of an
  // outsider using this to message an employee. Also flushes any staged
  // photos (wa_pending_media_relay) this same sender sent earlier -- so
  // "kirim 2 foto lalu bilang untuk siapa" relays both together.
  if (employee && opts?.senderWaNumber) {
    const relayResult = await tryRelayToEmployees(employee, opts.senderWaNumber, question);
    if (relayResult.outcome !== "not_a_relay_request") {
      return formatRelayReply(relayResult);
    }
  }

  // "Berapa lead minggu ini", "saldo cabang Jogja berapa" -- questions that
  // need a real number from the database, not the domain prompts' static
  // expertise. Must also run before the keyword-routed general chat below,
  // for the same reason the relay check does: without this, Gemini would
  // just answer from its own guesswork instead of the system's actual data.
  if (employee) {
    const dataResult = await tryAnswerWithData(question, employee);
    if (dataResult.applicable) return dataResult.answer;
  }

  // "Kirim saya file X" -- the company file manager (Filemanager repo agent,
  // migration 0245). Checked before the general data-query/keyword-routed
  // chat below for the same reason as tryAnswerWithData: without this,
  // Gemini would just chat about the file instead of actually looking it up
  // and queuing delivery. Runs for any sender (opts?.senderWaNumber),
  // including one not yet resolved to an employee, since employee may be
  // null here -- file requests aren't gated behind employee recognition at
  // this layer (the WhatsApp webhook's earlier findEmployeeByPhone check
  // already dropped fully unrecognized senders before reaching routeAndAnswer).
  if (opts?.senderWaNumber) {
    const fileResult = await tryHandleFileRequest(question, opts.senderWaNumber, employee?.id ?? null);
    if (fileResult.outcome !== "not_a_file_request") {
      return formatFileRequestReply(fileResult);
    }
  }

  let domain: "general" | "hr" | "markom" | "crm" | "loonars_beauty" = "general";
  if (matchesAny(question, LOONARS_BEAUTY_KEYWORDS)) domain = "loonars_beauty";
  else if (matchesAny(question, HR_KEYWORDS)) domain = "hr";
  else if (matchesAny(question, MARKOM_KEYWORDS)) domain = "markom";
  else if (matchesAny(question, CRM_KEYWORDS)) domain = "crm";

  return askAI(await getSystemPrompt(domain), `${greeting}\n\nPesan:\n${question}`, opts);
}
