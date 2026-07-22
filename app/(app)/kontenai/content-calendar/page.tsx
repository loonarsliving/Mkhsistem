import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { ContentCalendarList } from "@/features/kontenai/publishing-engine/components/content-calendar-list";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";

export const metadata: Metadata = { title: "Content Calendar" };

export default async function ContentCalendarPage() {
  await requireKontenAiAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Calendar"
        description="Seluruh jadwal publish dari Publishing Engine -- status Draft, Scheduled, Published, atau Failed."
      />
      <ContentCalendarList />
    </div>
  );
}
