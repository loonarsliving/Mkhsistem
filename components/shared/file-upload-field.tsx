"use client";

import * as React from "react";
import { File as FileIcon, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { uploadEntityFile } from "@/lib/supabase/storage";
import { formatFileSize } from "@/lib/utils";

export interface UploadedAttachment {
  file_url: string;
  file_name: string;
  file_size?: number;
  mime_type?: string;
}

interface FileUploadFieldProps {
  bucket: string;
  value: UploadedAttachment[];
  onChange: (attachments: UploadedAttachment[]) => void;
  maxFiles?: number;
}

export function FileUploadField({ bucket, value, onChange, maxFiles = 5 }: FileUploadFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (value.length + files.length > maxFiles) {
      toast.error(`Maksimal ${maxFiles} lampiran`);
      return;
    }

    setUploading(true);
    try {
      const uploaded: UploadedAttachment[] = [];
      for (const file of Array.from(files)) {
        const { path } = await uploadEntityFile(bucket, crypto.randomUUID(), file);
        uploaded.push({ file_url: path, file_name: file.name, file_size: file.size, mime_type: file.type });
      }
      onChange([...value, ...uploaded]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah lampiran");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        Tambah Lampiran
      </Button>
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((attachment, index) => (
            <li key={`${attachment.file_url}-${index}`} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{attachment.file_name}</span>
              <span className="text-xs text-muted-foreground">{formatFileSize(attachment.file_size)}</span>
              <button type="button" onClick={() => handleRemove(index)} aria-label="Hapus lampiran">
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
