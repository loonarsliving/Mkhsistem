import "server-only";

import { generateAIText } from "@/lib/ai/service";

import { FRIDAY_ACTIONS, isKnownFridayAction } from "./action-catalog";
import { buildFridaySystemPrompt } from "./prompt";
import { renderSnapshotForPrompt, type FridaySignalSnapshot } from "./signals";

export type FridaySeverity = "normal" | "perhatian" | "kritis";

export interface FridaySolution {
  judul: string;
  ringkasan: string;
  keuntungan: string;
  kerugian: string;
  biaya_estimasi: string;
  dampak: "tinggi" | "sedang" | "rendah";
}

export interface FridayProposedAction {
  action_key: string;
  title: string;
  rationale: string;
  payload: Record<string, unknown>;
}

export interface FridayAnalysis {
  headline: string;
  severity: FridaySeverity;
  situasi: string;
  analisa: string;
  risiko: string;
  solusi: FridaySolution[];
  rekomendasi: string;
  hasil_diharapkan: string;
  actions: FridayProposedAction[];
  /** Anything the parser had to correct or discard, surfaced to the console so a degraded briefing is visibly degraded. */
  notes: string[];
}

/** Thrown when the model's output cannot be made into a valid briefing. Retryable — the job queue will try again with a fresh generation. */
export class FridayAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FridayAnalysisError";
  }
}

const SEVERITIES: readonly string[] = ["normal", "perhatian", "kritis"];
const IMPACTS: readonly string[] = ["tinggi", "sedang", "rendah"];

/**
 * Gemini is asked for raw JSON and usually obliges, but "usually" is not a
 * contract. This strips the two failure shapes seen in this codebase already
 * (see data-queries.ts's parseIntentJson): a markdown fence, and prose wrapped
 * around the object. Anything past that is a genuine malformation and should
 * fail loudly rather than be patched into something plausible.
 */
function extractJsonObject(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new FridayAnalysisError("Keluaran AI bukan JSON dan tidak mengandung objek JSON yang bisa diambil");
    }
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (err) {
      throw new FridayAnalysisError(`Keluaran AI tidak bisa di-parse sebagai JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function readText(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

function requireText(source: Record<string, unknown>, key: string): string {
  const value = readText(source, key);
  if (!value) throw new FridayAnalysisError(`Briefing tidak lengkap: bagian "${key}" kosong`);
  return value;
}

function parseSolutions(raw: unknown, notes: string[]): FridaySolution[] {
  if (!Array.isArray(raw)) {
    notes.push('Bagian "solusi" tidak berupa daftar — dikosongkan.');
    return [];
  }

  const solutions: FridaySolution[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const judul = readText(item, "judul");
    const ringkasan = readText(item, "ringkasan");
    if (!judul || !ringkasan) continue;

    const dampak = readText(item, "dampak").toLowerCase();
    solutions.push({
      judul,
      ringkasan,
      keuntungan: readText(item, "keuntungan") || "(tidak disebutkan)",
      // A solution presented with no downside is the single most common way an
      // executive summary misleads, so the absence is labelled rather than
      // rendered as an empty cell the reader's eye slides past.
      kerugian: readText(item, "kerugian") || "(tidak disebutkan — tinjau sendiri sebelum memutuskan)",
      biaya_estimasi: readText(item, "biaya_estimasi") || "(tidak disebutkan)",
      dampak: (IMPACTS.includes(dampak) ? dampak : "sedang") as FridaySolution["dampak"],
    });
  }

  if (solutions.length < 3) {
    notes.push(`Hanya ${solutions.length} alternatif solusi yang valid (kontrak meminta minimal 3) — pertimbangkan menjalankan ulang analisa.`);
  }
  return solutions;
}

/**
 * Discards any action whose key is not in the catalog.
 *
 * This is the enforcement point that makes the prompt's "jangan mengarang key"
 * more than a request. A hallucinated key would otherwise reach the database,
 * where friday_actions' check constraint would reject the whole insert and
 * cost the briefing — so it is filtered here, with a note, and the rest of the
 * analysis survives.
 */
function parseActions(raw: unknown, notes: string[]): FridayProposedAction[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    notes.push('Bagian "actions" tidak berupa daftar — diabaikan.');
    return [];
  }

  const actions: FridayProposedAction[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const key = readText(item, "action_key");
    if (!key) continue;

    if (!isKnownFridayAction(key)) {
      notes.push(`Aksi "${key}" tidak ada di katalog MKH System — diabaikan.`);
      continue;
    }

    const title = readText(item, "title");
    const rationale = readText(item, "rationale");
    if (!title || !rationale) {
      notes.push(`Aksi "${key}" tidak menyertakan judul/alasan yang jelas — diabaikan.`);
      continue;
    }

    const payload = item.payload;
    actions.push({
      action_key: key,
      title,
      rationale,
      payload: typeof payload === "object" && payload !== null && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {},
    });
  }

  // Matches the prompt's stated cap. A briefing proposing nine things is not a
  // briefing anyone acts on.
  if (actions.length > 4) {
    notes.push(`AI mengusulkan ${actions.length} aksi — dipotong menjadi 4 yang teratas.`);
    return actions.slice(0, 4);
  }
  return actions;
}

function parseAnalysis(text: string): FridayAnalysis {
  const parsed = extractJsonObject(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new FridayAnalysisError("Keluaran AI bukan objek JSON");
  }
  const root = parsed as Record<string, unknown>;
  const notes: string[] = [];

  const severityRaw = readText(root, "severity").toLowerCase();
  if (severityRaw && !SEVERITIES.includes(severityRaw)) {
    notes.push(`Severity "${severityRaw}" tidak dikenal — dianggap "perhatian".`);
  }

  const headline = readText(root, "headline");

  return {
    // A missing headline is cosmetic; the analysis below it is the substance,
    // so it degrades to the first sentence of the situation rather than
    // failing a briefing that is otherwise complete.
    headline: headline || requireText(root, "situasi").split(". ")[0].slice(0, 120),
    severity: (SEVERITIES.includes(severityRaw) ? severityRaw : "perhatian") as FridaySeverity,
    situasi: requireText(root, "situasi"),
    analisa: requireText(root, "analisa"),
    risiko: requireText(root, "risiko"),
    solusi: parseSolutions(root.solusi, notes),
    rekomendasi: requireText(root, "rekomendasi"),
    hasil_diharapkan: readText(root, "hasil_diharapkan") || "(tidak disebutkan)",
    actions: parseActions(root.actions, notes),
    notes,
  };
}

/** Exported for tests — the parser is where a bad generation becomes either a degraded briefing or a rejected one, so it is worth testing without a live model. */
export const __testables = { parseAnalysis, extractJsonObject };

export interface RunAnalysisOptions {
  /** Free-text executive question. Absent for the scheduled daily briefing, which is a standing "what should I know today". */
  question?: string | null;
  jobId?: string;
}

/**
 * One model call: the whole company snapshot in, one structured executive
 * briefing out.
 *
 * temperature is left at the provider default rather than pinned low. The
 * mechanical parts of this output (the numbers) come from the snapshot, not
 * the model; what is being asked for here is the generation of genuinely
 * different strategic alternatives, and a near-zero temperature reliably
 * produces three restatements of the same idea — which is exactly the failure
 * the three-alternatives rule exists to prevent.
 */
export async function runFridayAnalysis(snapshot: FridaySignalSnapshot, opts?: RunAnalysisOptions): Promise<FridayAnalysis> {
  const focus = opts?.question?.trim()
    ? `PERTANYAAN SPESIFIK DARI PIMPINAN — jadikan ini fokus utama analisa Anda, tapi tetap gunakan seluruh snapshot untuk mencari hubungan lintas domain:\n"${opts.question.trim()}"`
    : "Tidak ada pertanyaan spesifik. Ini adalah briefing eksekutif harian: tentukan sendiri apa hal terpenting yang harus diketahui pimpinan hari ini berdasarkan snapshot, dan jangan melaporkan hal yang tidak penting hanya supaya briefing terlihat panjang.";

  const response = await generateAIText({
    systemPrompt: buildFridaySystemPrompt(FRIDAY_ACTIONS),
    userPrompt: `${renderSnapshotForPrompt(snapshot)}\n\n---\n${focus}\n\nBalas HANYA dengan JSON sesuai kontrak.`,
    maxOutputTokens: 4096,
    jobId: opts?.jobId,
  });

  return parseAnalysis(response.text);
}
