"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ImageOff, LoaderCircle, MapPin } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AttendanceStatusBadge } from "@/components/shared/status-badge";
import type { AttendanceStatus } from "@/constants/app";
import { getInitials } from "@/lib/utils";

import { getAttendanceDetailAction } from "../actions/attendance-query.actions";

function mapsLink(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function EventPanel({
  title,
  time,
  latitude,
  longitude,
  withinRadius,
  distanceMeters,
  note,
  photoUrl,
}: {
  title: string;
  time: string | null;
  latitude: number | null;
  longitude: number | null;
  withinRadius: boolean | null;
  distanceMeters: number | null;
  note: string | null;
  photoUrl: string | null;
}) {
  if (!time) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Belum {title.toLowerCase()}
      </div>
    );
  }

  const link = mapsLink(latitude, longitude);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm tabular-nums text-muted-foreground">{format(new Date(time), "HH:mm", { locale: idLocale })}</p>
      </div>

      <div className="overflow-hidden rounded-md bg-muted">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed selfie URL, matches Avatar/AvatarImage's plain-<img> convention elsewhere
          <img src={photoUrl} alt={`Foto ${title}`} className="h-56 w-full object-cover" />
        ) : (
          <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
            <ImageOff className="h-5 w-5" /> <span className="text-sm">Foto tidak tersedia</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
            <MapPin className="h-4 w-4" /> Lihat lokasi di peta
          </a>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-4 w-4" /> Lokasi tidak tersedia
          </span>
        )}
        {withinRadius === false ? (
          <span className="text-xs font-medium text-destructive">Di luar radius{distanceMeters ? ` (${Math.round(distanceMeters)}m)` : ""}</span>
        ) : withinRadius === true ? (
          <span className="text-xs font-medium text-success">Dalam radius</span>
        ) : null}
      </div>

      {note && <p className="text-sm text-muted-foreground">Catatan: {note}</p>}
    </div>
  );
}

/** Click-through detail for one attendance record: check-in/out location + selfie. Used by the History table and the Team Today list. */
export function AttendanceDetailDialog({
  attendanceId,
  open,
  onOpenChange,
}: {
  attendanceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["attendance-detail", attendanceId],
    queryFn: () => getAttendanceDetailAction(attendanceId as string),
    enabled: open && Boolean(attendanceId),
  });

  const employee = data?.employees as { full_name: string; avatar_url: string | null; employee_code: string } | null | undefined;
  const branch = data?.branches as { name: string } | null | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Detail Kehadiran</DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={employee?.avatar_url ?? undefined} alt={employee?.full_name} />
                  <AvatarFallback>{employee ? getInitials(employee.full_name) : "-"}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{employee?.full_name ?? "-"}</p>
                  <p className="text-xs text-muted-foreground">
                    {employee?.employee_code} {branch?.name ? `· ${branch.name}` : ""}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{format(new Date(data.attendance_date), "dd MMMM yyyy", { locale: idLocale })}</p>
                <AttendanceStatusBadge status={data.status as AttendanceStatus} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <EventPanel
                title="Check In"
                time={data.check_in_time}
                latitude={data.check_in_latitude}
                longitude={data.check_in_longitude}
                withinRadius={data.check_in_within_radius}
                distanceMeters={data.check_in_distance_meters}
                note={data.check_in_note}
                photoUrl={data.check_in_photo_signed_url}
              />
              <EventPanel
                title="Check Out"
                time={data.check_out_time}
                latitude={data.check_out_latitude}
                longitude={data.check_out_longitude}
                withinRadius={data.check_out_within_radius}
                distanceMeters={data.check_out_distance_meters}
                note={data.check_out_note}
                photoUrl={data.check_out_photo_signed_url}
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
