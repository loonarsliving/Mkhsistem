import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { PERMISSIONS } from "@/constants/rbac";
import { LplStaffBoard } from "@/features/lpl-staff/components/lpl-staff-board";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listLplDivisions, listLplEmployees } from "@/repositories/lpl-staff.repository";

export const metadata: Metadata = { title: "Karyawan Loonars Private Living" };

export default async function LplStaffPage() {
  const session = await requirePermission(PERMISSIONS.LPL_STAFF_MANAGE);
  const supabase = await createClient();
  const [employees, divisions] = await Promise.all([listLplEmployees(supabase), listLplDivisions(supabase)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Karyawan Loonars Private Living"
        description="Tambah dan keluarkan karyawan villa Loonars Private Living. Gaji mereka diinput di halaman Input Gaji Karyawan."
      />
      <LplStaffBoard employees={employees} divisions={divisions} currentUserId={session.userId} />
    </div>
  );
}
