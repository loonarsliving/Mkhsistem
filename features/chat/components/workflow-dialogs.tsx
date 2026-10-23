"use client";

import * as React from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_TITLES,
  FO_DECISION_LABELS,
  ISSUE_CATEGORIES,
  ISSUE_CATEGORY_LABELS,
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABELS,
  MEMBER_ROLE_LABELS,
  type ChecklistKind,
  type EvidenceSlot,
  type FoDecision,
  type IssueCategory,
  type IssueSeverity,
  type MemberRole,
  type SecurityKind,
} from "@/lib/hospitality/checklists";
import { cn } from "@/lib/utils";
import type { IssueRef, RoomTaskRef } from "@/repositories/chat.repository";
import type { ActionResult } from "@/types/domain";

import {
  assignTaskAction,
  blockTaskAction,
  createIssueAction,
  foInspectAction,
  submitCleaningAction,
  submitSecurityAction,
  updateIssueAction,
} from "../actions/chat.actions";
import { useChat } from "./chat-context";
import { EvidenceSlotButton, ExtraEvidence, type UploadedEvidence } from "./evidence-picker";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function useSubmit(onDone: () => void) {
  const { refresh } = useChat();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    async (fn: () => Promise<ActionResult<unknown>>, success: string) => {
      setPending(true);
      try {
        const result = await fn();
        if (!result.success) {
          const field = result.fieldErrors ? Object.values(result.fieldErrors).flat()[0] : null;
          toast.error(field ?? result.error ?? "Gagal");
          return;
        }
        toast.success(success);
        onDone();
        refresh();
      } finally {
        setPending(false);
      }
    },
    [onDone, refresh],
  );
  return { pending, run };
}

/** Tap-friendly checklist. Each item is ticked when it is OK. */
function ChecklistField({ kind, value, onChange }: { kind: ChecklistKind; value: Record<string, boolean>; onChange: (v: Record<string, boolean>) => void }) {
  const items = CHECKLIST_ITEMS[kind];
  const allOk = items.every((i) => value[i.key]);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Checklist</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange(Object.fromEntries(items.map((i) => [i.key, !allOk])))}
          className="h-8 text-xs"
        >
          <CheckCheck className="h-3.5 w-3.5" /> {allOk ? "Kosongkan" : "Semua baik"}
        </Button>
      </div>
      <div className="divide-y rounded-lg border">
        {items.map((item) => (
          <label key={item.key} className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-emerald-600"
              checked={!!value[item.key]}
              onChange={(e) => onChange({ ...value, [item.key]: e.target.checked })}
            />
            <span className={cn(!value[item.key] && "text-muted-foreground")}>{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function fullItems(kind: ChecklistKind, value: Record<string, boolean>): Record<string, boolean> {
  return Object.fromEntries(CHECKLIST_ITEMS[kind].map((i) => [i.key, !!value[i.key]]));
}

// ---------------------------------------------------------------------------

export function CleaningDialog({ task, open, onOpenChange }: { task: RoomTaskRef; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { conversationId, userId } = useChat();
  const [items, setItems] = React.useState<Record<string, boolean>>({});
  const [notes, setNotes] = React.useState("");
  const [photos, setPhotos] = React.useState<UploadedEvidence[]>([]);
  const { pending, run } = useSubmit(() => onOpenChange(false));
  const allOk = CHECKLIST_ITEMS.cleaning.every((i) => items[i.key]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Checklist Kebersihan — Unit {task.unitNomor}</DialogTitle>
          <DialogDescription>Centang semua pekerjaan yang sudah selesai, lalu serahkan ke FO untuk diperiksa.</DialogDescription>
        </DialogHeader>
        <ChecklistField kind="cleaning" value={items} onChange={setItems} />
        <div className="space-y-1.5">
          <Label>Foto hasil (opsional)</Label>
          <ExtraEvidence conversationId={conversationId} userId={userId} value={photos} onChange={setPhotos} slot="other" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cl-notes">Catatan</Label>
          <Textarea id="cl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Opsional" />
        </div>
        {!allOk && <p className="text-xs text-amber-600">Ada pekerjaan belum dicentang. Jika ada kendala, tutup ini dan tandai tugas &quot;Terkendala&quot;.</p>}
        <DialogFooter>
          <Button
            disabled={pending || !allOk}
            onClick={() =>
              void run(
                () => submitCleaningAction({ taskId: task.id, items: fullItems("cleaning", items), notes, attachmentIds: photos.map((p) => p.id) }),
                "Diserahkan ke FO untuk diperiksa",
              )
            }
            className="w-full sm:w-auto"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Serahkan ke FO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const INSPECTION_SLOTS: EvidenceSlot[] = ["bed", "bathroom", "main_room"];

export function InspectionDialog({ task, open, onOpenChange }: { task: RoomTaskRef; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { conversationId, userId } = useChat();
  const [items, setItems] = React.useState<Record<string, boolean>>({});
  const [slots, setSlots] = React.useState<Partial<Record<EvidenceSlot, UploadedEvidence | null>>>({});
  const [problemPhotos, setProblemPhotos] = React.useState<UploadedEvidence[]>([]);
  const [notes, setNotes] = React.useState("");
  const [decision, setDecision] = React.useState<FoDecision>("ready");
  const { pending, run } = useSubmit(() => onOpenChange(false));

  const allOk = CHECKLIST_ITEMS.fo_inspection.every((i) => items[i.key]);
  const photosDone = INSPECTION_SLOTS.every((s) => slots[s]);
  const effectiveDecision: FoDecision = allOk ? decision : decision === "ready" ? "needs_recleaning" : decision;
  const canSubmit = effectiveDecision === "ready" ? allOk && photosDone : notes.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pemeriksaan Kamar — Unit {task.unitNomor}</DialogTitle>
          <DialogDescription>Kamar baru dijual lagi setelah semua poin baik dan 3 foto wajib diambil.</DialogDescription>
        </DialogHeader>
        <ChecklistField kind="fo_inspection" value={items} onChange={setItems} />
        <div className="space-y-1.5">
          <Label>Foto wajib</Label>
          <div className="flex justify-around gap-2">
            {INSPECTION_SLOTS.map((slot) => (
              <EvidenceSlotButton
                key={slot}
                conversationId={conversationId}
                userId={userId}
                slot={slot}
                required
                value={slots[slot] ?? null}
                onChange={(v) => setSlots((s) => ({ ...s, [slot]: v }))}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Foto masalah (jika ada)</Label>
          <ExtraEvidence conversationId={conversationId} userId={userId} value={problemPhotos} onChange={setProblemPhotos} />
        </div>
        <div className="space-y-1.5">
          <Label>Keputusan</Label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(FO_DECISION_LABELS) as FoDecision[]).map((d) => (
              <button
                key={d}
                type="button"
                disabled={d === "ready" && !allOk}
                onClick={() => setDecision(d)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:opacity-40",
                  effectiveDecision === d && (d === "ready" ? "border-emerald-600 bg-emerald-600 text-white" : "border-amber-600 bg-amber-600 text-white"),
                )}
              >
                {FO_DECISION_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fo-notes">Catatan {effectiveDecision !== "ready" && <span className="text-amber-600">*</span>}</Label>
          <Textarea
            id="fo-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={effectiveDecision === "ready" ? "Opsional" : "Tulis masalah yang ditemukan"}
          />
        </div>
        {effectiveDecision === "ready" && !photosDone && <p className="text-xs text-amber-600">Ambil ketiga foto wajib dulu.</p>}
        <DialogFooter>
          <Button
            disabled={pending || !canSubmit}
            onClick={() =>
              void run(
                () =>
                  foInspectAction({
                    taskId: task.id,
                    items: fullItems("fo_inspection", items),
                    notes,
                    decision: effectiveDecision,
                    attachmentIds: [...INSPECTION_SLOTS.map((s) => slots[s]?.id).filter((x): x is string => !!x), ...problemPhotos.map((p) => p.id)],
                  }),
                effectiveDecision === "ready" ? `Unit ${task.unitNomor} siap dijual` : "Hasil pemeriksaan dikirim",
              )
            }
            className={cn("w-full sm:w-auto", effectiveDecision !== "ready" && "bg-amber-600 from-amber-600 to-amber-600")}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {effectiveDecision === "ready" ? "Nyatakan Siap Dijual" : "Kirim Hasil Pemeriksaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SecurityDialog({ kind, open, onOpenChange }: { kind: SecurityKind; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { conversationId, userId, departmentCode, units } = useChat();
  const [items, setItems] = React.useState<Record<string, boolean>>({});
  const [notes, setNotes] = React.useState("");
  const [unitId, setUnitId] = React.useState("");
  const [arrival, setArrival] = React.useState("");
  const [severity, setSeverity] = React.useState<IssueSeverity>("medium");
  const [photos, setPhotos] = React.useState<UploadedEvidence[]>([]);
  const { pending, run } = useSubmit(() => onOpenChange(false));
  const allOk = CHECKLIST_ITEMS[kind].every((i) => items[i.key]);
  const lateCheckin = kind === "security_late_checkin";
  const canSubmit = (allOk || notes.trim().length > 0) && (!lateCheckin || (!!unitId && /^\d{2}:\d{2}$/.test(arrival)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{CHECKLIST_TITLES[kind]}</DialogTitle>
          <DialogDescription>
            {lateCheckin ? "Jangan tulis identitas tamu di sini — data tamu tetap di sistem villa." : "Centang yang aman. Keterangan hanya perlu jika ada masalah."}
          </DialogDescription>
        </DialogHeader>
        {lateCheckin && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sec-unit">Unit</Label>
              <select id="sec-unit" className={selectClass} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Pilih unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nomor}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sec-arrival">Jam tiba</Label>
              <Input id="sec-arrival" type="time" value={arrival} onChange={(e) => setArrival(e.target.value)} />
            </div>
          </div>
        )}
        <ChecklistField kind={kind} value={items} onChange={setItems} />
        {!allOk && (
          <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
            <p className="text-xs text-amber-800 dark:text-amber-300">Ada poin tidak aman — akan dicatat sebagai masalah yang harus diselesaikan.</p>
            <div className="space-y-1.5">
              <Label htmlFor="sec-sev">Tingkat</Label>
              <select id="sec-sev" className={selectClass} value={severity} onChange={(e) => setSeverity(e.target.value as IssueSeverity)}>
                {ISSUE_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {ISSUE_SEVERITY_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <ExtraEvidence conversationId={conversationId} userId={userId} value={photos} onChange={setPhotos} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="sec-notes">Keterangan {!allOk && <span className="text-amber-600">*</span>}</Label>
          <Textarea id="sec-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={allOk ? "Opsional" : "Apa yang terjadi?"} />
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !canSubmit}
            onClick={() =>
              void run(
                () =>
                  submitSecurityAction({
                    departmentCode,
                    kind,
                    items: fullItems(kind, items),
                    notes,
                    unitId: unitId || undefined,
                    arrivalTime: arrival || undefined,
                    severity,
                    attachmentIds: photos.map((p) => p.id),
                  }),
                "Laporan terkirim",
              )
            }
            className="w-full sm:w-auto"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Kirim Laporan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IssueDialog({
  open,
  onOpenChange,
  defaultCategory = "room",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultCategory?: IssueCategory;
}) {
  const { conversationId, userId, departmentCode, units, people } = useChat();
  const [category, setCategory] = React.useState<IssueCategory>(defaultCategory);
  const [severity, setSeverity] = React.useState<IssueSeverity>("medium");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [unitId, setUnitId] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [actionTaken, setActionTaken] = React.useState("");
  const [assignedTo, setAssignedTo] = React.useState("");
  const [photos, setPhotos] = React.useState<UploadedEvidence[]>([]);
  const { pending, run } = useSubmit(() => onOpenChange(false));
  const members = people.filter((p) => p.active && p.role);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lapor Masalah / Insiden</DialogTitle>
          <DialogDescription>Masalah tetap terlihat sampai benar-benar selesai. Insiden kritis langsung diteruskan ke Hospitality Manager dan owner.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="is-cat">Kategori</Label>
            <select id="is-cat" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as IssueCategory)}>
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {ISSUE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="is-sev">Tingkat</Label>
            <select id="is-sev" className={selectClass} value={severity} onChange={(e) => setSeverity(e.target.value as IssueSeverity)}>
              {ISSUE_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {ISSUE_SEVERITY_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {severity === "critical" && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            Kritis: notifikasi langsung ke Hospitality Manager dan owner (aplikasi + WhatsApp).
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="is-title">Judul</Label>
          <Input id="is-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mis. AC unit A2 bocor" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="is-desc">Uraian</Label>
          <Textarea id="is-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="is-unit">Unit (opsional)</Label>
            <select id="is-unit" className={selectClass} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nomor}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="is-loc">Lokasi lain</Label>
            <Input id="is-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Mis. parkir" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="is-action">Tindakan yang sudah diambil</Label>
          <Textarea id="is-action" value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} rows={2} placeholder="Opsional" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="is-assign">Penanggung jawab</Label>
          <select id="is-assign" className={selectClass} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Belum ditentukan</option>
            {members.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {MEMBER_ROLE_LABELS[p.role as MemberRole] ?? p.role}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Foto (jika aman diambil)</Label>
          <ExtraEvidence conversationId={conversationId} userId={userId} value={photos} onChange={setPhotos} />
        </div>
        <DialogFooter>
          <Button
            variant={severity === "critical" ? "destructive" : "default"}
            disabled={pending || title.trim().length < 3 || description.trim().length < 3}
            onClick={() =>
              void run(
                () =>
                  createIssueAction({
                    departmentCode,
                    category,
                    severity,
                    title,
                    description,
                    unitId: unitId || undefined,
                    location,
                    actionTaken,
                    assignedTo: assignedTo || undefined,
                    attachmentIds: photos.map((p) => p.id),
                  }),
                severity === "critical" ? "Insiden kritis dilaporkan & diteruskan" : "Masalah dilaporkan",
              )
            }
            className="w-full sm:w-auto"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Laporkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type IssueDialogAction = "assign" | "resolve" | "cancel" | "note";
const ISSUE_ACTION_TITLES: Record<IssueDialogAction, string> = {
  assign: "Tugaskan",
  resolve: "Tandai selesai",
  cancel: "Batalkan masalah",
  note: "Tambah catatan",
};

export function IssueActionDialog({
  issue,
  action,
  open,
  onOpenChange,
}: {
  issue: IssueRef;
  action: IssueDialogAction;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { people } = useChat();
  const [note, setNote] = React.useState("");
  const [assignee, setAssignee] = React.useState(issue.assignedTo ?? "");
  const { pending, run } = useSubmit(() => onOpenChange(false));
  const members = people.filter((p) => p.active && p.role);
  const needsNote = action !== "assign";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {ISSUE_ACTION_TITLES[action]} — {issue.code}
          </DialogTitle>
          <DialogDescription>{issue.title}</DialogDescription>
        </DialogHeader>
        {action === "assign" && (
          <select className={selectClass} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Penanggung jawab">
            <option value="">Pilih anggota</option>
            {members.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {MEMBER_ROLE_LABELS[p.role as MemberRole] ?? p.role}
              </option>
            ))}
          </select>
        )}
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={action === "resolve" ? "Apa yang dilakukan untuk menyelesaikan?" : action === "cancel" ? "Alasan pembatalan" : "Catatan (opsional)"}
          aria-label="Catatan"
        />
        <DialogFooter>
          <Button
            variant={action === "cancel" ? "destructive" : "default"}
            disabled={pending || (needsNote && note.trim().length < (action === "cancel" ? 5 : 1)) || (action === "assign" && !assignee)}
            onClick={() =>
              void run(() => updateIssueAction({ issueId: issue.id, action, assignee: assignee || undefined, note }), "Tersimpan")
            }
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} {ISSUE_ACTION_TITLES[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignTaskDialog({ task, open, onOpenChange }: { task: RoomTaskRef; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { people } = useChat();
  const [employeeId, setEmployeeId] = React.useState(task.assignedTo ?? "");
  const { pending, run } = useSubmit(() => onOpenChange(false));
  const cleaners = people.filter((p) => p.active && (p.role === "cleaning" || p.role === "manager"));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tugaskan Unit {task.unitNomor}</DialogTitle>
          <DialogDescription>{cleaners.length === 0 ? "Belum ada anggota Cleaning di grup." : "Pilih petugas kebersihan."}</DialogDescription>
        </DialogHeader>
        <select className={selectClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label="Petugas">
          <option value="">Pilih petugas</option>
          {cleaners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {MEMBER_ROLE_LABELS[p.role as MemberRole]}
            </option>
          ))}
        </select>
        <DialogFooter>
          <Button disabled={pending || !employeeId} onClick={() => void run(() => assignTaskAction({ taskId: task.id, employeeId }), "Ditugaskan")}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Tugaskan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BlockTaskDialog({ task, open, onOpenChange }: { task: RoomTaskRef; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [reason, setReason] = React.useState("");
  const { pending, run } = useSubmit(() => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unit {task.unitNomor} terkendala</DialogTitle>
          <DialogDescription>Hospitality Manager akan diberi tahu.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Mis. air mati, menunggu teknisi" aria-label="Kendala" />
        <DialogFooter>
          <Button disabled={pending || reason.trim().length < 3} onClick={() => void run(() => blockTaskAction({ taskId: task.id, reason }), "Kendala dicatat")}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
