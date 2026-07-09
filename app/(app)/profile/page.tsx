import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { ProfileTabs } from "@/features/profile/components/profile-tabs";
import { requireSession } from "@/lib/rbac/session";
import type { UpdateProfileInput } from "@/features/profile/schemas/profile.schema";

export const metadata: Metadata = { title: "Profil Saya" };

export default async function ProfilePage() {
  const session = await requireSession();

  const initialValues: UpdateProfileInput = {
    fullName: session.employee.full_name,
    phone: session.employee.phone ?? "",
    address: session.employee.address ?? "",
    avatarUrl: session.employee.avatar_url ?? "",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Profil Saya" description="Kelola informasi akun Anda." />
      <Suspense>
        <ProfileTabs userId={session.userId} initialValues={initialValues} />
      </Suspense>
    </div>
  );
}
