"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, MapPinOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { STORAGE_BUCKETS } from "@/constants/app";
import { useGeolocation } from "@/hooks/use-geolocation";
import { uploadUserFile } from "@/lib/supabase/storage";

import { checkInAction, checkOutAction } from "../actions/attendance.actions";
import { CameraCapture } from "./camera-capture";

interface CheckInOutDialogProps {
  mode: "check-in" | "check-out";
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckInOutDialog({ mode, userId, open, onOpenChange }: CheckInOutDialogProps) {
  const router = useRouter();
  const geo = useGeolocation();
  const [photoBlob, setPhotoBlob] = React.useState<Blob | null>(null);
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      geo.request();
      setPhotoBlob(null);
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit() {
    console.warn(`[check-in-out-dialog] handleSubmit: start, mode=${mode}`);
    if (!photoBlob) {
      console.warn("[check-in-out-dialog] handleSubmit: aborting, no photoBlob");
      toast.error("Ambil foto selfie terlebih dahulu");
      return;
    }
    if (geo.latitude === null || geo.longitude === null) {
      console.warn("[check-in-out-dialog] handleSubmit: aborting, no geolocation");
      toast.error("Lokasi belum terdeteksi. Aktifkan GPS dan coba lagi.");
      return;
    }

    setSubmitting(true);
    try {
      console.warn("[check-in-out-dialog] handleSubmit: uploading selfie");
      const { path } = await uploadUserFile(STORAGE_BUCKETS.ATTENDANCE_SELFIES, userId, photoBlob, "selfie.jpg");
      console.warn("[check-in-out-dialog] handleSubmit: upload complete, path =", path);

      const payload = { latitude: geo.latitude, longitude: geo.longitude, photoUrl: path, note: note || undefined };
      console.warn(`[check-in-out-dialog] handleSubmit: calling ${mode === "check-in" ? "checkInAction" : "checkOutAction"}`);
      const result = mode === "check-in" ? await checkInAction(payload) : await checkOutAction(payload);
      console.warn("[check-in-out-dialog] handleSubmit: action result =", result.success ? "success" : `error: ${result.error}`);

      if (!result.success) {
        toast.error(result.error ?? "Gagal memproses absensi");
        return;
      }

      toast.success(mode === "check-in" ? "Check-in berhasil" : "Check-out berhasil");
      console.warn("[check-in-out-dialog] handleSubmit: closing dialog and refreshing route (router.refresh, no navigation)");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error(
        "[check-in-out-dialog] handleSubmit: threw:",
        err instanceof Error ? err.message : err,
      );
      toast.error(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      console.warn("[check-in-out-dialog] handleSubmit: finally, setSubmitting(false)");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "check-in" ? "Check In" : "Check Out"}</DialogTitle>
          <DialogDescription>Ambil selfie dan pastikan lokasi Anda terdeteksi untuk melanjutkan.</DialogDescription>
        </DialogHeader>

        <CameraCapture onCapture={(blob) => setPhotoBlob(blob)} />

        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          {geo.loading && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> Mendeteksi lokasi...
            </>
          )}
          {!geo.loading && geo.latitude !== null && (
            <>
              <MapPin className="h-4 w-4 text-success" /> Lokasi terdeteksi ({geo.accuracy ? `±${Math.round(geo.accuracy)}m` : "akurat"})
            </>
          )}
          {!geo.loading && geo.error && (
            <>
              <MapPinOff className="h-4 w-4 text-destructive" /> {geo.error}
              <Button type="button" variant="link" size="sm" className="ml-auto h-auto p-0" onClick={geo.request}>
                Coba lagi
              </Button>
            </>
          )}
        </div>

        <Textarea placeholder="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />

        <Button onClick={handleSubmit} disabled={submitting || !photoBlob} className="w-full">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "check-in" ? "Konfirmasi Check In" : "Konfirmasi Check Out"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
