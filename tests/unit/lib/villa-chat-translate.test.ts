import { describe, expect, it } from "vitest";

import { normalizeLanguageCode, parseTranslationReply } from "@/lib/ai/domains/villa-chat-translate";

describe("normalizeLanguageCode", () => {
  it("keeps the lowercase base code", () => {
    expect(normalizeLanguageCode("en")).toBe("en");
    expect(normalizeLanguageCode("ZH-TW")).toBe("zh");
    expect(normalizeLanguageCode("pt_BR")).toBe("pt");
    expect(normalizeLanguageCode(" id ")).toBe("id");
  });
  it("rejects anything that isn't a language code", () => {
    expect(normalizeLanguageCode("English")).toBeNull();
    expect(normalizeLanguageCode("")).toBeNull();
    expect(normalizeLanguageCode(42)).toBeNull();
    expect(normalizeLanguageCode("en; drop table")).toBeNull();
  });
});

describe("parseTranslationReply", () => {
  it("parses plain JSON", () => {
    expect(parseTranslationReply('{"detected_language":"en","translation":"Apakah ada unit kosong?"}')).toEqual({
      detectedLanguage: "en",
      translation: "Apakah ada unit kosong?",
    });
  });
  it("parses JSON wrapped in a code fence, keeping line breaks and emojis", () => {
    const raw = '```json\n{"detected_language": "id", "translation": "Hi John 👋\\nSee you soon!"}\n```';
    expect(parseTranslationReply(raw)).toEqual({ detectedLanguage: "id", translation: "Hi John 👋\nSee you soon!" });
  });
  it("throws on an unusable reply instead of passing garbage to the guest", () => {
    expect(() => parseTranslationReply("Sure! Here is the translation: hello")).toThrow();
    expect(() => parseTranslationReply('{"detected_language":"en","translation":"   "}')).toThrow();
    expect(() => parseTranslationReply('{"detected_language":"English","translation":"x"}')).toThrow();
  });
});
