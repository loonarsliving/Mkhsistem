"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FOLLOW_UP_ACTIVITY_TYPE_LABEL, LEAD_SOURCE_LABEL } from "@/constants/app";
import {
  CONTENT_FORMAT_LABELS,
  CONTENT_FORMATS,
  CONTENT_PLATFORM_LABELS,
  CONTENT_PLATFORMS,
  CONTENT_TOPIC_LABELS,
  CONTENT_TOPICS,
  INTEREST_LABELS,
  INTEREST_LEVELS,
  KOL_COMPENSATION_LABELS,
  KOL_COMPENSATIONS,
  KOL_DELIVERABLE_LABELS,
  KOL_DELIVERABLES,
  KOL_PLATFORMS,
  VISIT_OUTCOME_LABELS,
  VISIT_OUTCOMES,
  type KolDeliverable,
} from "@/lib/connect/labels";
import { SALES_DAILY_ITEMS } from "@/lib/connect/sales-report";
import { addDays, localParts, zonedToUtc } from "@/lib/hospitality/time";
import { cn } from "@/lib/utils";
import type { ContentPlanRef, KolRef, ProspectRef, VisitRef } from "@/repositories/connect.repository";

import {
  createContentAction,
  createKolAction,
  createLeadAction,
  dailyReportAction,
  decideKolAction,
  salesFollowUpAction,
  scheduleVisitAction,
  updateContentAction,
  updateKolAction,
  visitResultAction,
} from "../actions/connect.actions";
import { useChat } from "./chat-context";
import { CHAT_TZ } from "./chat-utils";
import { selectClass, useSubmit } from "./workflow-dialogs";

type OpenProps = { open: boolean; onOpenChange: (o: boolean) => void };

function today(): string {
  return localParts(new Date(), CHAT_TZ).date;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Select<T extends string>({ id, value, onChange, options }: { id?: string; value: T; onChange: (v: T) => void; options: readonly { value: T; label: string }[] }) {
  return (
    <select id={id} className={selectClass} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((v) => ({ value: v, label: labels[v] }));

function SubmitButton({ pending, disabled, onClick, children }: { pending: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <DialogFooter>
      <Button disabled={pending || disabled} onClick={onClick} className="w-full sm:w-auto">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />} {children}
      </Button>
    </DialogFooter>
  );
}

// ---------------------------------------------------------------------------
// Markom: content calendar
// ---------------------------------------------------------------------------
export function ContentPlanDialog({ open, onOpenChange, kol, defaultDate }: OpenProps & { kol?: KolRef; defaultDate?: string }) {
  const { departmentCode, userId, people } = useChat();
  const markom = people.filter((p) => p.role === "markom" && p.active);
  const [plannedDate, setPlannedDate] = React.useState(defaultDate ?? today());
  const [platform, setPlatform] = React.useState<(typeof CONTENT_PLATFORMS)[number]>("instagram");
  const [format, setFormat] = React.useState<(typeof CONTENT_FORMATS)[number]>("reels");
  const [topic, setTopic] = React.useState<(typeof CONTENT_TOPICS)[number]>(kol ? "kol" : "villa");
  const [title, setTitle] = React.useState(kol ? `Konten KOL ${kol.kolHandle}` : "");
  const [brief, setBrief] = React.useState("");
  const [picId, setPicId] = React.useState(markom.some((p) => p.id === userId) ? userId : (markom[0]?.id ?? userId));
  const { pending, run } = useSubmit(() => onOpenChange(false));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rencana konten</DialogTitle>
          <DialogDescription>Masuk ke kalender konten grup. PIC mendapat notifikasi; laporan malam mencatat yang tayang dan yang terlambat.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal tayang" htmlFor="cp-date">
            <Input id="cp-date" type="date" min={addDays(today(), -1)} value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
          </Field>
          <Field label="PIC" htmlFor="cp-pic">
            <Select id="cp-pic" value={picId} onChange={setPicId} options={markom.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="Platform" htmlFor="cp-platform">
            <Select id="cp-platform" value={platform} onChange={setPlatform} options={opts(CONTENT_PLATFORMS, CONTENT_PLATFORM_LABELS)} />
          </Field>
          <Field label="Format" htmlFor="cp-format">
            <Select id="cp-format" value={format} onChange={setFormat} options={opts(CONTENT_FORMATS, CONTENT_FORMAT_LABELS)} />
          </Field>
        </div>
        <Field label="Topik" htmlFor="cp-topic">
          <Select id="cp-topic" value={topic} onChange={setTopic} options={opts(CONTENT_TOPICS, CONTENT_TOPIC_LABELS)} />
        </Field>
        <Field label="Judul / ide konten" htmlFor="cp-title">
          <Input id="cp-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="mis. Room tour villa tipe 2 kamar" />
        </Field>
        <Field label="Brief (opsional)" htmlFor="cp-brief">
          <Textarea id="cp-brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} placeholder="Hook, caption, CTA, lokasi syuting…" />
        </Field>
        <SubmitButton
          pending={pending}
          disabled={title.trim().length < 3 || !plannedDate}
          onClick={() =>
            void run(
              () => createContentAction({ departmentCode, plannedDate, platform, format, topic, title, brief, picId, kolId: kol?.id }),
              "Masuk kalender konten",
            )
          }
        >
          Simpan rencana
        </SubmitButton>
      </DialogContent>
    </Dialog>
  );
}

export type ContentDialogAction = "publish" | "reschedule" | "reassign" | "cancel";

export function ContentActionDialog({ plan, action, open, onOpenChange }: OpenProps & { plan: ContentPlanRef; action: ContentDialogAction }) {
  const { people } = useChat();
  const markom = people.filter((p) => p.role === "markom" && p.active);
  const [url, setUrl] = React.useState("");
  const [date, setDate] = React.useState(plan.plannedDate < today() ? today() : plan.plannedDate);
  const [picId, setPicId] = React.useState(markom.find((p) => p.id !== plan.picId)?.id ?? plan.picId);
  const [note, setNote] = React.useState("");
  const { pending, run } = useSubmit(() => onOpenChange(false));
  const titles: Record<ContentDialogAction, string> = { publish: "Tandai tayang", reschedule: "Pindah tanggal", reassign: "Ganti PIC", cancel: "Batalkan konten" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[action]}</DialogTitle>
          <DialogDescription>{plan.title}</DialogDescription>
        </DialogHeader>
        {action === "publish" && (
          <Field label="Link konten yang sudah tayang" htmlFor="ca-url">
            <Input id="ca-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" />
          </Field>
        )}
        {action === "reschedule" && (
          <Field label="Tanggal baru" htmlFor="ca-date">
            <Input id="ca-date" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
        {action === "reassign" && (
          <Field label="PIC baru" htmlFor="ca-pic">
            <Select id="ca-pic" value={picId} onChange={setPicId} options={markom.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
        )}
        {(action === "reschedule" || action === "cancel") && (
          <Field label={action === "cancel" ? "Alasan" : "Alasan (opsional)"} htmlFor="ca-note">
            <Textarea id="ca-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </Field>
        )}
        <SubmitButton
          pending={pending}
          disabled={(action === "publish" && !/^https?:\/\/\S+$/i.test(url.trim())) || (action === "cancel" && note.trim().length < 3)}
          onClick={() => void run(() => updateContentAction({ id: plan.id, action, url: url || undefined, date, picId, note }), "Tersimpan")}
        >
          Simpan
        </SubmitButton>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Markom: KOL (request -> Rebecca's room approval -> stay -> content owed)
// ---------------------------------------------------------------------------
export function KolDialog({ open, onOpenChange }: OpenProps) {
  const { departmentCode } = useChat();
  const [kolHandle, setKolHandle] = React.useState("");
  const [platform, setPlatform] = React.useState<(typeof KOL_PLATFORMS)[number]>("instagram");
  const [followers, setFollowers] = React.useState("");
  const [niche, setNiche] = React.useState("");
  const [compensation, setCompensation] = React.useState<(typeof KOL_COMPENSATIONS)[number]>("barter");
  const [requestedCheckin, setRequestedCheckin] = React.useState(addDays(today(), 7));
  const [nights, setNights] = React.useState("1");
  const [deliverables, setDeliverables] = React.useState<KolDeliverable[]>(["reels", "story", "tag_lokasi"]);
  const [notes, setNotes] = React.useState("");
  const { pending, run } = useSubmit(() => onOpenChange(false));
  const toggle = (d: KolDeliverable) => setDeliverables((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kolaborasi KOL</DialogTitle>
          <DialogDescription>Pengajuan kamar villa untuk KOL. Rebecca memilih unit dan menyetujui; kupon KOL terbit otomatis setelah disetujui.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Akun KOL" htmlFor="kol-handle">
            <Input id="kol-handle" value={kolHandle} onChange={(e) => setKolHandle(e.target.value)} placeholder="@namaakun" maxLength={80} />
          </Field>
          <Field label="Platform" htmlFor="kol-platform">
            <Select id="kol-platform" value={platform} onChange={setPlatform} options={KOL_PLATFORMS.map((p) => ({ value: p, label: CONTENT_PLATFORM_LABELS[p] }))} />
          </Field>
          <Field label="Followers" htmlFor="kol-followers">
            <Input id="kol-followers" inputMode="numeric" value={followers} onChange={(e) => setFollowers(e.target.value.replace(/\D/g, ""))} placeholder="mis. 25000" />
          </Field>
          <Field label="Niche" htmlFor="kol-niche">
            <Input id="kol-niche" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="travel, kuliner…" maxLength={100} />
          </Field>
          <Field label="Rencana menginap" htmlFor="kol-checkin">
            <Input id="kol-checkin" type="date" min={today()} value={requestedCheckin} onChange={(e) => setRequestedCheckin(e.target.value)} />
          </Field>
          <Field label="Jumlah malam" htmlFor="kol-nights">
            <Select id="kol-nights" value={nights} onChange={setNights} options={["1", "2", "3", "4", "5", "6", "7"].map((n) => ({ value: n, label: `${n} malam` }))} />
          </Field>
        </div>
        <Field label="Kompensasi" htmlFor="kol-comp">
          <Select id="kol-comp" value={compensation} onChange={setCompensation} options={opts(KOL_COMPENSATIONS, KOL_COMPENSATION_LABELS)} />
        </Field>
        <div className="space-y-1.5">
          <Label>Kewajiban konten</Label>
          <div className="flex flex-wrap gap-1.5">
            {KOL_DELIVERABLES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggle(d)}
                className={cn("rounded-full border px-3 py-1 text-xs", deliverables.includes(d) ? "border-emerald-600 bg-emerald-600 text-white" : "bg-background")}
              >
                {KOL_DELIVERABLE_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
        <Field label="Catatan (opsional)" htmlFor="kol-notes">
          <Textarea id="kol-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Jumlah tamu, kebutuhan khusus, konsep konten…" />
        </Field>
        <SubmitButton
          pending={pending}
          disabled={kolHandle.trim().length < 2 || deliverables.length === 0}
          onClick={() =>
            void run(
              () =>
                createKolAction({
                  departmentCode,
                  kolHandle,
                  platform,
                  followers: followers ? Number(followers) : undefined,
                  niche,
                  compensation,
                  requestedCheckin,
                  nights: Number(nights),
                  deliverables,
                  notes,
                }),
              "Diajukan ke Rebecca",
            )
          }
        >
          Ajukan kamar
        </SubmitButton>
      </DialogContent>
    </Dialog>
  );
}

export function KolDecideDialog({ kol, decision, open, onOpenChange }: OpenProps & { kol: KolRef; decision: "approve" | "reject" }) {
  const { units } = useChat();
  const [unitId, setUnitId] = React.useState(units[0]?.id ?? "");
  const [checkin, setCheckin] = React.useState(kol.requestedCheckin < today() ? today() : kol.requestedCheckin);
  const [nights, setNights] = React.useState(String(kol.nights));
  const [note, setNote] = React.useState("");
  const [voucher, setVoucher] = React.useState<string | null>(null);
  const { pending, run } = useSubmit(() => {
    if (decision === "reject") onOpenChange(false);
  });

  if (voucher) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kupon KOL terbit</DialogTitle>
            <DialogDescription>Berikan kode ini ke KOL. Mereka memesan di loonars.id memakai kode ini; malam gratis terpotong otomatis.</DialogDescription>
          </DialogHeader>
          <p className="rounded-lg border-2 border-dashed border-emerald-500 py-4 text-center font-mono text-2xl font-bold tracking-widest">{voucher}</p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{decision === "approve" ? "Setujui kamar KOL" : "Tolak pengajuan KOL"}</DialogTitle>
          <DialogDescription>
            {kol.kolHandle} · minta {kol.nights} malam mulai {kol.requestedCheckin.split("-").reverse().join("-")}
          </DialogDescription>
        </DialogHeader>
        {decision === "approve" && (
          <>
            <Field label="Unit" htmlFor="kd-unit">
              <Select id="kd-unit" value={unitId} onChange={setUnitId} options={units.map((u) => ({ value: u.id, label: `Unit ${u.nomor}` }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Check-in" htmlFor="kd-checkin">
                <Input id="kd-checkin" type="date" min={today()} value={checkin} onChange={(e) => setCheckin(e.target.value)} />
              </Field>
              <Field label="Malam gratis" htmlFor="kd-nights">
                <Select id="kd-nights" value={nights} onChange={setNights} options={["1", "2", "3", "4", "5", "6", "7"].map((n) => ({ value: n, label: `${n} malam` }))} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Sistem mengecek booking dan jadwal maintenance unit itu di sistem villa sebelum kupon dibuat.</p>
          </>
        )}
        <Field label={decision === "reject" ? "Alasan penolakan" : "Catatan (opsional)"} htmlFor="kd-note">
          <Textarea id="kd-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </Field>
        <SubmitButton
          pending={pending}
          disabled={decision === "approve" ? !unitId || !checkin : note.trim().length < 3}
          onClick={() =>
            void run(async () => {
              const r = await decideKolAction({ kolId: kol.id, decision, unitId: unitId || undefined, checkin, nights: Number(nights), note });
              if (r.success && r.data?.voucherKode) setVoucher(r.data.voucherKode);
              return r;
            }, decision === "approve" ? "Disetujui — kupon terbit" : "Pengajuan ditolak")
          }
        >
          {decision === "approve" ? "Setujui & buat kupon" : "Tolak"}
        </SubmitButton>
      </DialogContent>
    </Dialog>
  );
}

export type KolDialogAction = "deliverable" | "cancel" | "note";

export function KolActionDialog({ kol, action, open, onOpenChange }: OpenProps & { kol: KolRef; action: KolDialogAction }) {
  const remaining = kol.deliverables.filter((d) => !(d in kol.deliverablesDone)) as KolDeliverable[];
  const [key, setKey] = React.useState<KolDeliverable>(remaining[0] ?? (kol.deliverables[0] as KolDeliverable));
  const [url, setUrl] = React.useState("");
  const [note, setNote] = React.useState("");
  const { pending, run } = useSubmit(() => onOpenChange(false));
  const titles: Record<KolDialogAction, string> = { deliverable: "Konten KOL tayang", cancel: "Batalkan kolaborasi", note: "Catatan KOL" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[action]}</DialogTitle>
          <DialogDescription>
            {kol.kolHandle}
            {action === "cancel" && kol.voucherKode ? ` · kupon ${kol.voucherKode} akan dinonaktifkan bila belum dipakai` : ""}
          </DialogDescription>
        </DialogHeader>
        {action === "deliverable" ? (
          <>
            <Field label="Kewajiban" htmlFor="ka-key">
              <Select id="ka-key" value={key} onChange={setKey} options={remaining.map((d) => ({ value: d, label: KOL_DELIVERABLE_LABELS[d] ?? d }))} />
            </Field>
            <Field label="Link konten" htmlFor="ka-url">
              <Input id="ka-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </Field>
          </>
        ) : (
          <Field label={action === "cancel" ? "Alasan" : "Catatan"} htmlFor="ka-note">
            <Textarea id="ka-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </Field>
        )}
        <SubmitButton
          pending={pending}
          disabled={action === "deliverable" ? !/^https?:\/\/\S+$/i.test(url.trim()) || !key : note.trim().length < 3}
          onClick={() => void run(() => updateKolAction({ kolId: kol.id, action, key: action === "deliverable" ? key : undefined, url: url || undefined, note }), "Tersimpan")}
        >
          Simpan
        </SubmitButton>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sales Jogja (Loonars 2). The CRM stays the record; these write through it.
// ---------------------------------------------------------------------------
const LEAD_SOURCES = Object.keys(LEAD_SOURCE_LABEL) as (keyof typeof LEAD_SOURCE_LABEL)[];
const ACTIVITY_TYPES = (Object.keys(FOLLOW_UP_ACTIVITY_TYPE_LABEL) as (keyof typeof FOLLOW_UP_ACTIVITY_TYPE_LABEL)[]).filter((a) => a !== "site_visit");

export function LeadDialog({ open, onOpenChange }: OpenProps) {
  const { departmentCode } = useChat();
  const [customerName, setCustomerName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [houseType, setHouseType] = React.useState("");
  const [city, setCity] = React.useState("Yogyakarta");
  const [leadSource, setLeadSource] = React.useState<(typeof LEAD_SOURCES)[number]>("instagram");
  const [notes, setNotes] = React.useState("");
  const { pending, run } = useSubmit(() => onOpenChange(false));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lead baru Loonars 2</DialogTitle>
          <DialogDescription>Tersimpan di CRM. Nomor telepon hanya ada di CRM — tidak ditampilkan di grup.</DialogDescription>
        </DialogHeader>
        <Field label="Nama calon pembeli" htmlFor="ld-name">
          <Input id="ld-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={200} />
        </Field>
        <Field label="No. HP / WhatsApp" htmlFor="ld-phone">
          <Input id="ld-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipe unit diminati" htmlFor="ld-type">
            <Input id="ld-type" value={houseType} onChange={(e) => setHouseType(e.target.value)} placeholder="mis. Avara" maxLength={100} />
          </Field>
          <Field label="Kota asal" htmlFor="ld-city">
            <Input id="ld-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} />
          </Field>
        </div>
        <Field label="Sumber lead" htmlFor="ld-source">
          <Select id="ld-source" value={leadSource} onChange={setLeadSource} options={LEAD_SOURCES.map((s) => ({ value: s, label: LEAD_SOURCE_LABEL[s] }))} />
        </Field>
        <Field label="Catatan (opsional)" htmlFor="ld-notes">
          <Textarea id="ld-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <SubmitButton
          pending={pending}
          disabled={customerName.trim().length < 2 || phone.trim().length < 8 || !houseType.trim() || !city.trim()}
          onClick={() => void run(() => createLeadAction({ departmentCode, customerName, phone, houseType, city, leadSource, notes }), "Lead tersimpan di CRM")}
        >
          Simpan lead
        </SubmitButton>
      </DialogContent>
    </Dialog>
  );
}

export function FollowUpDialog({ prospect, open, onOpenChange }: OpenProps & { prospect: ProspectRef }) {
  const { departmentCode } = useChat();
  const [activityType, setActivityType] = React.useState<(typeof ACTIVITY_TYPES)[number]>("whatsapp");
  const [notes, setNotes] = React.useState("");
  const { pending, run } = useSubmit(() => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Catat follow-up</DialogTitle>
          <DialogDescription>{prospect.name} · tercatat di CRM hari ini</DialogDescription>
        </DialogHeader>
        <Field label="Lewat" htmlFor="fu-type">
          <Select id="fu-type" value={activityType} onChange={setActivityType} options={ACTIVITY_TYPES.map((a) => ({ value: a, label: FOLLOW_UP_ACTIVITY_TYPE_LABEL[a] }))} />
        </Field>
        <Field label="Hasil" htmlFor="fu-notes">
          <Textarea id="fu-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="mis. Minat tipe Avara, minta simulasi KPR" />
        </Field>
        <SubmitButton
          pending={pending}
          disabled={notes.trim().length < 3}
          onClick={() => void run(() => salesFollowUpAction({ departmentCode, prospectId: prospect.id, activityType, notes }), "Follow-up tercatat di CRM")}
        >
          Simpan
        </SubmitButton>
      </DialogContent>
    </Dialog>
  );
}

export function VisitDialog({ prospect, open, onOpenChange }: OpenProps & { prospect: { id: string; name: string } }) {
  const { departmentCode } = useChat();
  const [date, setDate] = React.useState(addDays(today(), 1));
  const [time, setTime] = React.useState("10:00");
  const [note, setNote] = React.useState("");
  const { pending, run } = useSubmit(() => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Jadwalkan kunjungan lokasi</DialogTitle>
          <DialogDescription>{prospect.name} · Loonars 2</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal" htmlFor="vs-date">
            <Input id="vs-date" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Jam" htmlFor="vs-time">
            <Input id="vs-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Catatan (opsional)" htmlFor="vs-note">
          <Textarea id="vs-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="mis. datang bersama pasangan, minta lihat unit contoh" />
        </Field>
        <SubmitButton
          pending={pending}
          disabled={!date || !/^\d{2}:\d{2}$/.test(time)}
          onClick={() =>
            void run(
              () => scheduleVisitAction({ departmentCode, prospectId: prospect.id, scheduledAt: zonedToUtc(date, time, CHAT_TZ).toISOString(), note }),
              "Kunjungan dijadwalkan",
            )
          }
        >
          Jadwalkan
        </SubmitButton>
      </DialogContent>
    </Dialog>
  );
}

export function VisitResultDialog({ visit, open, onOpenChange }: OpenProps & { visit: VisitRef }) {
  const [outcome, setOutcome] = React.useState<(typeof VISIT_OUTCOMES)[number]>("done");
  const [interest, setInterest] = React.useState<(typeof INTEREST_LEVELS)[number]>("warm");
  const [note, setNote] = React.useState("");
  const { pending, run } = useSubmit(() => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hasil kunjungan</DialogTitle>
          <DialogDescription>{visit.prospectName} · kunjungan selesai juga tercatat sebagai follow-up di CRM</DialogDescription>
        </DialogHeader>
        <Field label="Hasil" htmlFor="vr-outcome">
          <Select id="vr-outcome" value={outcome} onChange={setOutcome} options={opts(VISIT_OUTCOMES, VISIT_OUTCOME_LABELS)} />
        </Field>
        {outcome === "done" && (
          <Field label="Minat" htmlFor="vr-interest">
            <Select id="vr-interest" value={interest} onChange={setInterest} options={opts(INTEREST_LEVELS, INTEREST_LABELS)} />
          </Field>
        )}
        <Field label={outcome === "done" ? "Hasil kunjungan" : "Catatan (opsional)"} htmlFor="vr-note">
          <Textarea id="vr-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </Field>
        <SubmitButton
          pending={pending}
          disabled={outcome === "done" && note.trim().length < 3}
          onClick={() => void run(() => visitResultAction({ visitId: visit.id, outcome, interest: outcome === "done" ? interest : undefined, note }), "Tersimpan")}
        >
          Simpan
        </SubmitButton>
      </DialogContent>
    </Dialog>
  );
}

export function DailyReportDialog({ open, onOpenChange }: OpenProps) {
  const { departmentCode } = useChat();
  const [items, setItems] = React.useState<Record<string, boolean>>(() => Object.fromEntries(SALES_DAILY_ITEMS.map((i) => [i.key, false])));
  const [followUps, setFollowUps] = React.useState("0");
  const [visits, setVisits] = React.useState("0");
  const [hot, setHot] = React.useState("0");
  const [notes, setNotes] = React.useState("");
  const { pending, run } = useSubmit(() => onOpenChange(false));
  const num = (v: string) => v.replace(/\D/g, "").slice(0, 3);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Laporan harian sales</DialogTitle>
          <DialogDescription>Sekali per hari. Angka follow-up di laporan owner tetap dihitung dari CRM, bukan dari isian ini.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {SALES_DAILY_ITEMS.map((i) => (
            <label key={i.key} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-emerald-600"
                checked={!!items[i.key]}
                onChange={(e) => setItems((cur) => ({ ...cur, [i.key]: e.target.checked }))}
              />
              {i.label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Follow-up" htmlFor="dr-fu">
            <Input id="dr-fu" inputMode="numeric" value={followUps} onChange={(e) => setFollowUps(num(e.target.value))} />
          </Field>
          <Field label="Kunjungan" htmlFor="dr-visits">
            <Input id="dr-visits" inputMode="numeric" value={visits} onChange={(e) => setVisits(num(e.target.value))} />
          </Field>
          <Field label="Prospek panas" htmlFor="dr-hot">
            <Input id="dr-hot" inputMode="numeric" value={hot} onChange={(e) => setHot(num(e.target.value))} />
          </Field>
        </div>
        <Field label="Kendala / rencana besok (opsional)" htmlFor="dr-notes">
          <Textarea id="dr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
        <SubmitButton
          pending={pending}
          onClick={() =>
            void run(
              () => dailyReportAction({ departmentCode, items, followUps: Number(followUps || 0), visits: Number(visits || 0), hot: Number(hot || 0), notes }),
              "Laporan harian terkirim",
            )
          }
        >
          Kirim laporan
        </SubmitButton>
      </DialogContent>
    </Dialog>
  );
}
