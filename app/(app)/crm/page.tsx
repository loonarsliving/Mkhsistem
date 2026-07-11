import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { ProspectList } from "@/features/crm/components/prospect-list";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Prospect" };

export default async function CrmProspectsPage() {
  const session = await requireSession();
  const canView =
    hasPermission(session, "prospect.view_own") ||
    hasPermission(session, "prospect.view_branch") ||
    hasPermission(session, "prospect.view_all");
  if (!canView) redirect("/dashboard?error=forbidden");

  const canCreate = hasPermission(session, "prospect.create");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospect"
        description="Kelola seluruh prospect pelanggan."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/crm/new">
                <Plus className="h-4 w-4" /> Tambah Prospect
              </Link>
            </Button>
          )
        }
      />
      <ProspectList />
    </div>
  );
}
