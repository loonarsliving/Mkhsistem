import { GoogleGenAI } from "@google/genai";

/**
 * The minimal slice of @google/genai's client surface GeminiProvider actually
 * calls — kept as a narrow interface (not `GoogleGenAI` directly) so tests can
 * inject a fake client instead of hitting the real Gemini API. Ported from
 * Aiagent's packages/ai-provider/src/providers/gemini.provider.ts.
 */
export type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { fileUri: string; mimeType: string } };

export interface GeminiClientLike {
  models: {
    generateContent(params: {
      model: string;
      contents: string | { role: "user"; parts: GeminiContentPart[] }[];
      config?: {
        temperature?: number;
        maxOutputTokens?: number;
        systemInstruction?: string;
        responseMimeType?: string;
        thinkingConfig?: { thinkingLevel?: string };
        tools?: { googleSearch?: Record<string, never> }[];
      };
    }): Promise<{
      text?: string;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }>;
  };
  /**
   * Gemini's Files API -- used for video review (reviewContentSubmission)
   * once a video is too large to send inline (Gemini's generateContent has
   * a ~20MB total inline-request ceiling; Files API handles up to 2GB and
   * is the only way to review the 20-50MB clips Content Studio actually
   * allows). Files auto-expire after 48h on Google's side regardless, but
   * GeminiProvider explicitly deletes each one right after use so a review
   * doesn't leave temporary copies of Markom's content sitting around.
   */
  files: {
    upload(params: { file: Blob; config?: { mimeType?: string; displayName?: string } }): Promise<{ name?: string; uri?: string; state?: string }>;
    get(params: { name: string }): Promise<{ name?: string; uri?: string; state?: string }>;
    delete(params: { name: string }): Promise<unknown>;
  };
}

export function createGeminiClient(apiKey: string): GeminiClientLike {
  return new GoogleGenAI({ apiKey }) as unknown as GeminiClientLike;
}
