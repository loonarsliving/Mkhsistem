import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { RenderEngineWorkspace } from "@/features/kontenai/render-engine/components/render-engine-workspace";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Render Engine" };

/**
 * Downloading every scene's asset + per-scene ffmpeg encode + concat + audio
 * mux all happen inside processRenderJobAction, which can run past the
 * Next.js/Vercel default Node function timeout -- 60s is safe across every
 * Vercel plan tier (Hobby included), same reasoning as the Video
 * Intelligence keyframe extraction in Sprint 2. Server actions inherit
 * their calling route's maxDuration, so this covers that action too.
 */
export const maxDuration = 60;

export default async function RenderEnginePage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Render Engine"
        description="Pilih storyboard yang sudah lengkap asetnya, lalu render otomatis menjadi video draft via FFmpeg -- urutan scene sesuai storyboard, durasi per scene, transisi fade sederhana, dan placeholder audio -- lengkap dengan progres, preview, dan unduhan."
      />
      <RenderEngineWorkspace />
    </div>
  );
}
