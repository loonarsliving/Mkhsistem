/**
 * Evidence retention (Loonars Connect, 0291): chat attachments and
 * operational evidence are deleted 30 days after upload (expires_at, set by
 * a database trigger -- never by the client), unless an authorized,
 * audited retention hold is in force.
 *
 * Deletion removes the actual Storage OBJECT through the Storage API, then
 * stamps the attachment row deleted_at. The row itself (and the message,
 * checklist, issue and report it belongs to) stays: history survives, the
 * file does not. A failed delete is recorded and retried with backoff.
 */

export interface RetentionCandidate {
  id: string;
  object_path: string;
  expires_at: string;
  retention_hold_until: string | null;
  deleted_at: string | null;
  delete_attempts: number;
  last_delete_attempt_at: string | null;
}

/** Retry backoff after the n-th failed attempt: 1h, 2h, 4h ... capped at 24h. */
export function retryDelayMs(attempts: number): number {
  return Math.min(24, 2 ** Math.max(0, attempts - 1)) * 3_600_000;
}

/** Pure selection: which rows are due for deletion right now. */
export function selectDueForDeletion(rows: RetentionCandidate[], now: Date): RetentionCandidate[] {
  const t = now.getTime();
  return rows.filter((r) => {
    if (r.deleted_at) return false;
    if (Date.parse(r.expires_at) > t) return false;
    if (r.retention_hold_until && Date.parse(r.retention_hold_until) > t) return false;
    if (r.delete_attempts > 0 && r.last_delete_attempt_at) {
      if (Date.parse(r.last_delete_attempt_at) + retryDelayMs(r.delete_attempts) > t) return false;
    }
    return true;
  });
}
