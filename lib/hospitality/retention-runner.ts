import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { selectDueForDeletion, type RetentionCandidate } from "./retention";

const BUCKET = "hospitality-evidence";
const BATCH = 200;

export interface RetentionRunResult {
  runId: string | null;
  candidates: number;
  deleted: number;
  failed: number;
  error?: string;
}

/**
 * One cleanup pass (cron: /api/hospitality/retention, hourly). Storage's
 * remove() reports per-object results; an object that is already gone is
 * treated as deleted (the goal state), anything else is a failure to retry.
 */
export async function runEvidenceRetention(now = new Date()): Promise<RetentionRunResult> {
  const admin = createAdminClient();
  const { data: run } = await admin.from("mkc_chat_retention_runs").insert({}).select("id").single();
  const runId = run?.id ?? null;

  const finish = async (result: Omit<RetentionRunResult, "runId">) => {
    if (runId) {
      await admin
        .from("mkc_chat_retention_runs")
        .update({ finished_at: new Date().toISOString(), candidates: result.candidates, deleted: result.deleted, failed: result.failed, error: result.error ?? null })
        .eq("id", runId);
    }
    return { runId, ...result };
  };

  const { data, error } = await admin
    .from("mkc_chat_attachments")
    .select("id, object_path, expires_at, retention_hold_until, deleted_at, delete_attempts, last_delete_attempt_at")
    .is("deleted_at", null)
    .lte("expires_at", now.toISOString())
    // held rows never crowd out the batch
    .or(`retention_hold_until.is.null,retention_hold_until.lte.${now.toISOString()}`)
    .order("expires_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    logger.error("evidence retention: could not list candidates", { error: error.message });
    return finish({ candidates: 0, deleted: 0, failed: 0, error: error.message });
  }

  const due = selectDueForDeletion((data ?? []) as RetentionCandidate[], now);
  if (due.length === 0) return finish({ candidates: 0, deleted: 0, failed: 0 });

  const { data: removed, error: removeError } = await admin.storage.from(BUCKET).remove(due.map((d) => d.object_path));
  const attemptAt = new Date().toISOString();

  if (removeError) {
    // Whole-call failure: nothing is known to be deleted -- record and retry later.
    for (const d of due) {
      await admin
        .from("mkc_chat_attachments")
        .update({ delete_attempts: d.delete_attempts + 1, last_delete_error: removeError.message, last_delete_attempt_at: attemptAt })
        .eq("id", d.id);
    }
    logger.error("evidence retention: storage remove failed", { count: due.length, error: removeError.message });
    return finish({ candidates: due.length, deleted: 0, failed: due.length, error: removeError.message });
  }

  // remove() returns the objects it actually deleted. Anything not returned
  // is confirmed against storage: absent = gone (deleted), present = failed.
  const removedPaths = new Set((removed ?? []).map((o) => o.name));
  const notReturned = due.filter((d) => !removedPaths.has(d.object_path));
  const stillPresent = new Set<string>();
  for (const d of notReturned) {
    const dir = d.object_path.split("/").slice(0, -1).join("/");
    const file = d.object_path.split("/").pop() ?? "";
    const { data: listed } = await admin.storage.from(BUCKET).list(dir, { search: file, limit: 10 });
    if ((listed ?? []).some((o) => o.name === file)) stillPresent.add(d.object_path);
  }

  let deleted = 0;
  let failed = 0;
  for (const d of due) {
    if (stillPresent.has(d.object_path)) {
      failed += 1;
      await admin
        .from("mkc_chat_attachments")
        .update({ delete_attempts: d.delete_attempts + 1, last_delete_error: "Objek masih ada setelah penghapusan", last_delete_attempt_at: attemptAt })
        .eq("id", d.id);
    } else {
      deleted += 1;
      await admin
        .from("mkc_chat_attachments")
        .update({ deleted_at: attemptAt, delete_attempts: d.delete_attempts + 1, last_delete_error: null, last_delete_attempt_at: attemptAt })
        .eq("id", d.id);
    }
  }
  if (failed > 0) logger.warn("evidence retention: some objects were not deleted", { failed });
  return finish({ candidates: due.length, deleted, failed });
}
