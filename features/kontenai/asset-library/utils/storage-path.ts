/** Builds the `entityId` prefix uploadEntityFile expects, from the asset's classification, so files land under a browsable path in the bucket (e.g. Leasehold/Yogyakarta-Residence/Ramadan-Promo/instagram/reel/2026-07-22-file.mp4) without needing a literal nested-folder feature -- classification lives in the DB row, this only affects where the physical object sits in storage. */
export function buildAssetStoragePrefix(classification: {
  company: string | null;
  project: string | null;
  campaign: string | null;
  platform: string | null;
  contentType: string | null;
}): string {
  const segments = [classification.company, classification.project, classification.campaign, classification.platform, classification.contentType]
    .filter((segment): segment is string => Boolean(segment && segment.trim()))
    .map((segment) => segment.trim().replace(/[^a-zA-Z0-9._-]+/g, "-"));

  const dateSegment = new Date().toISOString().slice(0, 10);
  segments.push(dateSegment);

  return segments.length > 0 ? segments.join("/") : dateSegment;
}
