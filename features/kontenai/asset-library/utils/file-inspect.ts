"use client";

export interface InspectedFileMeta {
  resolution: string | null;
  durationSeconds: number | null;
}

/** Reads dimensions/duration from the browser before upload -- best-effort, never blocks the upload if it fails or times out. */
export function inspectFile(file: File): Promise<InspectedFileMeta> {
  if (file.type.startsWith("image/")) return inspectImage(file);
  if (file.type.startsWith("video/")) return inspectVideo(file);
  if (file.type.startsWith("audio/")) return inspectAudio(file);
  return Promise.resolve({ resolution: null, durationSeconds: null });
}

function inspectImage(file: File): Promise<InspectedFileMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    img.onload = () => {
      resolve({ resolution: `${img.naturalWidth}x${img.naturalHeight}`, durationSeconds: null });
      cleanup();
    };
    img.onerror = () => {
      resolve({ resolution: null, durationSeconds: null });
      cleanup();
    };
    img.src = url;
  });
}

function inspectVideo(file: File): Promise<InspectedFileMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const cleanup = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => {
      resolve({ resolution: `${video.videoWidth}x${video.videoHeight}`, durationSeconds: Math.round(video.duration) });
      cleanup();
    };
    video.onerror = () => {
      resolve({ resolution: null, durationSeconds: null });
      cleanup();
    };
    video.src = url;
  });
}

function inspectAudio(file: File): Promise<InspectedFileMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const cleanup = () => URL.revokeObjectURL(url);
    audio.onloadedmetadata = () => {
      resolve({ resolution: null, durationSeconds: Math.round(audio.duration) });
      cleanup();
    };
    audio.onerror = () => {
      resolve({ resolution: null, durationSeconds: null });
      cleanup();
    };
    audio.src = url;
  });
}
