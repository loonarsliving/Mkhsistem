import { FolderOpen } from "lucide-react";

interface AssetLibraryEmptyStateProps {
  hasActiveFilters: boolean;
}

export function AssetLibraryEmptyState({ hasActiveFilters }: AssetLibraryEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
      <FolderOpen className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">
        {hasActiveFilters ? "Tidak ada aset yang cocok" : "Belum ada aset"}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {hasActiveFilters
          ? "Coba ubah kata kunci pencarian atau filter yang digunakan."
          : "Aset foto, video, audio, logo, dan template akan muncul di sini setelah storage backend terhubung."}
      </p>
    </div>
  );
}
