import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { uploadAdImageFromUrl, updateAdCreative } from "@/lib/meta/ads";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY one-off op: swap fresh, higher-intent copy onto the two live ads
 * whose cost-per-WhatsApp-conversation was far above the account's own
 * proven benchmark (Griya Cariu Indah, Rp11.636/conversation vs. these two
 * at Rp44-50k) -- diagnosed as low click->chat completion, not a targeting
 * or platform problem. Meant to run exactly twice (Green Cibarusah, Loonars
 * Living) then be deleted -- unlike debug/instagram-config this one performs
 * a real write against a live ad account, so it shouldn't be left lying
 * around after use. No auth guard, same as debug/instagram-config -- both
 * are meant to be deleted right after their one-time use, not to persist.
 */
interface RefreshBody {
  campaignDbId: string;
  headline: string;
  primaryText: string;
  description?: string;
  welcomeMessage: string;
}

/** GET variant (query params) so this can be triggered from an environment that can only issue GET fetches to Vercel deployment URLs, not arbitrary POSTs. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const campaignDbId = params.get("campaignDbId");
  const headline = params.get("headline");
  const primaryText = params.get("primaryText");
  const welcomeMessage = params.get("welcomeMessage");
  if (!campaignDbId || !headline || !primaryText || !welcomeMessage) {
    return NextResponse.json({ error: "missing required query params" }, { status: 400 });
  }
  return runRefresh({ campaignDbId, headline, primaryText, description: params.get("description") ?? undefined, welcomeMessage });
}

export async function POST(req: Request) {
  const body = (await req.json()) as RefreshBody;
  return runRefresh(body);
}

async function runRefresh(body: RefreshBody) {
  const supabase = createAdminClient();
  const { data: campaign, error } = await supabase
    .from("meta_ad_campaigns")
    .select("id, meta_ad_id, photo:photo_id(public_url)")
    .eq("id", body.campaignDbId)
    .single();

  if (error || !campaign) return NextResponse.json({ error: error?.message ?? "campaign not found" }, { status: 404 });
  if (!campaign.meta_ad_id) return NextResponse.json({ error: "campaign has no meta_ad_id, not launched" }, { status: 400 });
  const photoUrl = (campaign.photo as { public_url?: string } | null)?.public_url;
  if (!photoUrl) return NextResponse.json({ error: "no photo public_url" }, { status: 400 });

  try {
    const imageHash = await uploadAdImageFromUrl(photoUrl);
    const result = await updateAdCreative(campaign.meta_ad_id, {
      name: `${body.headline} - Creative Refresh ${new Date().toISOString().slice(0, 10)}`,
      imageHash,
      headline: body.headline,
      primaryText: body.primaryText,
      description: body.description,
      welcomeMessage: body.welcomeMessage,
    });

    await supabase
      .from("meta_ad_campaigns")
      .update({
        headline: body.headline,
        primary_text: body.primaryText,
        description: body.description,
        welcome_message: body.welcomeMessage,
        meta_creative_id: result.creativeId,
      })
      .eq("id", body.campaignDbId);

    return NextResponse.json({ ok: true, newCreativeId: result.creativeId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
