import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CakeSlice,
  CalendarClock,
  CalendarOff,
  CircleCheck,
  Clock,
  FileClock,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/shared/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  getAttendanceWatchlist,
  getHeadcount,
  getHrActionQueue,
  getMonthlyCompliance,
  getTodayAttendanceBoard,
  getUpcomingBirthdays,
  getUpcomingLeave,
} from "@/repositories/hr-workspace.repository";

export const metadata: Metadata = { title: "Ruang Kerja HR" };

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });

function formatDate(value: string) {
  return DATE_FORMAT.format(new Date(value));
}

function trendLabel(current: number, previous: number) {
  const delta = current - previous;
  if (delta === 0) return "sama dengan bulan lalu";
  return `${delta > 0 ? "+" : ""}${delta} dibanding bulan lalu`;
}

/**
 * HR control room.
 *
 * Ordered by what HR has to *act on*, not by what is easiest to render:
 * the inbox first, then today's exceptions, then the month's trend, then
 * the calendar. A roster of everyone who checked in normally is the one
 * thing deliberately absent -- it is the 95% that needs no attention.
 */
export default async function HrWorkspacePage() {
  await requirePermission("hr_workspace.view");
  const supabase = await createClient();

  const [queue, board, compliance, watchlist, birthdays, upcomingLeave, headcount] = await Promise.all([
    getHrActionQueue(supabase),
    getTodayAttendanceBoard(supabase),
    getMonthlyCompliance(supabase),
    getAttendanceWatchlist(supabase),
    getUpcomingBirthdays(supabase),
    getUpcomingLeave(supabase),
    getHeadcount(supabase),
  ]);

  const queueTotal = queue.pendingLeave + queue.pendingRegistrations + queue.draftPayrollRuns + queue.pendingHrExpenses;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ruang Kerja HR"
        description="Yang perlu Anda tindak hari ini, kehadiran langsung, dan kepatuhan bulan berjalan."
      />

      {/* 1 — Inbox. Counts are links: the number is only useful if it takes you to the work. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perlu tindakan Anda</CardTitle>
          <CardDescription>
            {queueTotal === 0 ? "Tidak ada yang menunggu persetujuan. Semua bersih." : `${queueTotal} hal menunggu keputusan Anda.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/attendance?tab=leave">
            <StatTile
              icon={FileClock}
              label="Izin / sakit menunggu"
              value={String(queue.pendingLeave)}
              tone={queue.pendingLeave > 0 ? "warning" : "success"}
            />
          </Link>
          <Link href="/registrations">
            <StatTile
              icon={UserPlus}
              label="Registrasi karyawan baru"
              value={String(queue.pendingRegistrations)}
              tone={queue.pendingRegistrations > 0 ? "warning" : "success"}
            />
          </Link>
          <Link href="/hr/finance-sync">
            <StatTile
              icon={Wallet}
              label="Payroll draft"
              value={String(queue.draftPayrollRuns)}
              tone={queue.draftPayrollRuns > 0 ? "warning" : "success"}
            />
          </Link>
          <Link href="/hr/finance-sync">
            <StatTile
              icon={CircleCheck}
              label="HR expense menunggu"
              value={String(queue.pendingHrExpenses)}
              tone={queue.pendingHrExpenses > 0 ? "warning" : "success"}
            />
          </Link>
        </CardContent>
      </Card>

      {/* 2 — Today. "Belum absen" is the reason this section exists: it is the
          only attendance state that is still recoverable before the 18:00 WITA
          alpha sweep turns it into a permanent record. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Kehadiran hari ini</CardTitle>
            <CardDescription>Per cabang. Status dihitung ulang setiap halaman dibuka.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {board.branches.length === 0 ? (
              <EmptyState icon={Users} title="Belum ada data kehadiran" description="Tidak ada karyawan aktif yang terdaftar." className="py-8" />
            ) : (
              board.branches.map((branch) => (
                <div key={branch.branchId} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium">{branch.branchName}</p>
                    <span className="text-xs text-muted-foreground tabular-nums">{branch.total} karyawan</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="tabular-nums">Hadir {branch.hadir}</Badge>
                    <Badge variant="outline" className="tabular-nums">Telat {branch.terlambat}</Badge>
                    <Badge variant="outline" className="tabular-nums">Izin {branch.izin}</Badge>
                    <Badge variant="outline" className="tabular-nums">Sakit {branch.sakit}</Badge>
                    {branch.alpha > 0 && (
                      <Badge variant="destructive" className="tabular-nums">Alpha {branch.alpha}</Badge>
                    )}
                    {branch.belumAbsen > 0 && (
                      <Badge className="bg-warning/15 text-warning tabular-nums hover:bg-warning/15">
                        Belum absen {branch.belumAbsen}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-warning" />
              Belum absen
            </CardTitle>
            <CardDescription>
              Sistem menandai alpha otomatis pukul 18:00 WITA. Sebelum itu, masih bisa dikejar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {board.notCheckedIn.length === 0 ? (
              <EmptyState icon={CircleCheck} title="Semua sudah absen" description="Tidak ada karyawan yang tertinggal hari ini." className="py-8" />
            ) : (
              <ul className="space-y-2">
                {board.notCheckedIn.slice(0, 12).map((person) => (
                  <li key={person.userId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{person.fullName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{person.branchName}</span>
                  </li>
                ))}
                {board.notCheckedIn.length > 12 && (
                  <li className="pt-1 text-xs text-muted-foreground">
                    +{board.notCheckedIn.length - 12} karyawan lagi
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3 — The month, with a direction. A rate without a comparison is just a number. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Kepatuhan bulan ini</CardTitle>
            <CardDescription>Izin dan sakit tidak dihitung sebagai pelanggaran.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <StatTile
              icon={CircleCheck}
              label="Tingkat kehadiran"
              value={`${compliance.thisMonth.attendanceRate}%`}
              tone={compliance.thisMonth.attendanceRate >= 90 ? "success" : "warning"}
            />
            <StatTile
              icon={AlertTriangle}
              label={`Alpha — ${trendLabel(compliance.thisMonth.alpha, compliance.lastMonth.alpha)}`}
              value={String(compliance.thisMonth.alpha)}
              tone={compliance.thisMonth.alpha > compliance.lastMonth.alpha ? "destructive" : "default"}
            />
            <StatTile
              icon={Clock}
              label={`Terlambat — ${trendLabel(compliance.thisMonth.terlambat, compliance.lastMonth.terlambat)}`}
              value={String(compliance.thisMonth.terlambat)}
              tone={compliance.thisMonth.terlambat > compliance.lastMonth.terlambat ? "warning" : "default"}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Perlu perhatian bulan ini</CardTitle>
            <CardDescription>Diurutkan berdasarkan alpha lebih dulu, baru keterlambatan.</CardDescription>
          </CardHeader>
          <CardContent>
            {watchlist.length === 0 ? (
              <EmptyState icon={CircleCheck} title="Tidak ada catatan" description="Belum ada alpha atau keterlambatan bulan ini." className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {watchlist.map((entry) => (
                  <li key={entry.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{entry.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{entry.branchName}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {entry.alpha > 0 && (
                        <Badge variant="destructive" className="tabular-nums">{entry.alpha} alpha</Badge>
                      )}
                      {entry.terlambat > 0 && (
                        <Badge variant="outline" className="tabular-nums">{entry.terlambat} telat</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4 — People and calendar. Birthdays appear here even though the bot
          already sends the greeting: HR needs the heads-up, not the receipt. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Karyawan aktif
            </CardTitle>
            <CardDescription>{headcount.newThisMonth} bergabung bulan ini</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-semibold tabular-nums">{headcount.total}</p>
            <ul className="space-y-1">
              {headcount.byBranch.map((branch) => (
                <li key={branch.branchName} className="flex justify-between text-sm">
                  <span className="truncate text-muted-foreground">{branch.branchName}</span>
                  <span className="tabular-nums">{branch.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CakeSlice className="h-4 w-4" />
              Ulang tahun 14 hari ke depan
            </CardTitle>
            <CardDescription>Ucapan otomatis tetap terkirim pukul 07:00 WITA.</CardDescription>
          </CardHeader>
          <CardContent>
            {birthdays.length === 0 ? (
              <EmptyState icon={CakeSlice} title="Tidak ada" description="Tidak ada ulang tahun dalam dua minggu ke depan." className="py-8" />
            ) : (
              <ul className="space-y-2">
                {birthdays.map((person) => (
                  <li key={person.userId} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{person.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{person.branchName}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {person.daysAway === 0 ? "Hari ini" : formatDate(person.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              Izin disetujui mendatang
            </CardTitle>
            <CardDescription>Untuk perencanaan tenaga, bukan antrean persetujuan.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingLeave.length === 0 ? (
              <EmptyState
                icon={CalendarOff}
                title="Tidak ada"
                description="Tidak ada izin disetujui dalam dua minggu ke depan."
                className="py-8"
              />
            ) : (
              <ul className="space-y-2">
                {upcomingLeave.map((leave) => (
                  <li key={leave.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{leave.fullName}</p>
                      <p className="text-xs capitalize text-muted-foreground">{leave.type}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(leave.startDate)}
                      {leave.startDate !== leave.endDate && ` – ${formatDate(leave.endDate)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
