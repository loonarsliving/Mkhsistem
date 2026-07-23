import "server-only";

import type { TypedSupabaseClient } from "@/lib/supabase/types";

const RENDER_BUCKET = "kontenai-renders";
const SUBMISSIONS_BUCKET = "markom-content-submissions";

export interface MovedRenderOutput {
  storagePath: string;
  publicUrl: string;
}

/**
 * Moves (not copies) a completed render's output from kontenai-renders into
 * markom-content-submissions -- Content Studio's own bucket, the only one
 * deleteSubmissionVideoFromStorage (repositories/content-submissions.repository.ts)
 * knows how to clean up once the submission is published. Deleting the
 * kontenai-renders copy here means the video never sits in storage twice.
 */
export async function moveRenderOutputToContentStudio(
  supabase: TypedSupabaseClient,
  input: { sourcePath: string; submissionOwnerId: string },
): Promise<MovedRenderOutput> {
  const { data: blob, error: downloadError } = await supabase.storage.from(RENDER_BUCKET).download(input.sourcePath);
  if (downloadError || !blob) throw new Error(`Gagal mengunduh hasil render dari storage: ${downloadError?.message}`);

  const buffer = Buffer.from(await blob.arrayBuffer());
  const destPath = `${input.submissionOwnerId}/kontenai-${Date.now()}.mp4`;

  const { error: uploadError } = await supabase.storage.from(SUBMISSIONS_BUCKET).upload(destPath, buffer, { contentType: "video/mp4", upsert: false });
  if (uploadError) throw new Error(`Gagal mengunggah hasil render ke Content Studio: ${uploadError.message}`);

  await supabase.storage.from(RENDER_BUCKET).remove([input.sourcePath]).catch(() => undefined);

  const { data: publicUrlData } = supabase.storage.from(SUBMISSIONS_BUCKET).getPublicUrl(destPath);
  return { storagePath: destPath, publicUrl: publicUrlData.publicUrl };
}
