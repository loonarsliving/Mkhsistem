import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { DivisionTable } from "@/features/divisions/components/division-table";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listDivisions } from "@/repositories/division.repository";

export const metadata: Metadata = { title: "Divisi" };

export default async function DivisionsPage() {
  await requirePermission("division.manage");
  const supabase = await createClient();
  const divisions = await listDivisions(supabase);

  return (
    <div className="space-y-6">
      <PageHeader title="Divisi" description="Kelola divisi perusahaan." />
      <DivisionTable divisions={divisions} />
    </div>
  );
}
