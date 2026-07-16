"use client";

import { createClient } from "@/lib/supabase/client";
import { MAX_UPLOAD_SIZE_BYTES } from "@/constants/app";

interface UploadResult {
  path: string;
  publicUrl: string | null;
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

  const supabase = createClient();
  const path = `${userId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file instanceof File ? file.type : "image/jpeg",
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

  const supabase = createClient();
  const path = `${entityId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: publicUrlData.publicUrl };
}
