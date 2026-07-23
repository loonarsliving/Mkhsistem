import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SystemPromptForm } from "@/features/ai-module/components/system-prompt-form";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Modul AI" };

export default async function AiModulePage() {
  await requirePermission("ai_module.manage");

  const supabase = await createClient();
  const { data: prompts } = await supabase.from("ai_system_prompts").select("key, label, content, updated_at").order("key");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modul AI"
        description="Atur instruksi yang menentukan bagaimana AI MK Connect menjawab pertanyaan karyawan lewat WhatsApp, per topik."
      />
      <SystemPromptForm prompts={prompts ?? []} />
    </div>
  );
}
