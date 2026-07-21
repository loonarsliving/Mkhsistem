import type { ContentFocus } from "@/features/kontenai/types";

/**
 * Central brand/content-focus catalog. KontenAI is designed to run the same
 * production logic across multiple brands (Leasehold, Villa/Occupancy,
 * Beauty, and any future brand) by parameterizing on `ContentFocus` rather
 * than hardcoding brand-specific branches in each sprint module.
 */
export const CONTENT_FOCUS_VALUES: ContentFocus[] = ["general", "leasehold_sales", "occupancy", "beauty"];

export const BRAND_LABELS: Record<ContentFocus, string> = {
  general: "General",
  leasehold_sales: "Leasehold Sales",
  occupancy: "Villa / Occupancy",
  beauty: "Loonars Beauty",
};

/** Brand-specific tone guidance an AI Director-style function can lean on. */
export const BRAND_TONE_GUIDANCE: Record<ContentFocus, string> = {
  general: "Nada informatif dan ramah, cocok untuk audiens luas.",
  leasehold_sales: "Nada persuasif berorientasi urgensi dan kepercayaan investasi properti.",
  occupancy: "Nada hangat dan personal, menonjolkan pengalaman tinggal/menginap.",
  beauty: "Nada aspirational dan segar, menonjolkan hasil dan transformasi.",
};

/** Deterministic-ish brand pick from any string id, for reusable seed generators. */
export function brandFromSeed(seed: string): ContentFocus {
  const sum = [...seed].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return CONTENT_FOCUS_VALUES[sum % CONTENT_FOCUS_VALUES.length];
}
