import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { MemoList } from "@/features/memo/components/memo-list";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listMemos } from "@/repositories/memo.repository";

export const metadata: Metadata = { title: "Memo" };

export default async function MemoPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const { items } = await listMemos(supabase, 1, 20);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Memo"
        description="Memo internal perusahaan untuk Anda."
        actions={
          hasPermission(session, "memo.create") && (
            <Button asChild>
              <Link href="/memo/new">
                <Plus className="h-4 w-4" /> Buat Memo
              </Link>
            </Button>
          )
        }
      />
      <MemoList memos={items} />
    </div>
  );
}
