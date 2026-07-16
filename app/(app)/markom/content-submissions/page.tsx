import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { ContentSubmissionBoard } from "@/features/markom/components/content-submission-board";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Upload Konten" };

export default async function ContentSubmissionsPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, "content_submission.manage");
  if (!canManage) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload Konten"
        description="Upload konten (foto/video) yang sudah dibuat berdasarkan brief checklist AI. Sistem akan mengecek dulu apakah konten sudah layak tayang, lalu bisa dijadwalkan untuk otomatis dipublish ke Instagram pada jam terbaik."
      />
      <ContentSubmissionBoard />
    </div>
  );
}
