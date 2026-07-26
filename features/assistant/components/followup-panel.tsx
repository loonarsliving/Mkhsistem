"use client";

import { useState, useTransition } from "react";
import { Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantFollowup } from "@/repositories/assistant.repository";

import { createFollowupAction, deleteFollowupAction, toggleFollowupAction } from "../actions/assistant.actions";

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const TODAY = new Date().toISOString().slice(0, 10);

interface FollowupPanelProps {
  items: AssistantFollowup[];
}

/**
 * The assistant's personal chase list — the one part of /asisten that isn't
 * derived from data the system already holds, and the only writable thing
 * on the page.
 */
export function FollowupPanel({ items }: FollowupPanelProps) {
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (title.trim().length < 3) {
      toast.error("Judul minimal 3 karakter");
      return;
    }
    startTransition(async () => {
      const result = await createFollowupAction({ title, assignedTo, dueDate, notes });
      if (!result.success) {
        toast.error(result.error ?? "Gagal menyimpan");
        return;
      }
      setTitle("");
      setAssignedTo("");
      setDueDate("");
      setNotes("");
      toast.success("Tindak lanjut ditambahkan");
    });
  }

  function handleToggle(id: string, done: boolean) {
    startTransition(async () => {
      const result = await toggleFollowupAction(id, done);
      if (!result.success) toast.error(result.error ?? "Gagal memperbarui");
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteFollowupAction(id);
      if (!result.success) toast.error(result.error ?? "Gagal menghapus");
    });
  }

  const open = items.filter((item) => item.status !== "done");
  const done = items.filter((item) => item.status === "done");

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Yang perlu dikejar…"
          disabled={isPending}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={assignedTo}
            onChange={(event) => setAssignedTo(event.target.value)}
            placeholder="Kejar ke siapa (opsional)"
            disabled={isPending}
          />
          <Input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={isPending}
            aria-label="Tenggat"
          />
        </div>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Catatan (opsional)"
          rows={2}
          disabled={isPending}
        />
        <Button onClick={handleAdd} disabled={isPending} size="sm" className="w-full sm:w-auto">
          <Plus className="mr-1 h-4 w-4" />
          Tambah
        </Button>
      </div>

      {open.length === 0 && done.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Belum ada tindak lanjut yang dicatat.</p>
      ) : (
        <ul className="divide-y divide-border">
          {[...open, ...done].map((item) => {
            const isDone = item.status === "done";
            const overdue = !isDone && item.dueDate !== null && item.dueDate < TODAY;
            return (
              <li key={item.id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${isDone ? "text-muted-foreground line-through" : "font-medium"}`}>
                    {item.title}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {item.assignedTo && <span className="truncate">→ {item.assignedTo}</span>}
                    {item.dueDate && (
                      <Badge variant={overdue ? "destructive" : "outline"} className="h-5 px-1.5 font-normal">
                        {overdue ? "Lewat " : ""}
                        {DATE_FORMAT.format(new Date(item.dueDate))}
                      </Badge>
                    )}
                  </div>
                  {item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={isPending}
                    onClick={() => handleToggle(item.id, !isDone)}
                    aria-label={isDone ? "Buka kembali" : "Tandai selesai"}
                  >
                    {isDone ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    disabled={isPending}
                    onClick={() => handleDelete(item.id)}
                    aria-label="Hapus"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
