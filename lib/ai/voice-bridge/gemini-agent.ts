import "server-only";

import { GoogleGenAI, type Content, type Part } from "@google/genai";

import { AI_CONFIG, isGeminiConfigured } from "@/lib/ai/config";
import { listToolDefinitions, voiceBridgeTools, type VoiceBridgeToolName } from "./tools";
import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { CurrentSession } from "@/types/domain";

/**
 * The conversational half of the voice bridge: Ultron/FRIDAY sends the
 * operator's spoken text here, Gemini decides (via native function calling)
 * which voice-bridge tool(s) to call to answer it, and this loop executes
 * them in-process (not over HTTP, unlike the raw /voice-bridge route) before
 * asking Gemini for a final natural-language answer to speak back.
 *
 * Deliberately reuses AI_CONFIG (the same GEMINI_API_KEY already configured
 * for HR/Markom/CRM/kontenai) instead of introducing a second paid LLM —
 * this is a low-volume, latency-sensitive, single-operator use case that
 * doesn't need the shared retry/circuit-breaker machinery in
 * lib/ai/provider (that layer exists for the high-concurrency async job
 * queue; a dropped voice turn here just means the operator asks again).
 */

const MAX_TOOL_ROUNDS = 5;

const BASE_SYSTEM_PROMPT = `Kamu berbicara dengan Super Admin PT Maha Karya Haluoleo lewat mikrofon, lewat asisten suara klien mereka.
Jawabanmu akan dibacakan lewat text-to-speech, jadi:
- Selalu ringkas (1-4 kalimat), bahasa Indonesia natural, tanpa markdown/bullet/simbol.
- Sebutkan angka atau nama yang relevan langsung, jangan mendaftar mentah data JSON.`;

const COMPANY_ACCESS_PROMPT = `
- Kamu punya tool untuk menjawab pertanyaan tentang MK Connect (absensi, memo, pengumuman, karyawan, cabang, notifikasi, CRM, dll) -- selalu pakai tool itu dulu daripada menebak.
- Kalau sebuah aksi butuh data yang tidak kamu punya (misalnya id spesifik), coba cari lewat tool pencarian/list dulu sebelum menyerah.
- Kalau memang tidak ada tool yang cocok atau terjadi error, katakan dengan singkat dan jujur, jangan mengarang data.`;

const NO_COMPANY_ACCESS_PROMPT = `
- Kamu TIDAK punya akses ke data MK Connect pada giliran ini (tidak ada tool tersedia) -- jawab murni dari pengetahuan umummu (sains, geografi, definisi, hitungan, rekomendasi, dst), seperti asisten pengetahuan umum biasa.
- JANGAN PERNAH mengarang atau menebak data perusahaan (absensi, memo, karyawan, angka bisnis, dll) pada giliran ini. Kalau pertanyaannya jelas soal data MK Connect, katakan operator perlu mengucapkan "cek perusahaan" dulu untuk membuka akses itu, jangan berpura-pura tahu.`;

export interface VoiceTurn {
  role: "user" | "assistant";
  content: string;
}

export async function converseWithVoiceAssistant(
  supabase: TypedSupabaseClient,
  session: CurrentSession,
  message: string,
  history: VoiceTurn[],
  companyAccessEnabled: boolean,
): Promise<string> {
  if (!isGeminiConfigured()) {
    return "Aku belum tersambung ke otak utama -- GEMINI_API_KEY belum disetel di server.";
  }

  const client = new GoogleGenAI({ apiKey: AI_CONFIG.geminiApiKey });
  const functionDeclarations = companyAccessEnabled
    ? listToolDefinitions().map((tool) => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.parametersSchema,
      }))
    : [];

  const systemInstruction =
    BASE_SYSTEM_PROMPT + (companyAccessEnabled ? COMPANY_ACCESS_PROMPT : NO_COMPANY_ACCESS_PROMPT);

  const contents: Content[] = [
    ...history
      .filter((turn) => turn && typeof turn.content === "string" && (turn.role === "user" || turn.role === "assistant"))
      .map((turn): Content => ({ role: turn.role === "assistant" ? "model" : "user", parts: [{ text: turn.content }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.models.generateContent({
      model: AI_CONFIG.geminiModel,
      contents,
      config: {
        systemInstruction,
        temperature: AI_CONFIG.temperature,
        maxOutputTokens: AI_CONFIG.maxOutputTokens,
        ...(functionDeclarations.length > 0 ? { tools: [{ functionDeclarations }] } : {}),
      },
    });

    const functionCalls = response.functionCalls;
    if (!functionCalls || functionCalls.length === 0) {
      return (response.text ?? "").trim() || "Maaf, aku tidak punya jawaban untuk itu.";
    }

    // Push the model's own turn back verbatim (not reconstructed from just
    // `functionCalls`) -- Gemini 3.x's function-calling parts carry a
    // thoughtSignature the next request must echo back, and rebuilding the
    // parts from scratch silently drops it, which the API then rejects with
    // "Function call is missing a thought_signature" on the next round.
    const modelContent = response.candidates?.[0]?.content;
    contents.push(modelContent ?? { role: "model", parts: functionCalls.map((call): Part => ({ functionCall: call })) });

    const responseParts = await Promise.all(
      functionCalls.map(async (call): Promise<Part> => {
        const output = await runTool(supabase, session, call.name, call.args ?? {});
        return { functionResponse: { name: call.name, response: { result: output } } };
      }),
    );
    contents.push({ role: "user", parts: responseParts });
  }

  return "Maaf, permintaan ini butuh terlalu banyak langkah. Coba dipersempit jadi beberapa perintah.";
}

async function runTool(supabase: TypedSupabaseClient, session: CurrentSession, name: string | undefined, input: unknown) {
  if (!name || !(name in voiceBridgeTools)) return { error: `Unknown tool: ${name}` };

  const tool = voiceBridgeTools[name as VoiceBridgeToolName];
  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input", issues: parsed.error.issues };

  try {
    return await tool.handler(supabase, session, parsed.data as never);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool call failed" };
  }
}
