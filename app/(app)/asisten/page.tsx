import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CakeSlice, ClipboardList, FileClock, ListChecks, ReceiptText, Sparkles, UserPlus, Wallet } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile } from "@/components/shared/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FollowupPanel } from "@/features/assistant/components/followup-panel";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getPrincipalQueue, listActiveEscalations, listFollowups } from "@/repositories/assistant.repository";
import { getUpcomingBirthdays } from "@/repositories/hr-workspace.repository";
import { getLatestDailyDigest } from "@/repositories/voice-bridge-digest.repository";

export const metadata: Metadata = { title: "Ruang Kerja Asisten" };

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Makassar",
});
const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });

/** Alert categories that mean "drop what you are doing", as opposed to a routine escalation. */
const CRITICAL_CATEGORIES = new Set([
  "emergency_notice",
  "automation_dispatch_failed",
  "automation_queue_stalled",
  "whatsapp_webhook_silence_alert",
]);

/**
 * Private assistant workspace.
 *
 * Built around one job: make sure nothing reaches the principal's desk that
 * the assistant has not already seen and chased. Read-only throughout except
 * the follow-up list -- the role holds no approve, verify, or publish
 * permission anywhere (see constants/rbac.ts), so this page shows the work
 * and links to it rather than offering to decide it.
 *
 * The daily summary at the top is not a new AI call: voice-bridge-daily-digest
 * (pg_cron, 17:00 WITA) has been writing one every day for Ultron to read
 * aloud, and nothing in the web app ever displayed it.
 */
export default async function AssistantWorkspacePage() {
  const session = await requirePermission("assistant_workspace.view");
  const supabase = await createClient();

  const [digest, queue, escalations, followups, birthdays] = await Promise.all([
    getLatestDailyDigest(supabase).catch(() => null),
    getPrincipalQueue(supabase),
    listActiveEscalations(supabase).catch(() => []),
    listFollowups(supabase, session.userId).catch(() => []),
    getUpcomingBirthdays(supabase, 7).catch(() => []),
  ]);

  const queueTotal =
    queue.pendingRegistrations +
    queue.pendingLeave +
    queue.draftPayrollRuns +
    queue.pendingHrExpenses +
    queue.pendingPaymentVerification +
    queue.pendingSp1Reviews +
    queue.pendingContentReviews;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ruang Kerja Asisten"
        description="Ringkasan harian, apa yang menunggu keputusan, dan apa yang sedang bermasalah."
      />

      {/* 1 — The digest the system already writes every evening. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Ringkasan harian
          </CardTitle>
          <CardDescription>
            {digest?.generated_at
              ? `Disusun otomatis ${DATE_TIME_FORMAT.format(new Date(digest.generated_at))} WITA`
              : "Disusun otomatis setiap pukul 17:00 WITA"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {digest?.digest_text ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{digest.digest_text}</p>
          ) : (
            <EmptyState
              icon={Sparkles}
              title="Ringkasan belum tersedia"
              description="Ringkasan pertama akan muncul setelah jadwal 17:00 WITA berikutnya berjalan."
              className="py-8"
            />
          )}
        </CardContent>
      </Card>

      {/* 2 — Everything sitting on the principal's desk, in one list. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Menunggu keputusan</CardTitle>
          <CardDescription>
            {queueTotal === 0
              ? "Tidak ada yang mengendap. Semua sudah diputuskan."
              : `${queueTotal} hal belum diputuskan — tugas Anda memastikan tidak ada yang terlewat.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/registrations">
            <StatTile icon={UserPlus} label="Registrasi karyawan" value={String(queue.pendingRegistrations)} tone={queue.pendingRegistrations > 0 ? "warning" : "success"} />
          </Link>
          <Link href="/attendance?tab=leave">
            <StatTile icon={FileClock} label="Izin / sakit" value={String(queue.pendingLeave)} tone={queue.pendingLeave > 0 ? "warning" : "success"} />
          </Link>
          <Link href="/hr/finance-sync">
            <StatTile icon={Wallet} label="Payroll draft" value={String(queue.draftPayrollRuns)} tone={queue.draftPayrollRuns > 0 ? "warning" : "success"} />
          </Link>
          <Link href="/hr/finance-sync">
            <StatTile icon={ReceiptText} label="HR expense" value={String(queue.pendingHrExpenses)} tone={queue.pendingHrExpenses > 0 ? "warning" : "success"} />
          </Link>
          <Link href="/crm/finance">
            <StatTile icon={ReceiptText} label="Verifikasi pembayaran" value={String(queue.pendingPaymentVerification)} tone={queue.pendingPaymentVerification > 0 ? "warning" : "success"} />
          </Link>
          <Link href="/crm/warnings">
            <StatTile icon={AlertTriangle} label="SP1 menunggu review" value={String(queue.pendingSp1Reviews)} tone={queue.pendingSp1Reviews > 0 ? "warning" : "success"} />
          </Link>
          <Link href="/markom/content-studio">
            <StatTile icon={ClipboardList} label="Konten menunggu review" value={String(queue.pendingContentReviews)} tone={queue.pendingContentReviews > 0 ? "warning" : "success"} />
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 3 — What is currently on fire. Sourced from mkc_notifications, so new
            alert categories show up here without this page changing. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Eskalasi &amp; peringatan aktif
            </CardTitle>
            <CardDescription>Tiga hari terakhir, sudah dikelompokkan agar tidak berulang.</CardDescription>
          </CardHeader>
          <CardContent>
            {escalations.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="Tidak ada peringatan"
                description="Tidak ada eskalasi atau alert sistem dalam tiga hari terakhir."
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-border">
                {escalations.map((item) => (
                  <li key={item.id} className="py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        {item.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>}
                      </div>
                      {CRITICAL_CATEGORIES.has(item.category) && (
                        <Badge variant="destructive" className="shrink-0">Kritis</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{DATE_TIME_FORMAT.format(new Date(item.createdAt))}</span>
                      {item.link && (
                        <Link href={item.link} className="underline underline-offset-2 hover:text-foreground">
                          Buka
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 4 — The assistant's own chase list. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4" />
              Tindak lanjut saya
            </CardTitle>
            <CardDescription>Daftar pribadi — hanya Anda yang bisa melihatnya.</CardDescription>
          </CardHeader>
          <CardContent>
            <FollowupPanel items={followups} />
          </CardContent>
        </Card>
      </div>

      {/* 5 — The personal touch the principal is expected to remember. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CakeSlice className="h-4 w-4" />
            Ulang tahun minggu ini
          </CardTitle>
          <CardDescription>Ucapan otomatis tetap terkirim pukul 07:00 WITA pada harinya.</CardDescription>
        </CardHeader>
        <CardContent>
          {birthdays.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Tidak ada ulang tahun dalam tujuh hari ke depan.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {birthdays.map((person) => (
                <li key={person.userId} className="rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="font-medium">{person.fullName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {person.daysAway === 0 ? "Hari ini" : DATE_FORMAT.format(new Date(person.date))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
