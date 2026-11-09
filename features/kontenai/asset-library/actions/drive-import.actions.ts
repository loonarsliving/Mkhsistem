"use server";

import { revalidatePath } from "next/cache";

import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { importKontenAiAssetsFromDrive, type DriveImportSummary } from "@/lib/kontenai/drive-import";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

const ASSET_LIBRARY_PATH = "/kontenai/asset-library";

/** "Sync from Drive" -- walks the KontenAI/{Brand}/{ContentType}/{Foto,Vidio} tree and imports any footage not already in the Asset Library, with company/content_type taken from the folder path itself (see lib/kontenai/drive-import.ts). */
export async function syncKontenAiAssetsFromDriveAction(): Promise<ActionResult<DriveImportSummary>> {
  const session = await requireKontenAiAccess();
  const supabase = await createClient();
  try {
    const summary = await importKontenAiAssetsFromDrive(supabase, session.userId);
    revalidatePath(ASSET_LIBRARY_PATH);
    return actionSuccess(summary);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal sinkronisasi dari Google Drive");
  }
}
