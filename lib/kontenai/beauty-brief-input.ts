import type { Tables } from "@/types/database.types";

type LoonarsContentItem = Tables<"loonars_content_items">;

/**
 * How a Loonars Beauty content brief becomes AI Director input.
 *
 * Shared by the manual "Kirim ke KontenAI" button
 * (features/loonars-beauty/actions/kontenai-bridge.actions.ts) and the
 * automated beauty lane (processKontenAiAutoProduceBeauty in
 * app/api/ai/process-job) so both produce the same brief from the same row --
 * flipping the KontenAI toggle must not quietly change how beauty content is
 * briefed.
 */

/** Loonars Beauty's own product briefs are consistently persuasive/UGC/educational -- category maps reasonably onto AI Director's objective vocabulary without asking the user to pick one again. */
export function beautyObjectiveForCategory(category: LoonarsContentItem["category"]): "brand_awareness" | "leads" | "sales" | "engagement" {
  switch (category) {
    case "edukasi":
      return "brand_awareness";
    case "ugc":
      return "engagement";
    case "problem_solution":
    case "promosi":
    default:
      return "sales";
  }
}

export const BEAUTY_TARGET_AUDIENCE =
  "Wanita usia 18-35 tahun di Indonesia yang peduli perawatan kulit, aktif di TikTok/Instagram, dan mencari produk skincare terpercaya dengan hasil nyata.";

export function buildBeautyCampaignGoal(
  item: Pick<LoonarsContentItem, "category" | "hook" | "caption" | "script_notes" | "cta">,
): string {
  return [
    `Kategori konten: ${item.category}.`,
    item.hook ? `Hook: ${item.hook}` : "",
    item.caption ? `Caption: ${item.caption}` : "",
    item.script_notes ? `Arahan visual: ${item.script_notes}` : "",
    item.cta ? `CTA: ${item.cta}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
