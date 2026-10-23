"use client";

import * as React from "react";
import {
  AlertTriangle,
  BedDouble,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  ImageOff,
  Loader2,
  Lock,
  Play,
  ShieldCheck,
  Siren,
  UserPlus,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_TITLES,
  FO_DECISION_LABELS,
  ISSUE_CATEGORY_LABELS,
  ISSUE_SEVERITY_LABELS,
  ISSUE_STATUS_LABELS,
  TASK_STATUS_LABELS,
  roleCan,
  type ChecklistKind,
  type FoDecision,
  type IssueCategory,
  type IssueSeverity,
} from "@/lib/hospitality/checklists";
import { cn } from "@/lib/utils";
import type { ChatAttachment, ChecklistRef, IssueRef, RoomTaskRef } from "@/repositories/chat.repository";

import { setRetentionHoldAction, startTaskAction } from "../actions/chat.actions";
import { personName, useChat } from "./chat-context";
import { formatAge, formatDateTime, isOverdue } from "./chat-utils";
import {
  AssignTaskDialog,
  BlockTaskDialog,
  CleaningDialog,
  InspectionDialog,
  IssueActionDialog,
  type IssueDialogAction,
} from "./workflow-dialogs";

const TASK_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  in_progress: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  awaiting_inspection: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  blocked: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  cancelled: "bg-slate-100 text-slate-500",
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-amber-400 text-amber-950",
  low: "bg-slate-300 text-slate-800",
};

export function StatusPill({ label, tone }: { label: string; tone: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}>{label}</span>;
}

/** Shared action row for a room task: only what the viewer's group role may do in the task's current status. */
export function TaskActions({ task, compact = false }: { task: RoomTaskRef; compact?: boolean }) {
  const { myRole, refresh } = useChat();
  const [open, setOpen] = React.useState<null | "clean" | "inspect" | "assign" | "block">(null);
  const [starting, setStarting] = React.useState(false);
  const s = task.status;
  const size = compact ? "sm" : "sm";

  async function start() {
    setStarting(true);
    const r = await startTaskAction({ taskId: task.id });
    setStarting(false);
    if (!r.success) toast.error(r.error ?? "Gagal");
    else refresh();
  }

  const buttons: React.ReactNode[] = [];
  if ((s === "pending" || s === "blocked") && roleCan(myRole, "startCleaning"))
    buttons.push(
      <Button key="start" size={size} onClick={() => void start()} disabled={starting}>
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Mulai
      </Button>,
    );
  if (s === "in_progress" && roleCan(myRole, "submitCleaning"))
    buttons.push(
      <Button key="clean" size={size} onClick={() => setOpen("clean")}>
        <ClipboardCheck className="h-4 w-4" /> Checklist
      </Button>,
    );
  if (s === "awaiting_inspection" && roleCan(myRole, "inspect"))
    buttons.push(
      <Button key="inspect" size={size} onClick={() => setOpen("inspect")}>
        <ShieldCheck className="h-4 w-4" /> Periksa Kamar
      </Button>,
    );
  if ((s === "pending" || s === "in_progress") && roleCan(myRole, "blockTask"))
    buttons.push(
      <Button key="block" size={size} variant="outline" onClick={() => setOpen("block")}>
        <AlertTriangle className="h-4 w-4" /> Terkendala
      </Button>,
    );
  if (s !== "completed" && s !== "cancelled" && roleCan(myRole, "assignTask"))
    buttons.push(
      <Button key="assign" size={size} variant="ghost" onClick={() => setOpen("assign")}>
        <UserPlus className="h-4 w-4" /> Tugaskan
      </Button>,
    );

  if (buttons.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {open === "clean" && <CleaningDialog task={task} open onOpenChange={(o) => !o && setOpen(null)} />}
      {open === "inspect" && <InspectionDialog task={task} open onOpenChange={(o) => !o && setOpen(null)} />}
      {open === "assign" && <AssignTaskDialog task={task} open onOpenChange={(o) => !o && setOpen(null)} />}
      {open === "block" && <BlockTaskDialog task={task} open onOpenChange={(o) => !o && setOpen(null)} />}
    </>
  );
}

export function TaskCard({ task }: { task: RoomTaskRef }) {
  const { people } = useChat();
  const overdue = task.status !== "completed" && task.status !== "cancelled" && isOverdue(task.targetAt);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <BedDouble className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">Unit {task.unitNomor}</span>
        <StatusPill label={TASK_STATUS_LABELS[task.status] ?? task.status} tone={TASK_TONE[task.status] ?? TASK_TONE.pending} />
        {overdue && <StatusPill label="Lewat target" tone="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" />}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>Petugas: {personName(people, task.assignedTo)}</span>
        <span>Umur: {formatAge(task.createdAt)}</span>
        {task.targetAt && task.status !== "completed" && <span className="col-span-2">Target: {formatDateTime(task.targetAt)}</span>}
        {task.reworkCount > 0 && <span>Dibersihkan ulang: {task.reworkCount}x</span>}
      </div>
      {task.status === "completed" && task.completionSource === "villa_app" && (
        <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Ditandai bersih di Front Desk villa — tanpa pemeriksaan FO.
        </p>
      )}
      {task.blockedReason && task.status === "blocked" && <p className="text-xs text-amber-700 dark:text-amber-300">Kendala: {task.blockedReason}</p>}
      {task.conflictNote && (
        <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">Data tidak cocok: {task.conflictNote}</p>
      )}
      <TaskActions task={task} />
    </div>
  );
}

export function IssueActions({ issue }: { issue: IssueRef }) {
  const { myRole, userId } = useChat();
  const [action, setAction] = React.useState<IssueDialogAction | null>(null);
  const open = issue.status === "open" || issue.status === "in_progress";
  if (!myRole) return null;
  const isAssignee = issue.assignedTo === userId;
  const buttons: React.ReactNode[] = [];
  if (open && (myRole === "manager" || isAssignee))
    buttons.push(
      <Button key="resolve" size="sm" onClick={() => setAction("resolve")}>
        <CheckCircle2 className="h-4 w-4" /> Selesai
      </Button>,
    );
  if (open && roleCan(myRole, "assignIssue"))
    buttons.push(
      <Button key="assign" size="sm" variant="outline" onClick={() => setAction("assign")}>
        <UserPlus className="h-4 w-4" /> Tugaskan
      </Button>,
    );
  buttons.push(
    <Button key="note" size="sm" variant="ghost" onClick={() => setAction("note")}>
      Catatan
    </Button>,
  );
  if (open && roleCan(myRole, "cancelIssue"))
    buttons.push(
      <Button key="cancel" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setAction("cancel")}>
        Batalkan
      </Button>,
    );
  return (
    <>
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {action && <IssueActionDialog issue={issue} action={action} open onOpenChange={(o) => !o && setAction(null)} />}
    </>
  );
}

export function IssueCard({ issue, attachments }: { issue: IssueRef; attachments?: ChatAttachment[] }) {
  const { people } = useChat();
  const open = issue.status === "open" || issue.status === "in_progress";
  const overdue = open && isOverdue(issue.targetAt);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {issue.severity === "critical" ? <Siren className="h-4 w-4 text-red-600" /> : <Wrench className="h-4 w-4 text-muted-foreground" />}
        <span className="font-semibold">{issue.code}</span>
        <StatusPill label={ISSUE_SEVERITY_LABELS[issue.severity as IssueSeverity] ?? issue.severity} tone={SEVERITY_TONE[issue.severity] ?? SEVERITY_TONE.low} />
        <StatusPill
          label={ISSUE_STATUS_LABELS[issue.status] ?? issue.status}
          tone={open ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"}
        />
        {overdue && <StatusPill label="Lewat target" tone="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" />}
      </div>
      <p className="font-medium">{issue.title}</p>
      <p className="whitespace-pre-wrap text-sm">{issue.description}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>{ISSUE_CATEGORY_LABELS[issue.category as IssueCategory] ?? issue.category}</span>
        <span>{issue.unitNomor ? `Unit ${issue.unitNomor}` : (issue.location ?? "")}</span>
        <span>Pelapor: {personName(people, issue.reporterId)}</span>
        <span>PJ: {issue.assignedTo ? personName(people, issue.assignedTo) : <span className="text-amber-600">belum ada</span>}</span>
        <span>Umur: {formatAge(issue.createdAt)}</span>
        {open && issue.targetAt && <span>Target: {formatDateTime(issue.targetAt)}</span>}
      </div>
      {issue.actionTaken && <p className="text-xs">Tindakan awal: {issue.actionTaken}</p>}
      {issue.status === "resolved" && issue.resolutionNotes && <p className="text-xs text-emerald-700 dark:text-emerald-300">Penyelesaian: {issue.resolutionNotes}</p>}
      {issue.status === "cancelled" && issue.cancelReason && <p className="text-xs text-muted-foreground">Dibatalkan: {issue.cancelReason}</p>}
      {attachments && attachments.length > 0 && <AttachmentStrip attachments={attachments} issueLinked />}
      <IssueActions issue={issue} />
    </div>
  );
}

export function ChecklistCard({ checklist, attachments }: { checklist: ChecklistRef; attachments: ChatAttachment[] }) {
  const { people } = useChat();
  const [expanded, setExpanded] = React.useState(false);
  const kind = checklist.kind as ChecklistKind;
  const items = CHECKLIST_ITEMS[kind] ?? [];
  const failed = items.filter((i) => checklist.items[i.key] === false);
  const ok = checklist.result === "pass" || checklist.result === "ok";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">{CHECKLIST_TITLES[kind] ?? kind}</span>
        {checklist.unitNomor && <span className="text-sm">· Unit {checklist.unitNomor}</span>}
        <StatusPill
          label={checklist.decision ? FO_DECISION_LABELS[checklist.decision as FoDecision] : ok ? "Aman" : "Ada masalah"}
          tone={ok ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {personName(people, checklist.submittedBy)} · {formatDateTime(checklist.submittedAt)} · {items.length - failed.length}/{items.length} poin baik
        {typeof checklist.details.arrival_time === "string" && checklist.details.arrival_time ? ` · tiba ${checklist.details.arrival_time}` : ""}
      </p>
      {failed.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Bermasalah: {failed.map((f) => f.label).join(", ")}</p>}
      {checklist.notes && <p className="whitespace-pre-wrap text-sm">{checklist.notes}</p>}
      {attachments.length > 0 && <AttachmentStrip attachments={attachments} />}
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} /> Detail checklist
      </button>
      {expanded && (
        <ul className="space-y-0.5 text-xs">
          {items.map((i) => (
            <li key={i.key} className={cn(checklist.items[i.key] ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
              {checklist.items[i.key] ? "✓" : "✗"} {i.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Photos; an expired (retention-deleted) file shows a placeholder, never a broken/working link. */
export function AttachmentStrip({ attachments, issueLinked = false }: { attachments: ChatAttachment[]; issueLinked?: boolean }) {
  const { myRole, isOwner } = useChat();
  const [hold, setHold] = React.useState<ChatAttachment | null>(null);
  const canHold = issueLinked && (isOwner || myRole === "manager");
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a) =>
        a.deleted || !a.url ? (
          <div key={a.id} className="flex h-16 w-16 flex-col items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground" title="File sudah dihapus otomatis setelah masa simpan 30 hari">
            <ImageOff className="h-4 w-4" />
            {a.deleted ? "kedaluwarsa" : "tidak tersedia"}
          </div>
        ) : (
          <div key={a.id} className="relative">
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="block h-16 w-16 overflow-hidden rounded-md border">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage link */}
              <img src={a.url} alt={a.evidenceSlot ?? "foto"} loading="lazy" className="h-full w-full object-cover" />
            </a>
            {a.retentionHoldUntil && Date.parse(a.retentionHoldUntil) > Date.now() ? (
              <span className="absolute -right-1 -top-1 rounded-full bg-sky-600 p-0.5 text-white" title={`Ditahan sampai ${formatDateTime(a.retentionHoldUntil)}`}>
                <Lock className="h-3 w-3" />
              </span>
            ) : (
              canHold && (
                <button
                  type="button"
                  onClick={() => setHold(a)}
                  className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 text-muted-foreground shadow"
                  title="Tahan bukti lebih dari 30 hari"
                  aria-label="Tahan bukti lebih dari 30 hari"
                >
                  <Lock className="h-3 w-3" />
                </button>
              )
            )}
          </div>
        ),
      )}
      {hold && <RetentionHoldDialog attachment={hold} onClose={() => setHold(null)} />}
    </div>
  );
}

function RetentionHoldDialog({ attachment, onClose }: { attachment: ChatAttachment; onClose: () => void }) {
  const { refresh } = useChat();
  const [until, setUntil] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tahan bukti insiden</DialogTitle>
          <DialogDescription>
            Bawaan: file dihapus 30 hari setelah diunggah ({formatDateTime(attachment.expiresAt)}). Penahanan hanya untuk bukti insiden serius, maksimal 180 hari,
            dan tercatat di audit log.
          </DialogDescription>
        </DialogHeader>
        <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Tahan sampai" />
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Alasan (mis. dibutuhkan untuk laporan polisi)" aria-label="Alasan" />
        <DialogFooter>
          <Button
            disabled={pending || !until || reason.trim().length < 10}
            onClick={async () => {
              setPending(true);
              const r = await setRetentionHoldAction({ attachmentId: attachment.id, until, reason });
              setPending(false);
              if (!r.success) return void toast.error(r.error ?? "Gagal");
              toast.success("Bukti ditahan");
              onClose();
              refresh();
            }}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Tahan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SystemLine({ body, at }: { body: string; at: string }) {
  return (
    <div className="flex justify-center py-1">
      <span className="flex max-w-[90%] items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1 text-center text-[11px] text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
        <Clock className="h-3 w-3 shrink-0" /> {body} · {formatDateTime(at)}
      </span>
    </div>
  );
}
