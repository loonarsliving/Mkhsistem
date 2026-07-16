import { GoogleGenAI } from "@google/genai";

/**
 * The minimal slice of @google/genai's client surface GeminiProvider actually
 * calls — kept as a narrow interface (not `GoogleGenAI` directly) so tests can
 * inject a fake client instead of hitting the real Gemini API. Ported from
 * Aiagent's packages/ai-provider/src/providers/gemini.provider.ts.
 */
export type GeminiContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };

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
}

export function createGeminiClient(apiKey: string): GeminiClientLike {
  return new GoogleGenAI({ apiKey }) as unknown as GeminiClientLike;
}
