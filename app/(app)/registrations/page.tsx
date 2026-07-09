import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { PendingRegistrationTable } from "@/features/registration/components/pending-registration-table";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Pending Registration" };

export default async function RegistrationsPage() {
  const session = await requireSession();
  if (!hasPermission(session, "registration.view_all") && !hasPermission(session, "registration.view_branch")) {
    redirect("/dashboard?error=forbidden");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Pending Registration" description="Tinjau dan proses pendaftaran akun karyawan baru." />
      <PendingRegistrationTable />
    </div>
  );
}
