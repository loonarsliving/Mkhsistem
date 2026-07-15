"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Eye, Heart, Instagram, Music2, Sparkles, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/shared/stat-tile";

import { getContentPlannerOverviewAction } from "../actions/social.actions";

export function ContentPlannerOverview() {
  const { data, isLoading } = useQuery({ queryKey: ["content-planner-overview"], queryFn: getContentPlannerOverviewAction });

  if (isLoading || !data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <Instagram className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Instagram</CardTitle>
          </CardHeader>
          <CardContent>
            {data.instagram ? (
              <div className="grid grid-cols-2 gap-2">
                <StatTile icon={Users} label="Followers" value={(data.instagram.followers_count ?? 0).toLocaleString("id-ID")} />
                <StatTile icon={Eye} label="Reach" value={(data.instagram.reach ?? 0).toLocaleString("id-ID")} />
                {data.instagram.best_upload_hour !== null && (
                  <StatTile icon={CalendarClock} label="Jam Terbaik" value={`${data.instagram.best_upload_hour}:00`} />
                )}
                {data.instagram.top_content_type && <StatTile icon={Sparkles} label="Konten Terbaik" value={data.instagram.top_content_type} />}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada data -- menunggu capture harian pertama (cek koneksi di Monitoring).</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <Music2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">TikTok</CardTitle>
          </CardHeader>
          <CardContent>
            {data.tiktok ? (
              <div className="grid grid-cols-2 gap-2">
                <StatTile icon={Users} label="Followers" value={(data.tiktok.followers_count ?? 0).toLocaleString("id-ID")} />
                <StatTile icon={Eye} label="Video Views" value={(data.tiktok.impressions ?? 0).toLocaleString("id-ID")} />
                <StatTile icon={Heart} label="Likes" value={(data.tiktok.likes ?? 0).toLocaleString("id-ID")} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">TikTok belum terhubung -- cek status koneksi di halaman Monitoring.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {data.weeklyEvaluation && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Evaluasi Mingguan AI &middot; {new Date(data.weeklyEvaluation.week_start).toLocaleDateString("id-ID", { day: "numeric", month: "long" })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data.weeklyEvaluation.evaluation}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
