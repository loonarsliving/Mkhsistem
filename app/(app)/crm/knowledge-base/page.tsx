import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { KnowledgeBaseTable } from "@/features/lead-knowledge/components/knowledge-base-table";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listKnowledgeBaseAdmin } from "@/repositories/knowledge-base.repository";

export const metadata: Metadata = { title: "Knowledge Base AI" };

export default async function KnowledgeBasePage() {
  await requirePermission("prospect.manage");
  const supabase = await createClient();
  const entries = await listKnowledgeBaseAdmin(supabase);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Base AI"
        description="Isi pertanyaan & jawaban per project untuk WhatsApp AI nurture bot (lead dari iklan). Bot hanya menjawab dari data di sini -- jawaban dari Super Admin (via WhatsApp) otomatis masuk sebagai 'Dari Admin'."
      />
      <KnowledgeBaseTable entries={entries} />
    </div>
  );
}
