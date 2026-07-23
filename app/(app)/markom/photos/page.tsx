import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { ProjectPhotoGallery } from "@/features/markom/components/project-photo-gallery";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Foto Project" };

export default async function ProjectPhotosPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "crm_project_photo.manage");
  const canView = canManage || hasPermission(session, "ad_campaign.view");
  if (!canView) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Foto Project"
        description="Foto asli property (villa/rumah) -- sumber materi kreatif untuk iklan AI. AI hanya memilih dan memasang foto dari galeri ini, tidak pernah membuat gambar sendiri."
      />
      <ProjectPhotoGallery canManage={canManage} />
    </div>
  );
}
