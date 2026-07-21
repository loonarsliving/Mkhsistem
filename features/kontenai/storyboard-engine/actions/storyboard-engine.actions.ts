"use server";

import type { ProductionDirective, SceneTransition, Storyboard, StoryboardScene } from "@/features/kontenai/types";
import { getMockDb } from "@/features/kontenai/lib/mock-db";
import { generateId } from "@/features/kontenai/lib/ids";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

/**
 * Sprint 4 - Storyboard Engine.
 *
 * Turns a Production Directive (Sprint 3 - AI Director) into a concrete
 * storyboard: scenes, durations, transitions, subtitle/text overlay, and a
 * per-scene shot list (`requiredAssetTags`) that Asset Selector (Sprint 5)
 * matches assets against. Directives and storyboards live in the shared
 * `getMockDb()` store so every sprint sees the same objects.
 */

export async function listDirectivesAction(): Promise<ProductionDirective[]> {
  return getMockDb().directives;
}

/** Small deterministic string hash so re-generating the same directive gives stable-but-varied durations. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}...`;
}

function buildScenes(directive: ProductionDirective): StoryboardScene[] {
  const scenes: StoryboardScene[] = [];
  let order = 0;

  const pushScene = (params: {
    description: string;
    textOverlay: string | null;
    transition: SceneTransition;
    tags: string[];
    seedKey: string;
    baseDuration: number;
  }) => {
    const variance = hashString(`${directive.id}-${params.seedKey}`) % 3; // 0, 1, or 2 extra seconds
    scenes.push({
      id: generateId("scene"),
      order,
      description: params.description,
      durationSeconds: params.baseDuration + variance,
      transition: params.transition,
      textOverlay: params.textOverlay,
      requiredAssetTags: params.tags,
      selectedAssetId: null,
    });
    order += 1;
  };

  // Opening hook scene, grounded in the directive's narrative angle. Fades
  // in so the sequence has a deliberate, non-jarring start.
  pushScene({
    description: `Hook pembuka: ${directive.narrativeAngle}, langsung menarik perhatian dalam 3 detik pertama.`,
    textOverlay: truncate(directive.narrativeAngle, 60),
    transition: "fade",
    tags: [...directive.recommendedAssetTags.slice(0, 2), "hook"],
    seedKey: "hook",
    baseDuration: 3,
  });

  // One scene per key message. The middle message is treated as the "reveal"
  // moment (the payoff of the narrative angle) and gets a zoom transition;
  // the rest alternate cut/slide to keep a punchy, non-repetitive rhythm.
  const revealIndex = Math.floor((directive.keyMessages.length - 1) / 2);
  directive.keyMessages.forEach((message, index) => {
    const isReveal = directive.keyMessages.length > 1 && index === revealIndex;
    const transition: SceneTransition = isReveal ? "zoom" : index % 2 === 0 ? "cut" : "slide";
    pushScene({
      description: `Menampilkan poin: "${message}" dengan visual bergaya ${directive.visualStyle.toLowerCase()}.`,
      textOverlay: truncate(message, 70),
      transition,
      tags: [
        directive.recommendedAssetTags[index % Math.max(directive.recommendedAssetTags.length, 1)] ?? directive.targetPlatform,
        isReveal ? "reveal" : "b_roll",
      ],
      seedKey: `message-${index}`,
      baseDuration: isReveal ? 5 : 4,
    });
  });

  // Closing CTA scene, fades out to bookend the opening fade.
  pushScene({
    description: `Penutup dengan ajakan bertindak: ${directive.callToAction}.`,
    textOverlay: truncate(directive.callToAction, 60),
    transition: "fade",
    tags: [directive.recommendedAssetTags[directive.recommendedAssetTags.length - 1], "cta"],
    seedKey: "cta",
    baseDuration: 3,
  });

  return scenes;
}

export async function generateStoryboardAction(directiveId: string): Promise<Storyboard> {
  const db = getMockDb();
  const directive = db.directives.find((d) => d.id === directiveId);
  if (!directive) {
    throw new Error(`Directive ${directiveId} tidak ditemukan`);
  }

  // Simulate AI generation latency (800-1500ms).
  const delayMs = 800 + (hashString(`${directiveId}-${Date.now()}`) % 700);
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  const scenes = buildScenes(directive);
  const totalDurationSeconds = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);

  const storyboard: Storyboard = {
    id: generateId("storyboard"),
    directiveId,
    scenes,
    totalDurationSeconds,
    createdAt: new Date().toISOString(),
  };

  db.storyboards.push(storyboard);

  return storyboard;
}

/**
 * Persists manual edits made in the scene editor UI (reorder, duration,
 * transition, text overlay, tags) back into the shared storyboard object so
 * Asset Selector / Render Engine / Production Pipeline see the edited
 * version rather than the original generated one.
 */
export async function updateStoryboardScenesAction(
  storyboardId: string,
  scenes: StoryboardScene[],
): Promise<ActionResult<Storyboard>> {
  const db = getMockDb();
  const storyboard = db.storyboards.find((s) => s.id === storyboardId);
  if (!storyboard) {
    return actionError(`Storyboard ${storyboardId} tidak ditemukan`);
  }

  const normalizedScenes = scenes.map((scene, index) => ({ ...scene, order: index }));
  storyboard.scenes = normalizedScenes;
  storyboard.totalDurationSeconds = normalizedScenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);

  return actionSuccess(storyboard);
}
