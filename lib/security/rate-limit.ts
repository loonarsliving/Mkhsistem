import "server-only";

/**
 * Minimal in-memory sliding-window limiter for repeated *failed*
 * authentication attempts against the shared-secret bridge/cron endpoints
 * (see lib/security/cron-auth.ts, app/api/wa/send, app/api/villa/deploy,
 * app/api/villa/secrets). Deliberately not general request throttling --
 * it's only ever consulted on the auth-failure path, so legitimate callers
 * presenting a valid secret are never slowed down or counted.
 *
 * In-memory means each serverless instance/container tracks its own
 * counts independently (no cross-instance coordination, and counts reset
 * on cold start). That's an acceptable trade-off here: the goal is raising
 * the cost of brute-forcing a static secret from a single source, not
 * providing a hard, globally-consistent cap. No new dependency -- a
 * shared Redis/KV-backed limiter would be more precise but none of these
 * endpoints need that precision to meaningfully blunt naive brute-forcing.
 */

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 5;

const failureBuckets = new Map<string, number[]>();

/** Best-effort client identity for rate-limit bucketing. Not auth -- spoofable, only used to key the limiter. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Records one failed auth attempt under `key` and reports whether the
 * caller has now exceeded `limit` failures within `windowMs`. Callers
 * should key by route + client IP (see getClientIp) so one noisy caller
 * can't lock out everyone else hitting the same route.
 */
export function recordAuthFailure(key: string, opts?: { limit?: number; windowMs?: number }): boolean {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const windowMs = opts?.windowMs ?? WINDOW_MS;
  const now = Date.now();

  const timestamps = (failureBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  failureBuckets.set(key, timestamps);

  // Opportunistic cleanup so the map doesn't grow unbounded across a long
  // process lifetime -- only runs once the bucket count gets large, and
  // only drops buckets whose every entry has already aged out.
  if (failureBuckets.size > 5000) {
    for (const [bucketKey, bucketTimestamps] of failureBuckets) {
      if (bucketTimestamps.every((t) => now - t >= windowMs)) failureBuckets.delete(bucketKey);
    }
  }

  return timestamps.length > limit;
}

/** Clears the failure bucket for `key`, e.g. after a successful auth, so a legitimate caller isn't penalized for earlier typos. */
export function clearAuthFailures(key: string): void {
  failureBuckets.delete(key);
}
