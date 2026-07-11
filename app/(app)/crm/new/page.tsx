import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AddProspectForm } from "@/features/crm/components/add-prospect-form";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Tambah Prospect" };

export default async function NewProspectPage() {
  await requirePermission("prospect.create");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Tambah Prospect" description="Masukkan data prospect baru. Sistem akan memeriksa duplikat secara otomatis." />
      <AddProspectForm />
    </div>
  );
}
