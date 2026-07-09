import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Megaphone, Search } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitials } from "@/lib/utils";
import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { globalSearch } from "@/repositories/search.repository";

export const metadata: Metadata = { title: "Pencarian" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSession();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const supabase = await createClient();
  const results = query.length >= 2 ? await globalSearch(supabase, query) : { memos: [], announcements: [], employees: [] };
  const totalResults = results.memos.length + results.announcements.length + results.employees.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Pencarian" description={query ? `Hasil untuk "${query}"` : "Cari memo, pengumuman, dan karyawan."} />

      {query.length < 2 ? (
        <EmptyState icon={Search} title="Ketik kata kunci pencarian" description="Gunakan kotak pencarian di bagian atas halaman." />
      ) : totalResults === 0 ? (
        <EmptyState icon={Search} title="Tidak ada hasil ditemukan" />
      ) : (
        <div className="space-y-6">
          {results.employees.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Karyawan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {results.employees.map((e) => (
                  <Link key={e.id} href={`/employees/${e.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {getInitials(e.full_name)}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{e.full_name}</p>
                      <p className="text-xs text-muted-foreground">{e.employee_code}</p>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {results.memos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Memo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {results.memos.map((m) => (
                  <Link key={m.id} href={`/memo/${m.id}`} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent">
                    <FileText className="h-4 w-4 text-muted-foreground" /> {m.title}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {results.announcements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pengumuman</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {results.announcements.map((a) => (
                  <Link key={a.id} href={`/announcements/${a.id}`} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent">
                    <Megaphone className="h-4 w-4 text-muted-foreground" /> {a.title}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
