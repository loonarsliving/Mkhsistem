import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { WhatsAppSendForm } from "@/features/messaging/components/whatsapp-send-form";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Kirim Pesan WhatsApp" };

export default async function MessagingPage() {
  await requirePermission("messaging.send");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Kirim Pesan WhatsApp" description="Kirim pesan WhatsApp ad-hoc ke nomor HP mana pun melalui koneksi MK Connect." />
      <WhatsAppSendForm />
    </div>
  );
}
