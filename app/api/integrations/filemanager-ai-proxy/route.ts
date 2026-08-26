import { NextResponse } from "next/server";

import { generateAIText } from "@/lib/ai/service";
import { logger } from "@/lib/logger";
import { requireFilemanagerAiProxyAuth } from "@/lib/security/filemanager-ai-proxy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PROMPT_CHARS = 8000;
const MAX_OUTPUT_TOKENS_CAP = 2048;

/**
 * The ONLY endpoint the standalone `Filemanager` repo (its own WhatsApp
 * connection, its own SQLite database, running on the owner's Mac Mini)
 * calls on this app: a plain Gemini text completion, routed through MK
 * Connect's already-configured GEMINI_API_KEY + retry/circuit-breaker
 * stack (lib/ai/service.ts) instead of the Mac Mini needing its own Gemini
 * API key. Filemanager decides what to ask for (intent classification,
 * matching a WhatsApp message to a filename, etc.) — this route has no
 * awareness of "files" or "WhatsApp" at all, it's a generic text-in/
 * text-out proxy, deliberately kept that thin so this app never needs to
 * know anything about Filemanager's own domain logic or database.
 *
 * Bounded (MAX_PROMPT_CHARS, MAX_OUTPUT_TOKENS_CAP) so a compromised or
 * buggy caller can't turn this into an unbounded way to spend this app's
 * Gemini quota — the shared secret (requireFilemanagerAiProxyAuth) is the
 * real gate; these are a second, cheap backstop.
 */
export async function POST(request: Request) {
  const unauthorized = requireFilemanagerAiProxyAuth(request);
  if (unauthorized) return unauthorized;

  let body: { systemPrompt?: unknown; userPrompt?: unknown; maxOutputTokens?: unknown; responseFormat?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", error: "invalid JSON body" }, { status: 400 });
  }

  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  const userPrompt = typeof body.userPrompt === "string" ? body.userPrompt.trim() : "";
  if (!systemPrompt || !userPrompt) {
    return NextResponse.json({ status: "error", error: "systemPrompt and userPrompt are required" }, { status: 400 });
  }
  if (systemPrompt.length > MAX_PROMPT_CHARS || userPrompt.length > MAX_PROMPT_CHARS) {
    return NextResponse.json({ status: "error", error: `systemPrompt/userPrompt exceed ${MAX_PROMPT_CHARS} characters` }, { status: 400 });
  }

  const requestedMaxOutputTokens = typeof body.maxOutputTokens === "number" ? body.maxOutputTokens : undefined;
  const maxOutputTokens = requestedMaxOutputTokens ? Math.min(requestedMaxOutputTokens, MAX_OUTPUT_TOKENS_CAP) : undefined;
  const responseFormat = body.responseFormat === "json" ? "json" : "text";

  try {
    const result = await generateAIText({ systemPrompt, userPrompt, maxOutputTokens, responseFormat, maxAttempts: 1 });
    return NextResponse.json({ status: "ok", text: result.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("filemanager-ai-proxy: Gemini call failed", { error: message });
    return NextResponse.json({ status: "error", error: message }, { status: 502 });
  }
}
