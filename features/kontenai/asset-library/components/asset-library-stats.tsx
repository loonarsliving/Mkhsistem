import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssetLibraryStats } from "@/features/kontenai/asset-library/actions/asset-library.actions";
import { ASSET_TYPE_LABEL } from "@/features/kontenai/asset-library/utils/asset-type-meta";

interface AssetLibraryStatsTilesProps {
  stats: AssetLibraryStats;
}

/** Stat tiles above the asset grid/list: total, per-type, and per-status counts. */
export function AssetLibraryStatsTiles({ stats }: AssetLibraryStatsTilesProps) {
  const typeEntries = Object.entries(stats.byType) as [keyof typeof stats.byType, number][];
  const statusEntries = Object.entries(stats.byStatus) as [keyof typeof stats.byStatus, number][];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Aset</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">{stats.totalAssets}</p>
          <p className="mt-1 text-xs text-muted-foreground">Seluruh aset di library</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Berdasarkan Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {statusEntries.map(([status, count]) => (
            <div key={status} className="flex items-center justify-between text-xs">
              <span className="capitalize text-muted-foreground">{status}</span>
              <span className="font-medium tabular-nums">{count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="sm:col-span-2 lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Berdasarkan Tipe</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          {typeEntries.map(([type, count]) => (
            <div key={type} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{ASSET_TYPE_LABEL[type]}</span>
              <span className="font-medium tabular-nums">{count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
