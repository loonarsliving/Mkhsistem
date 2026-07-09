"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

import { deleteMemoAction, markMemoReadAction } from "../actions/memo.actions";

export function MemoReadButton({ memoId, alreadyRead }: { memoId: string; alreadyRead: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  if (alreadyRead) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-success/10 px-4 py-2 text-sm font-medium text-success">
        <CheckCircle2 className="h-4 w-4" /> Anda telah membaca memo ini
      </div>
    );
  }

  async function handleClick() {
    setLoading(true);
    const result = await markMemoReadAction(memoId);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menandai memo");
      return;
    }
    toast.success("Memo ditandai sudah dibaca");
    router.refresh();
  }

  return (
    <Button onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      Tandai Sudah Dibaca
    </Button>
  );
}

export function MemoDeleteButton({ memoId }: { memoId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    setLoading(true);
    const result = await deleteMemoAction(memoId);
    setLoading(false);
    setOpen(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus memo");
      return;
    }
    toast.success("Memo dihapus");
    router.push("/memo");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 text-destructive" /> Hapus
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Hapus memo ini?"
        description="Tindakan ini tidak dapat dibatalkan."
        destructive
        loading={loading}
        onConfirm={handleConfirm}
      />
    </>
  );
}
