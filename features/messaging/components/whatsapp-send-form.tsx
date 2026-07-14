"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { sendWhatsAppMessageAction } from "../actions/messaging.actions";

export function WhatsAppSendForm() {
  const [phone, setPhone] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  async function handleSend() {
    setSubmitting(true);
    setFieldErrors({});
    const result = await sendWhatsAppMessageAction({ phone, message });
    setSubmitting(false);

    if (!result.success) {
      setFieldErrors(result.fieldErrors ?? {});
      toast.error(result.error ?? "Gagal mengirim pesan WhatsApp");
      return;
    }
    toast.success(`Pesan WhatsApp terkirim ke ${phone}`);
    setMessage("");
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="space-y-1.5">
          <Label htmlFor="whatsapp-phone">Nomor HP Tujuan</Label>
          <Input
            id="whatsapp-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Contoh: 081234567890"
            inputMode="tel"
          />
          {fieldErrors.phone && <p className="text-sm text-destructive">{fieldErrors.phone[0]}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="whatsapp-message">Isi Pesan</Label>
          <Textarea
            id="whatsapp-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder="Tulis isi pesan di sini..."
          />
          {fieldErrors.message && <p className="text-sm text-destructive">{fieldErrors.message[0]}</p>}
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={submitting || !phone || !message}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Kirim Pesan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
