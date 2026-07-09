import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { MemoForm } from "@/features/memo/components/memo-form";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Buat Memo" };

export default async function NewMemoPage() {
  await requirePermission("memo.create");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Buat Memo Baru" description="Publikasikan memo untuk karyawan yang dituju." />
      <MemoForm />
    </div>
  );
}
