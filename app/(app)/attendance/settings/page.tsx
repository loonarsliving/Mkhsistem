import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { WorkScheduleTable } from "@/features/attendance/components/work-schedule-table";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listWorkSchedules } from "@/repositories/work-schedule.repository";

export const metadata: Metadata = { title: "Pengaturan Absensi" };

export default async function AttendanceSettingsPage() {
  await requirePermission("attendance.settings_manage");
  const supabase = await createClient();
  const schedules = await listWorkSchedules(supabase);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengaturan Absensi"
        description="Kelola jam kerja, toleransi keterlambatan, dan hari kerja."
        actions={
          <Button variant="outline" asChild>
            <Link href="/branches">
              <Building2 className="h-4 w-4" /> Kelola Lokasi & Radius Cabang
            </Link>
          </Button>
        }
      />
      <WorkScheduleTable schedules={schedules} />
    </div>
  );
}
