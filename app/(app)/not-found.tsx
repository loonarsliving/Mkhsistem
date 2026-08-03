import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <Compass className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Halaman tidak ditemukan</h2>
        <p className="text-sm text-muted-foreground">
          Halaman yang Anda cari tidak ada, sudah dipindahkan, atau Anda tidak punya akses ke sana.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Kembali ke Dashboard</Link>
      </Button>
    </div>
  );
}
