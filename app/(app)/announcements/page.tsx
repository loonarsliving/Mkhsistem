import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { AnnouncementList } from "@/features/announcements/components/announcement-list";
import { CategoryManagerDialog } from "@/features/announcements/components/category-manager-dialog";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listAnnouncements } from "@/repositories/announcement.repository";

export const metadata: Metadata = { title: "Pengumuman" };

export default async function AnnouncementsPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const { items } = await listAnnouncements(supabase, 1, 20);
  const canManage = hasPermission(session, "announcement.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengumuman"
        description="Pengumuman resmi dari perusahaan."
        actions={
          <>
            {canManage && <CategoryManagerDialog />}
            {hasPermission(session, "announcement.create") && (
              <Button asChild>
                <Link href="/announcements/new">
                  <Plus className="h-4 w-4" /> Buat Pengumuman
                </Link>
              </Button>
            )}
          </>
        }
      />
      <AnnouncementList announcements={items} />
    </div>
  );
}
