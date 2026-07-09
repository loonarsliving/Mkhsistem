import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AnnouncementForm } from "@/features/announcements/components/announcement-form";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Buat Pengumuman" };

export default async function NewAnnouncementPage() {
  await requirePermission("announcement.create");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Buat Pengumuman Baru" description="Publikasikan pengumuman untuk karyawan yang dituju." />
      <AnnouncementForm />
    </div>
  );
}
