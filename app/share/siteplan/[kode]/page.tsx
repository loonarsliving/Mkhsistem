import type { Metadata } from "next";

import { PublicSiteplanShareView } from "@/features/siteplan/components/public-siteplan-share-view";
import { createClient } from "@/lib/supabase/server";
import { getPublicSiteplanStatus } from "@/repositories/loonars-siteplan.repository";

// This page must never be statically prerendered: it needs a live read of loonars_units on every
// visit (that is the entire point of a "live siteplan" a family member keeps open), and per the
// (auth) layout's own note, a statically prerendered page would also bake in a stale CSP nonce.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ kode: string }>;
}

/**
 * The marketing render is specific artwork per project (hand-placed marker coordinates in
 * PublicSiteplanShareView are read off this exact image), so it is not derived from `kode`
 * automatically -- a project only gets a live share page once its image is added here. Add an
 * entry (and matching marker positions in public-siteplan-share-view.tsx) before marking another
 * project's loonars_projects.publicly_shareable true.
 */
const SHARE_IMAGE_BY_KODE: Record<string, { src: string; width: number; height: number }> = {
  LNR2: { src: "/siteplan/loonars-2-marketing.jpg", width: 1024, height: 1536 },
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kode } = await params;
  const supabase = await createClient();
  const status = await getPublicSiteplanStatus(supabase, kode).catch(() => null);
  return { title: status ? `Siteplan ${status.nama}` : "Siteplan" };
}

/**
 * Public, unauthenticated live siteplan status -- a sales rep shares this link (over WhatsApp,
 * typically) with a buyer's family so they can see which blocks are already taken without needing
 * an MK Connect account. See migration 0265_loonars_public_siteplan_status.sql: the RPC behind this
 * only ever returns block/status for a project the owner explicitly marked publicly_shareable, and
 * never touches price or buyer data.
 *
 * No requireSession()/requirePermission() here on purpose -- this route is deliberately public (see
 * lib/supabase/middleware.ts's PUBLIC_PATHS entry for /share/siteplan).
 */
export default async function PublicSiteplanSharePage({ params }: PageProps) {
  const { kode } = await params;
  const supabase = await createClient();
  const status = await getPublicSiteplanStatus(supabase, kode).catch(() => null);
  const image = status ? SHARE_IMAGE_BY_KODE[status.kode] : undefined;

  if (!status || !image) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-lg font-semibold">Siteplan tidak ditemukan</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          Tautan ini tidak valid atau siteplan tidak lagi dibagikan secara publik.
        </p>
      </div>
    );
  }

  return <PublicSiteplanShareView nama={status.nama} units={status.units} imageSrc={image.src} imageWidth={image.width} imageHeight={image.height} />;
}
