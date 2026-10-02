import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { PERMISSIONS } from "@/constants/rbac";
import { ReferralBoard } from "@/features/villa-referral/components/referral-board";
import { requirePermission } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { listVillaReferrals } from "@/lib/villa/referral";

export const metadata: Metadata = { title: "Kode Referral Villa" };
export const dynamic = "force-dynamic";

export default async function VillaReferralPage() {
  await requirePermission(PERMISSIONS.VILLA_REFERRAL_MANAGE);

  // Nama + cabang saja (tanpa nomor HP) untuk pilihan karyawan -- karyawan
  // cabang mana pun boleh menjual villa, jadi daftarnya tidak dibatasi ke
  // cabang Vando. Nomor HP hanya dibaca di server saat mengirim WA.
  const supabase = createAdminClient();
  const [referrals, { data: employees }] = await Promise.all([
    listVillaReferrals(),
    supabase
      .from("v_employee_directory")
      .select("id, full_name, branch_name")
      .is("deleted_at", null)
      .eq("employment_status", "active")
      .order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kode Referral Villa"
        description="Kode referral karyawan untuk Loonars Private Living. Tamu yang memesan di loonars.id dengan kode ini tetap membayar harga normal; karyawan pemilik kode dapat fee 10% dari nilai booking setelah tamu lunas."
      />
      <ReferralBoard
        codes={referrals.ok ? referrals.data.kode : []}
        loadError={referrals.ok ? null : referrals.error}
        employees={(employees ?? []).map((e) => ({
          id: e.id,
          name: e.full_name,
          branch: e.branch_name ?? null,
        }))}
      />
    </div>
  );
}
