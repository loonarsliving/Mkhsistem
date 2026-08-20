import { NextResponse } from "next/server";

import { metaGraphRequest } from "@/lib/meta/client";
import { META_CONFIG } from "@/lib/meta/config";
import { requireSuperAdminSession } from "@/lib/rbac/session";
import { isInstagramConfigured } from "@/lib/social/instagram";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY production diagnostic -- same purpose as debug/meta-ads-config
 * but for the Instagram Graph API path (getInstagramAccountSnapshot /
 * getRecentInstagramMediaPerformance, lib/social/instagram.ts), which keeps
 * failing with "(#10) Application does not have permission for this
 * action" even after the operator regenerated the token and redeployed.
 * /me/permissions proves exactly which scopes this token actually carries
 * (vs whatever the Meta UI's "full access" toggle implied) -- that's the
 * one fact neither of us can see without calling the API directly. Remove
 * once Content Audit's Instagram capture works cleanly.
 *
 * Requires an authenticated Super Admin session -- see PUBLIC_PATHS' comment
 * in lib/supabase/middleware.ts.
 */
export async function GET() {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result: Record<string, unknown> = {
    META_IG_USER_ID_configured: Boolean(META_CONFIG.igUserId),
    META_IG_USER_ID_value: META_CONFIG.igUserId || null,
    isInstagramConfigured: isInstagramConfigured(),
  };

  if (!META_CONFIG.accessToken) {
    result.error = "META_ACCESS_TOKEN not set";
    return NextResponse.json(result);
  }

  try {
    result.tokenIdentity = await metaGraphRequest<{ id: string; name: string }>("/me", { fields: "id,name" });
  } catch (err) {
    result.tokenIdentityError = err instanceof Error ? err.message : String(err);
  }

  try {
    const permissions = await metaGraphRequest<{ data: { permission: string; status: string }[] }>("/me/permissions", {});
    result.grantedPermissions = permissions.data;
    result.hasInstagramBasic = (permissions.data ?? []).some((p) => p.permission === "instagram_basic" && p.status === "granted");
    result.hasInstagramManageInsights = (permissions.data ?? []).some((p) => p.permission === "instagram_manage_insights" && p.status === "granted");
  } catch (err) {
    result.permissionsError = err instanceof Error ? err.message : String(err);
  }

  try {
    const pages = await metaGraphRequest<{ data: { id: string; name: string; instagram_business_account?: { id: string; username?: string } }[] }>("/me/accounts", {
      fields: "id,name,instagram_business_account{id,username}",
      limit: 100,
    });
    result.accessiblePagesWithInstagram = pages.data;
    result.configuredIgUserIdMatchesAnyPage = (pages.data ?? []).some((p) => p.instagram_business_account?.id === META_CONFIG.igUserId);
  } catch (err) {
    result.accessiblePagesError = err instanceof Error ? err.message : String(err);
  }

  if (META_CONFIG.igUserId) {
    try {
      result.directIgUserLookup = await metaGraphRequest<{ id: string; username?: string; followers_count?: number }>(`/${META_CONFIG.igUserId}`, {
        fields: "id,username,followers_count",
      });
    } catch (err) {
      result.directIgUserLookupError = err instanceof Error ? err.message : String(err);
    }
  }

  // Ground truth on Business Verification -- the Meta UI's verification status
  // badges live in different, inconsistently-named places across Business
  // Settings pages, so read it straight from the API instead. /me/businesses
  // is empty for a System User token (that edge is for personal user
  // identities, not System Users -- a System User belongs to exactly one
  // Business by construction), so go via the Page instead: every Page this
  // token can manage already carries its owning Business's id, which we can
  // then look up directly for verification_status.
  try {
    const pagesWithBusiness = await metaGraphRequest<{ data: { id: string; name: string; business?: { id: string; name?: string } }[] }>("/me/accounts", {
      fields: "id,name,business",
      limit: 100,
    });
    result.pagesWithBusiness = pagesWithBusiness.data;

    const businessIds = [...new Set((pagesWithBusiness.data ?? []).map((p) => p.business?.id).filter((id): id is string => Boolean(id)))];
    const businesses: unknown[] = [];
    for (const businessId of businessIds) {
      try {
        businesses.push(await metaGraphRequest<{ id: string; name: string; verification_status?: string }>(`/${businessId}`, { fields: "id,name,verification_status" }));
      } catch (err) {
        businesses.push({ businessId, error: err instanceof Error ? err.message : String(err) });
      }
    }
    result.businesses = businesses;
  } catch (err) {
    result.businessesError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(result);
}
