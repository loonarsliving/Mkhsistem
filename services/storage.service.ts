import "server-only";

import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_TTL_SECONDS = 60 * 10;

/**
 * Resolves a storage object path to a short-lived signed URL. Used for the
 * private buckets (selfies, memo/announcement/leave attachments) — public
 * buckets (avatars, company-assets) can be rendered directly via their
 * public URL instead.
 */
export async function getSignedUrl(bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

/** Resolves a storage object path to its public URL. Used for public buckets (project-photos, siteplan-images) -- no network round trip like getSignedUrl above, just URL formatting, but still routed through here so callers don't reach into supabase.storage directly. */
export async function getPublicUrl(bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function getSignedUrls(bucket: string, paths: (string | null)[]): Promise<Record<string, string>> {
  const validPaths = paths.filter((p): p is string => Boolean(p));
  if (validPaths.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(validPaths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return {};

  const entries = data
    .filter((d): d is typeof d & { signedUrl: string } => Boolean(d.signedUrl))
    .map((d) => [d.path ?? "", d.signedUrl] as const);
  return Object.fromEntries(entries);
}
