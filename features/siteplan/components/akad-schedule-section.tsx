"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CalendarCheck, Loader2, Scale } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { confirmAkadScheduleAction, getAkadScheduleAction } from "../actions/siteplan.actions";
import { AkadScheduleRequestDialog } from "./akad-schedule-request-dialog";

interface AkadScheduleSectionProps {
  userId: string;
  purchase: { id: string; buyer_name: string; nik: string | null; phone: string | null; address: string | null };
}

function formatTanggal(value: string) {
  return format(new Date(`${value}T00:00:00`), "dd MMMM yyyy", { locale: idLocale });
}

/**
 * Shown inside UnitDetailModal for a verified purchase. Three states: no schedule yet ("Jadwalkan
 * Akad" button), diajukan (waiting on the notary's manual WhatsApp/phone confirmation -- "Catat
 * Tanggal Final" lets marketing record it once that call happens, per the owner's explicit choice
 * not to auto-parse a WhatsApp reply in this first version), or dikonfirmasi (final date shown).
 */
export function AkadScheduleSection({ userId, purchase }: AkadScheduleSectionProps) {
  const queryClient = useQueryClient();
  const queryKey = ["siteplan-akad-schedule", purchase.id];
  const { data: schedule, isLoading } = useQuery({ queryKey, queryFn: () => getAkadScheduleAction(purchase.id) });
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [finalDate, setFinalDate] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey });
  }

  async function handleConfirm() {
    if (!schedule || !finalDate) return;
    setConfirming(true);
    const result = await confirmAkadScheduleAction({ id: schedule.id, tanggalAkadFinal: finalDate });
    setConfirming(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mencatat tanggal akad final");
      return;
    }
    toast.success("Tanggal akad final dicatat");
    setConfirmOpen(false);
    invalidate();
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat status akad…
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-xs text-muted-foreground">Jadwal Akad</p>
      {!schedule && (
        <Button size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
          <Scale className="h-4 w-4" /> Jadwalkan Akad
        </Button>
      )}
      {schedule && schedule.status === "diajukan" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="warning">Menunggu konfirmasi notaris</Badge>
          <span>
            Diusulkan {formatTanggal(schedule.tanggal_akad_diusulkan)} ke {schedule.notaris_name}
          </span>
          <Button size="sm" variant="outline" onClick={() => { setFinalDate(schedule.tanggal_akad_diusulkan); setConfirmOpen(true); }}>
            <CalendarCheck className="h-4 w-4" /> Catat Tanggal Final
          </Button>
        </div>
      )}
      {schedule && schedule.status === "dikonfirmasi" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="success">Akad terjadwal</Badge>
          <span>{formatTanggal(schedule.tanggal_akad_final as string)}</span>
        </div>
      )}

      <AkadScheduleRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        userId={userId}
        purchaseId={purchase.id}
        initialBuyer={{
          buyerName: purchase.buyer_name,
          nik: purchase.nik ?? "",
          phone: purchase.phone ?? "",
          address: purchase.address ?? "",
        }}
        onRequested={invalidate}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catat Tanggal Akad Final</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="finalDate">Tanggal akad sesuai konfirmasi notaris</Label>
            <Input id="finalDate" type="date" value={finalDate} onChange={(e) => setFinalDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={handleConfirm} disabled={!finalDate || confirming}>
              {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
