"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Siren } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { sendEmergencyNoticeAction } from "../actions/announcement.actions";

/** Directors/Super Admin only -- caller checks `branch.manage` before rendering this trigger. One click sends a pinned, company-wide push straight away, so it stays a 2-field form with a confirming send button, not the full targeted-announcement flow. */
export function EmergencyNoticeDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSend() {
    setSubmitting(true);
    const result = await sendEmergencyNoticeAction(title, content);
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim pemberitahuan darurat");
      return;
    }
    toast.success("Pemberitahuan darurat terkirim ke seluruh karyawan");
    setTitle("");
    setContent("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Siren className="h-4 w-4" /> Pemberitahuan Darurat
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kirim Pemberitahuan Darurat</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Langsung terkirim sebagai popup notifikasi ke seluruh karyawan aktif di semua cabang. Gunakan hanya untuk
          informasi penting dan mendesak.
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="emergency-title">Judul</Label>
            <Input id="emergency-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Kantor tutup hari ini" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergency-content">Isi Pesan</Label>
            <Textarea
              id="emergency-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Jelaskan situasinya secara singkat dan jelas."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Batal
          </Button>
          <Button variant="destructive" onClick={handleSend} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />}
            Kirim Sekarang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
