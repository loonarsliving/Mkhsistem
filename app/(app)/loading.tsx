import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown by Next.js while a page in this segment streams in from the server
 * -- covers every route under (app) with one generic shape instead of a
 * blank screen on navigation. Approximates the most common page shape here
 * (PageHeader + a couple of Card sections with table-like rows), which is
 * close enough to feel like a preview of the real layout rather than a
 * generic spinner.
 */
export default function AppLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-20 shrink-0" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
