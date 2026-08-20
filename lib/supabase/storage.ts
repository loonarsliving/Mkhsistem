"use client";

import { createClient } from "@/lib/supabase/client";
import { MAX_UPLOAD_SIZE_BYTES } from "@/constants/app";

interface UploadResult {
  path: string;
  publicUrl: string | null;
}

/**
 * Types every uploader in this app is allowed to accept. The real security
 * boundary is server-side: most buckets set `allowed_mime_types` on the
 * Supabase Storage bucket itself (see supabase/migrations/0010_storage.sql
 * and the buckets created alongside project-photos/promo-templates/
 * markom-content-submissions/siteplan-images), and Storage rejects any
 * upload whose actual Content-Type isn't on that list regardless of what
 * this client sends. This module-level allow-list is a second line of
 * defense that (a) fails fast client-side with a readable error instead of
 * a raw Storage API error, and (b) closes the gap for buckets that don't
 * set allowed_mime_types yet (memo-attachments, announcement-attachments,
 * leave-attachments -- restricted in the migration shipped alongside this
 * change; kontenai-assets stays intentionally unrestricted, see its own
 * comment below).
 */
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const ALLOWED_DOCUMENT_TYPES = ["application/pdf"];
const ALLOWED_UPLOAD_TYPES = new Set([...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES]);

// kontenai-assets is a deliberately general-purpose media library (image,
// video, audio, font, document, template -- see
// features/kontenai/asset-library/utils/asset-type-meta.ts) with no single
// sensible allow-list, so it's exempted from ALLOWED_UPLOAD_TYPES entirely
// rather than being either broken or left silently unchecked.
const UNRESTRICTED_TYPE_BUCKETS = new Set(["kontenai-assets"]);

/**
 * `file.type` is a client-supplied label (the browser's best-effort sniff),
 * never proof of what the bytes actually are -- so it is never trusted for
 * what gets SERVED back. Anything outside the known-safe image/video list
 * is uploaded with an explicit `application/octet-stream` Content-Type
 * instead of the browser-reported one, so opening the resulting URL forces
 * a download rather than letting a browser render/execute it inline (the
 * concrete risk: an .html or .svg renamed to look like a .pdf, served back
 * with a browser-executable Content-Type).
 */
function resolveUploadContentType(bucket: string, declaredType: string): string {
  if (UNRESTRICTED_TYPE_BUCKETS.has(bucket)) return declaredType || "application/octet-stream";

  if (!declaredType || !ALLOWED_UPLOAD_TYPES.has(declaredType)) {
    throw new Error(`Tipe file "${declaredType || "tidak diketahui"}" tidak diizinkan`);
  }
  return ALLOWED_IMAGE_TYPES.includes(declaredType) || ALLOWED_VIDEO_TYPES.includes(declaredType) ? declaredType : "application/octet-stream";
}

/**
 * Uploads a file to the given bucket under `{userId}/{timestamp}-{filename}`
 * (the convention the storage RLS policies expect for user-owned buckets).
 */
export async function uploadUserFile(
  bucket: string,
  userId: string,
  file: File | Blob,
  fileName: string,
): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("Ukuran file melebihi batas maksimum 5MB");
  }

  // Non-File Blob callers are always the JPEG selfie capture from
  // check-in-out-dialog.tsx (canvas.toBlob output carries no .type File
  // objects have), so "image/jpeg" there is the true type, not a guess.
  const declaredType = file instanceof File ? file.type : "image/jpeg";
  const contentType = resolveUploadContentType(bucket, declaredType);

  const supabase = createClient();
  const path = `${userId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType,
    upsert: false,
  });
  if (error) throw error;

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: publicUrlData.publicUrl };
}

/** Uploads a shared (non user-folder) attachment, e.g. memo/announcement files, under `{entityId}/{filename}`. maxSizeBytes defaults to 10MB (image-sized attachments); pass a larger value for buckets that also accept video, e.g. markom-content-submissions. */
export async function uploadEntityFile(
  bucket: string,
  entityId: string,
  file: File,
  maxSizeBytes: number = MAX_UPLOAD_SIZE_BYTES * 2,
): Promise<UploadResult> {
  if (file.size > maxSizeBytes) {
    throw new Error(`Ukuran file melebihi batas maksimum ${Math.round(maxSizeBytes / (1024 * 1024))}MB`);
  }

  const contentType = resolveUploadContentType(bucket, file.type);

  const supabase = createClient();
  const path = `${entityId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType,
    upsert: false,
  });
  if (error) throw error;

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: publicUrlData.publicUrl };
}
