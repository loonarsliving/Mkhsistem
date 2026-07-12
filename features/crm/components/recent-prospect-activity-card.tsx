import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { PlusCircle } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FOLLOW_UP_ACTIVITY_TYPE_LABEL } from "@/constants/app";
import type { FollowUpActivityTypeDb } from "@/types/database.types";

interface FollowUpRow {
  id: string;
  activity_type: FollowUpActivityTypeDb;
  activity_date: string;
  activity_time: string | null;
  notes: string | null;
  prospect: { customer_name: string; phone: string } | null;
  created_by_employee: { full_name: string } | null;
}

/** Recent Prospect Activity section of the Sales Home Dashboard -- same follow-up feed and formatting as the CRM Sales Detail page's timeline. */
export function RecentProspectActivityCard({ activities }: { activities: FollowUpRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aktivitas Prospect Terbaru</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <EmptyState icon={PlusCircle} title="Belum ada follow up" className="border-0 py-8" />
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((f) => (
              <li key={f.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <PlusCircle className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {FOLLOW_UP_ACTIVITY_TYPE_LABEL[f.activity_type]} · {f.prospect?.customer_name ?? "-"}
                  </p>
                  {f.notes && <p className="mt-0.5 truncate text-sm text-muted-foreground">{f.notes}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(
                        new Date(f.activity_time ? `${f.activity_date}T${f.activity_time}` : f.activity_date),
                        { addSuffix: true, locale: idLocale },
                      )}
                    </span>
                    {f.created_by_employee && (
                      <span className="text-xs text-muted-foreground">· {f.created_by_employee.full_name}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
