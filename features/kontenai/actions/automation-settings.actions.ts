"use server";

import { revalidatePath } from "next/cache";

import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getKontenAiAutomationEnabled, setKontenAiAutomationEnabled } from "@/repositories/kontenai-automation-settings.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

const KONTENAI_PATH = "/kontenai";

export async function getKontenAiAutomationEnabledAction(): Promise<boolean> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return getKontenAiAutomationEnabled(supabase);
}

/**
 * Flips the daily automation toggle (kontenai_automation_dispatch, pg_cron
 * every 5 minutes, checks this before enqueueing anything). Turning it on
 * does not immediately do anything by itself -- the next dispatch tick
 * picks up eligible pending kpi_tasks/completed render jobs.
 */
export async function setKontenAiAutomationEnabledAction(enabled: boolean): Promise<ActionResult<{ enabled: boolean }>> {
  const session = await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    await setKontenAiAutomationEnabled(supabase, enabled, session.userId);
    revalidatePath(KONTENAI_PATH);
    return actionSuccess({ enabled });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal mengubah pengaturan automasi");
  }
}
