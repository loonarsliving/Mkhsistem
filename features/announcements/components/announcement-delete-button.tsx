"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

import { deleteAnnouncementAction } from "../actions/announcement.actions";

export function AnnouncementDeleteButton({ announcementId }: { announcementId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    setLoading(true);
    const result = await deleteAnnouncementAction(announcementId);
    setLoading(false);
    setOpen(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus pengumuman");
      return;
    }
    toast.success("Pengumuman dihapus");
    router.push("/announcements");
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
        title="Hapus pengumuman ini?"
        description="Tindakan ini tidak dapat dibatalkan."
        destructive
        loading={loading}
        onConfirm={handleConfirm}
      />
    </>
  );
}
