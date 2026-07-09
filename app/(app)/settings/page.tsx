import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CalendarClock } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { CompanySettingsForm } from "@/features/settings/components/company-settings-form";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import type { CompanySettingsInput } from "@/features/settings/schemas/settings.schema";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  await requirePermission("settings.manage");
  const supabase = await createClient();
  const { data: settings } = await supabase.from("company_settings").select("*").single();

  const initialValues: CompanySettingsInput = {
    companyName: settings?.company_name ?? "PT Maha Karya Haluoleo",
    companyAddress: settings?.company_address ?? "",
    companyLogoUrl: settings?.company_logo_url ?? "",
    timezone: settings?.timezone ?? "Asia/Makassar",
    defaultRadiusMeters: settings?.default_radius_meters ?? 100,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Pengaturan"
        description="Profil perusahaan dan pengaturan sistem."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/attendance/settings">
                <CalendarClock className="h-4 w-4" /> Jam Kerja
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/branches">
                <Building2 className="h-4 w-4" /> Lokasi & Radius Cabang
              </Link>
            </Button>
          </>
        }
      />
      <CompanySettingsForm initialValues={initialValues} />
    </div>
  );
}
