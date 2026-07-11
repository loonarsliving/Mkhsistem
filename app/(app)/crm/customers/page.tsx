import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BreadcrumbNav } from "@/components/shared/breadcrumb-nav";
import { PageHeader } from "@/components/shared/page-header";
import { CustomerDatabase } from "@/features/crm/components/customer-database";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Database Pelanggan" };

export default async function CustomerDatabasePage() {
  const session = await requireSession();
  if (!hasPermission(session, "crm_analytics.view_branch") && !hasPermission(session, "crm_analytics.view_all")) {
    redirect("/dashboard?error=forbidden");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Database Pelanggan" description="Jelajahi seluruh data pelanggan dengan filter lengkap." />
      <BreadcrumbNav items={[{ label: "Company", href: "/crm/dashboard" }, { label: "Database Pelanggan" }]} />
      <CustomerDatabase canPickBranch={hasPermission(session, "crm_analytics.view_all")} />
    </div>
  );
}
