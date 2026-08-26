import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { generateAIText } from "../service";

type AdminClient = ReturnType<typeof createAdminClient>;

interface FileRequestIntent {
  isFileRequest: boolean;
  searchTerms: string[];
}

function parseIntentJson(text: string): FileRequestIntent {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { isFileRequest?: boolean; searchTerms?: string[] };
    return {
      isFileRequest: parsed.isFileRequest === true,
      searchTerms: Array.isArray(parsed.searchTerms) ? parsed.searchTerms.filter((t): t is string => typeof t === "string" && t.trim().length > 0) : [],
    };
  } catch {
    return { isFileRequest: false, searchTerms: [] };
  }
}

/**
 * One cheap Gemini call decides whether this message is asking the system
 * to send a company file (a document, contract, form, price list, etc.) via
 * WhatsApp -- as opposed to a normal question -- and extracts the keywords
 * to search the catalog with. Mirrors data-queries.ts's
 * extractDataQueryIntent / message-relay.ts's extractRelayIntent: a small
 * classification call before any real work happens.
 */
async function extractFileRequestIntent(question: string): Promise<FileRequestIntent> {
  const prompt = `Pesan dari karyawan lewat WhatsApp: "${question}"

Tentukan apakah ini PERMINTAAN UNTUK DIKIRIMKAN SEBUAH FILE/DOKUMEN PERUSAHAAN (mis. "kirim saya file kontrak PT ABC", "minta dokumen SOP HR dong", "ada file pricelist rumah kendari?", "tolong kirimkan surat perjanjian kerja"). Ini BUKAN permintaan file kalau cuma pertanyaan biasa, minta dibuatkan sesuatu, atau membahas topik lain.

Kalau ini permintaan file, sebutkan kata kunci pencarian yang relevan (nama file, topik, nama proyek/pihak yang disebut, jenis dokumen) sebagai array kata/frasa pendek.

Balas HANYA dengan JSON (tanpa markdown code fence): {"isFileRequest": true/false, "searchTerms": ["kata kunci", ...]}`;

  try {
    const response = await generateAIText({
      systemPrompt: "Kamu adalah pengklasifikasi intent pesan WhatsApp internal perusahaan. Balas HANYA dengan JSON sesuai instruksi, tanpa penjelasan tambahan.",
      userPrompt: prompt,
      maxOutputTokens: 512,
      maxAttempts: 1,
    });
    return parseIntentJson(response.text);
  } catch {
    return { isFileRequest: false, searchTerms: [] };
  }
}

export interface FileCandidate {
  id: string;
  displayName: string;
  categoryName: string | null;
}

/**
 * Plain ILIKE scan across name/description/tags -- deliberately not
 * Postgres full-text search: mkc_files.display_name is plain text, not a
 * tsvector column, and the search vocabulary here (short, WhatsApp-typed
 * keywords in mixed Indonesian/English, often partial filenames) fits an
 * ILIKE substring match better than tsquery's word-boundary matching
 * anyway. Fine for a company-file catalog's scale; revisit (e.g. actually
 * use migration 0245's tsvector gin index via a proper tsquery) if the
 * catalog grows into the tens of thousands of files and ILIKE scans start
 * showing up in query latency.
 */
async function searchFileCandidates(supabase: AdminClient, searchTerms: string[]): Promise<FileCandidate[]> {
  const cleanedTerms = searchTerms.map((t) => t.replace(/[%,()]/g, "").trim()).filter((t) => t.length > 0);
  if (cleanedTerms.length === 0) return [];

  const orFilter = cleanedTerms
    .flatMap((term) => [`display_name.ilike.%${term}%`, `description.ilike.%${term}%`, `tags.cs.{${term}}`])
    .join(",");

  const { data, error } = await supabase
    .from("mkc_files")
    .select("id, display_name, category:mkc_file_categories(name)")
    .eq("is_deleted", false)
    .or(orFilter)
    .limit(6);

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    categoryName: (row.category as unknown as { name: string } | null)?.name ?? null,
  }));
}

export type FileRequestOutcome =
  | { outcome: "not_a_file_request" }
  | { outcome: "matched"; requestId: string; fileName: string }
  | { outcome: "ambiguous"; requestId: string; candidates: FileCandidate[] }
  | { outcome: "no_match"; requestId: string };

/**
 * Entry point called from router.ts's routeAndAnswer, before the general
 * keyword-routed domain chat -- same placement as tryAnswerWithData. On a
 * match, this only creates a `mkc_file_requests` row with status='matched';
 * it does NOT deliver the file itself. Delivery happens asynchronously: the
 * Mac Mini agent (Filemanager repo) polls
 * GET /api/files/agent/requests/pending, fetches the file's bytes locally,
 * and POSTs them to /api/files/agent/requests/:id/deliver, which is what
 * actually sends the WhatsApp message (see that route for why the send
 * happens there, not here: only this app holds the WhatsApp credentials).
 */
export async function tryHandleFileRequest(question: string, senderWaNumber: string, employeeId: string | null): Promise<FileRequestOutcome> {
  const intent = await extractFileRequestIntent(question);
  if (!intent.isFileRequest) return { outcome: "not_a_file_request" };

  const supabase = createAdminClient();
  const candidates = await searchFileCandidates(supabase, intent.searchTerms);

  if (candidates.length === 0) {
    const { data } = await supabase
      .from("mkc_file_requests")
      .insert({
        requested_by_employee_id: employeeId,
        wa_phone_number: senderWaNumber,
        raw_query: question,
        status: "no_match",
        candidate_file_ids: [],
      })
      .select("id")
      .single();
    return { outcome: "no_match", requestId: data?.id ?? "" };
  }

  if (candidates.length > 1) {
    const { data } = await supabase
      .from("mkc_file_requests")
      .insert({
        requested_by_employee_id: employeeId,
        wa_phone_number: senderWaNumber,
        raw_query: question,
        status: "ambiguous",
        candidate_file_ids: candidates.map((c) => c.id),
      })
      .select("id")
      .single();
    return { outcome: "ambiguous", requestId: data?.id ?? "", candidates };
  }

  const match = candidates[0];
  const { data } = await supabase
    .from("mkc_file_requests")
    .insert({
      requested_by_employee_id: employeeId,
      wa_phone_number: senderWaNumber,
      raw_query: question,
      status: "matched",
      matched_file_id: match.id,
      candidate_file_ids: [match.id],
    })
    .select("id")
    .single();
  return { outcome: "matched", requestId: data?.id ?? "", fileName: match.displayName };
}

/** Human-readable WhatsApp reply for each outcome -- caller (router.ts) sends this as the immediate response; the actual file follows once the agent delivers it. */
export function formatFileRequestReply(result: FileRequestOutcome): string {
  switch (result.outcome) {
    case "matched":
      return `📁 Ketemu: *${result.fileName}*. Sedang saya siapkan, tunggu sebentar ya, filenya menyusul di chat ini.`;
    case "ambiguous":
      return `📁 Ada beberapa file yang cocok:\n${result.candidates.map((c, i) => `${i + 1}. ${c.displayName}${c.categoryName ? ` (${c.categoryName})` : ""}`).join("\n")}\n\nTolong sebutkan lebih spesifik nama filenya ya.`;
    case "no_match":
      return "📁 Maaf, tidak ada file yang cocok dengan permintaan itu di katalog. Coba sebutkan nama filenya lebih spesifik, atau hubungi admin.";
    case "not_a_file_request":
      return "";
  }
}
