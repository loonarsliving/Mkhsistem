"use client";

import * as React from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { EVIDENCE_SLOT_LABELS, type EvidenceSlot } from "@/lib/hospitality/checklists";
import { uploadEntityFile } from "@/lib/supabase/storage";
import { cn } from "@/lib/utils";

import { registerAttachmentAction } from "../actions/chat.actions";
import { shrinkPhoto } from "./chat-utils";

export const EVIDENCE_BUCKET = "hospitality-evidence";

export interface UploadedEvidence {
  id: string;
  slot: EvidenceSlot;
  preview: string;
}

/**
 * Uploads one photo straight from the browser into the private evidence
 * bucket under <conversation>/<own uid>/ (storage RLS enforces both), then
 * registers it -- the database stamps uploaded_at / expires_at (30 days).
 */
export async function uploadEvidence(conversationId: string, userId: string, file: File, slot: EvidenceSlot): Promise<UploadedEvidence> {
  const isImage = file.type.startsWith("image/");
  const prepared = isImage ? await shrinkPhoto(file) : file;
  const { path } = await uploadEntityFile(EVIDENCE_BUCKET, `${conversationId}/${userId}`, prepared);
  const result = await registerAttachmentAction({ conversationId, objectPath: path, evidenceSlot: slot });
  if (!result.success || !result.data) throw new Error(result.error ?? "Foto gagal disimpan");
  return { id: result.data.id, slot, preview: isImage ? URL.createObjectURL(prepared) : "" };
}

/** One labelled photo slot (e.g. "Tempat tidur") -- big tap target, opens the phone camera. */
export function EvidenceSlotButton({
  conversationId,
  userId,
  slot,
  value,
  onChange,
  required,
  label,
}: {
  conversationId: string;
  userId: string;
  slot: EvidenceSlot;
  value: UploadedEvidence | null;
  onChange: (v: UploadedEvidence | null) => void;
  required?: boolean;
  label?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadEvidence(conversationId, userId, file, slot));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Foto gagal diunggah");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handle(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          "relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:bg-muted",
          value && "border-solid border-emerald-500",
          !value && required && "border-amber-400",
        )}
        aria-label={`Foto ${label ?? EVIDENCE_SLOT_LABELS[slot]}`}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : value?.preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={value.preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <Camera className="h-6 w-6" />
        )}
      </button>
      <span className="text-center text-[11px] leading-tight">
        {label ?? EVIDENCE_SLOT_LABELS[slot]}
        {required && !value && <span className="text-amber-600"> *</span>}
      </span>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="text-[11px] text-muted-foreground underline">
          ganti
        </button>
      )}
    </div>
  );
}

/** Any number of extra photos (problems, incidents). */
export function ExtraEvidence({
  conversationId,
  userId,
  value,
  onChange,
  slot = "problem",
  max = 6,
}: {
  conversationId: string;
  userId: string;
  value: UploadedEvidence[];
  onChange: (v: UploadedEvidence[]) => void;
  slot?: EvidenceSlot;
  max?: number;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: UploadedEvidence[] = [];
    try {
      for (const file of Array.from(files).slice(0, max - value.length)) {
        added.push(await uploadEvidence(conversationId, userId, file, slot));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Foto gagal diunggah");
    } finally {
      onChange([...value, ...added]);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handle(e.target.files)} />
      {value.map((v) => (
        <div key={v.id} className="relative h-14 w-14 overflow-hidden rounded-md border">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          {v.preview && <img src={v.preview} alt="" className="h-full w-full object-cover" />}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x.id !== v.id))}
            className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
            aria-label="Hapus foto dari laporan"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {value.length < max && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-14 w-14 items-center justify-center rounded-md border-2 border-dashed text-muted-foreground hover:bg-muted"
          aria-label="Tambah foto"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-5 w-5" />}
        </button>
      )}
    </div>
  );
}
