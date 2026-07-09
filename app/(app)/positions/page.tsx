import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { PositionTable } from "@/features/positions/components/position-table";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listPositions } from "@/repositories/position.repository";

export const metadata: Metadata = { title: "Jabatan" };

export default async function PositionsPage() {
  await requirePermission("position.manage");
  const supabase = await createClient();
  const positions = await listPositions(supabase);

  return (
    <div className="space-y-6">
      <PageHeader title="Jabatan" description="Kelola jabatan perusahaan." />
      <PositionTable positions={positions} />
    </div>
  );
}
