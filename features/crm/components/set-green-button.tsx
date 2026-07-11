"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

import { setProspectGreenAction } from "../actions/crm.actions";

export function SetGreenButton({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    setLoading(true);
    const result = await setProspectGreenAction(prospectId);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memperbarui status");
      return;
    }
    toast.success("Prospect ditandai siap, menunggu verifikasi Finance");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CheckCircle2 className="h-4 w-4" /> Tandai Siap (Green)
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Tandai prospect siap?"
        description="Status akan berubah menjadi Green — menunggu verifikasi Finance. Ini BUKAN status Closing; hanya Finance yang dapat menetapkan Closing setelah pembayaran diverifikasi."
        confirmLabel="Ya, Tandai Siap"
        loading={loading}
        onConfirm={handleConfirm}
      />
    </>
  );
}
