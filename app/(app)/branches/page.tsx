import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { BranchTable } from "@/features/branches/components/branch-table";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listBranches } from "@/repositories/branch.repository";

export const metadata: Metadata = { title: "Cabang" };

export default async function BranchesPage() {
  await requirePermission("branch.manage");
  const supabase = await createClient();
  const branches = await listBranches(supabase);

  return (
    <div className="space-y-6">
      <PageHeader title="Cabang" description="Kelola cabang, lokasi kantor, dan radius absensi." />
      <BranchTable branches={branches} />
    </div>
  );
}
