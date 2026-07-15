import "server-only";

function normalizeAdAccountId(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`;
}

/**
 * Env-driven Meta Marketing API configuration (Ads Specialist module).
 * Entirely separate from WHATSAPP_CONFIG (lib/ai/config.ts) -- that's the
 * Whacenter gateway used for internal notifications, this is the official
 * Meta Business/WhatsApp Business Platform used for Click-to-WhatsApp ads.
 * A Click-to-WhatsApp ad's actual destination number comes from whichever
 * WhatsApp Business Account is linked to META_PAGE_ID in Business Manager,
 * not from an API field -- META_WHATSAPP_PHONE_NUMBER here is only used to
 * render the ad creative's fallback wa.me link.
 */
export const META_CONFIG = {
  apiVersion: process.env.META_API_VERSION ?? "v21.0",
  accessToken: process.env.META_ACCESS_TOKEN ?? "",
  adAccountId: process.env.META_AD_ACCOUNT_ID ? normalizeAdAccountId(process.env.META_AD_ACCOUNT_ID) : "",
  pageId: process.env.META_PAGE_ID ?? "",
  businessId: process.env.META_BUSINESS_ID ?? "",
  igUserId: process.env.META_IG_USER_ID ?? "",
  whatsappPhoneNumber: process.env.META_WHATSAPP_PHONE_NUMBER ?? "",
  /** Hard safety ceiling on total daily ad spend the AI is allowed to commit across all active campaigns, in IDR. 0 = AI may not launch/scale any campaign (fail closed, not open). */
  dailyBudgetCapIdr: Number(process.env.META_ADS_DAILY_BUDGET_CAP_IDR ?? "0"),
} as const;

export function isMetaConfigured(): boolean {
  return META_CONFIG.accessToken.length > 0 && META_CONFIG.adAccountId.length > 0 && META_CONFIG.pageId.length > 0;
}
