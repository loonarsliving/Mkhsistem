import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { PlusCircle } from "lucide-react";

import { FOLLOW_UP_ACTIVITY_TYPE_LABEL } from "@/constants/app";
import type { FollowUpActivityTypeDb } from "@/types/database.types";

interface TimelineFollowUp {
  id: string;
  activity_type: FollowUpActivityTypeDb;
  activity_date: string;
  activity_time: string | null;
  notes: string | null;
  created_by_employee: { full_name: string } | null;
}

interface FollowUpTimelineProps {
  createdAt: string;
  followUps: TimelineFollowUp[];
}

export function FollowUpTimeline({ createdAt, followUps }: FollowUpTimelineProps) {
  const events = [
    { key: "created", date: createdAt, label: "Prospect Dibuat", notes: null as string | null, by: null as string | null },
    ...followUps.map((f) => ({
      key: f.id,
      date: f.activity_time ? `${f.activity_date}T${f.activity_time}` : f.activity_date,
      label: FOLLOW_UP_ACTIVITY_TYPE_LABEL[f.activity_type],
      notes: f.notes,
      by: f.created_by_employee?.full_name ?? null,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <ol className="space-y-4">
      {events.map((event, index) => (
        <li key={event.key} className="relative flex gap-3 pl-1">
          <div className="flex flex-col items-center">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${index === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <PlusCircle className="h-3.5 w-3.5" />
            </span>
            {index < events.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-border" />}
          </div>
          <div className="pb-4">
            <p className="text-sm font-medium">{event.label}</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(event.date), "dd MMM yyyy, HH:mm", { locale: idLocale })}
              {event.by && ` · ${event.by}`}
            </p>
            {event.notes && <p className="mt-1 text-sm">{event.notes}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
