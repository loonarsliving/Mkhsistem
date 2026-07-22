import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContentPerformanceRanking } from "@/features/kontenai/analytics/lib/aggregate";

interface ContentRankingListProps {
  title: string;
  items: ContentPerformanceRanking[];
  emptyMessage: string;
}

/** Spec items 4-5 -- Top and Worst Performing Content, shared component for both lists. */
export function ContentRankingList({ title, items, emptyMessage }: ContentRankingListProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          items.map((item, index) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="secondary" className="shrink-0">
                  #{index + 1}
                </Badge>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.storyboardTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.views} views -- {item.reach} reach
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="shrink-0">
                {item.engagementRate}%
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
