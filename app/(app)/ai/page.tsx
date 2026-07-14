import type { Metadata } from "next";
import { BrainCircuit } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Modul AI" };

export default async function AiModulePage() {
  await requirePermission("ai_module.manage");

  return (
    <div className="space-y-6">
      <PageHeader title="Modul AI" description="Basis pengetahuan dan konfigurasi perilaku AI untuk MK Connect." />
      <EmptyState
        icon={BrainCircuit}
        title="Belum ada konfigurasi"
        description="Modul ini akan berisi basis pengetahuan dan aturan kerja AI di MK Connect. Fitur akan dikembangkan bertahap sesuai kebutuhan yang dijelaskan."
      />
    </div>
  );
}
