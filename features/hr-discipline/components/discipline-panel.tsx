"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, ShieldAlert, UserMinus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DisciplineCandidate, DisciplineEvidence } from "@/repositories/hr-discipline.repository";

import {
  fetchDisciplineEvidenceAction,
  issueWarningAction,
  terminateEmployeeAction,
} from "../actions/hr-discipline.actions";
import { REASON_CATEGORIES, REASON_LABELS } from "../schemas/hr-discipline.schema";

interface DisciplinePanelProps {
  candidates: DisciplineCandidate[];
  canTerminate: boolean;
}

type Mode = "sp1" | "sp2" | "sp3" | "termination";

const MODE_LABEL: Record<Mode, string> = {
  sp1: "SP1 — Peringatan pertama",
  sp2: "SP2 — Peringatan kedua",
  sp3: "SP3 — Peringatan terakhir",
  termination: "Pemberhentian",
};

/**
 * Issue a warning or a termination.
 *
 * The evidence panel loads as soon as an employee is picked, before any
 * decision is typed, because "jika data mendukung" only means something if
 * the data is on screen while the choice is being made. It is the same
 * server function the RPC freezes into the letter, so what HR reads here is
 * exactly what the record will say.
 */
export function DisciplinePanel({ candidates, canTerminate }: DisciplinePanelProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [mode, setMode] = useState<Mode>("sp1");
  const [reasonCategory, setReasonCategory] = useState<(typeof REASON_CATEGORIES)[number]>("attendance");
  const [description, setDescription] = useState("");
  const [lastWorkingDate, setLastWorkingDate] = useState("");
  const [bypassJustification, setBypassJustification] = useState("");
  const [evidence, setEvidence] = useState<DisciplineEvidence | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!employeeId) {
      setEvidence(null);
      return;
    }
    let cancelled = false;
    setLoadingEvidence(true);
    fetchDisciplineEvidenceAction(employeeId)
      .then((result) => {
        if (cancelled) return;
        if (result.success) setEvidence(result.data ?? null);
        else toast.error(result.error ?? "Gagal memuat data pendukung");
      })
      .finally(() => {
        if (!cancelled) setLoadingEvidence(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const isTermination = mode === "termination";
  const noActiveWarning = evidence !== null && evidence.active_warnings === 0;
  const needsJustification = isTermination && noActiveWarning;

  function reset() {
    setDescription("");
    setLastWorkingDate("");
    setBypassJustification("");
    setEmployeeId("");
    setEvidence(null);
  }

  function handleSubmit() {
    if (!employeeId) {
      toast.error("Pilih karyawan lebih dulu");
      return;
    }
    if (description.trim().length < 10) {
      toast.error("Uraian minimal 10 karakter");
      return;
    }
    if (needsJustification && bypassJustification.trim().length < 20) {
      toast.error("Justifikasi pemberhentian tanpa SP minimal 20 karakter");
      return;
    }

    startTransition(async () => {
      const result = isTermination
        ? await terminateEmployeeAction({
            employeeId,
            reasonCategory,
            description,
            lastWorkingDate,
            bypassJustification,
          })
        : await issueWarningAction({ employeeId, actionType: mode, reasonCategory, description });

      if (!result.success) {
        toast.error(result.error ?? "Gagal menyimpan");
        return;
      }
      toast.success(isTermination ? "Pemberhentian tercatat" : `${mode.toUpperCase()} diterbitkan`);
      reset();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4" />
          Terbitkan surat peringatan / pemberhentian
        </CardTitle>
        <CardDescription>
          Data pendukung muncul otomatis setelah karyawan dipilih, dan ikut tersimpan di surat.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Karyawan</Label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={isPending}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih karyawan" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.fullName} — {person.branchName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Jenis tindakan</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as Mode)} disabled={isPending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sp1">{MODE_LABEL.sp1}</SelectItem>
                <SelectItem value="sp2">{MODE_LABEL.sp2}</SelectItem>
                <SelectItem value="sp3">{MODE_LABEL.sp3}</SelectItem>
                {canTerminate && <SelectItem value="termination">{MODE_LABEL.termination}</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* The evidence. Shown before the decision, not after. */}
        {employeeId && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            {loadingEvidence ? (
              <p className="text-sm text-muted-foreground">Memuat data pendukung…</p>
            ) : evidence ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Data pendukung</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant={evidence.alpha_30d > 0 ? "destructive" : "outline"} className="tabular-nums">
                    Alpha 30 hari: {evidence.alpha_30d}
                  </Badge>
                  <Badge variant="outline" className="tabular-nums">Telat 30 hari: {evidence.late_30d}</Badge>
                  <Badge variant={evidence.alpha_90d > 0 ? "destructive" : "outline"} className="tabular-nums">
                    Alpha 90 hari: {evidence.alpha_90d}
                  </Badge>
                  <Badge variant="outline" className="tabular-nums">Telat 90 hari: {evidence.late_90d}</Badge>
                  <Badge variant={evidence.active_warnings > 0 ? "default" : "outline"} className="tabular-nums">
                    SP aktif: {evidence.active_warnings}
                    {evidence.last_warning ? ` (terakhir ${evidence.last_warning.toUpperCase()})` : ""}
                  </Badge>
                </div>
                {needsJustification && (
                  <p className="flex items-start gap-2 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Karyawan ini belum pernah menerima SP aktif. Pemberhentian tetap bisa dilakukan, tapi wajib disertai
                    justifikasi tertulis dan akan tercatat sebagai pemberhentian tanpa tahapan SP.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Kategori alasan</Label>
            <Select
              value={reasonCategory}
              onValueChange={(value) => setReasonCategory(value as (typeof REASON_CATEGORIES)[number])}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {REASON_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isTermination && (
            <div className="space-y-1.5">
              <Label>Hari kerja terakhir</Label>
              <Input
                type="date"
                value={lastWorkingDate}
                onChange={(event) => setLastWorkingDate(event.target.value)}
                disabled={isPending}
              />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Uraian</Label>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Jelaskan pelanggaran dan kronologinya…"
            rows={3}
            disabled={isPending}
          />
        </div>

        {needsJustification && (
          <div className="space-y-1.5">
            <Label className="text-destructive">Justifikasi pemberhentian tanpa SP (wajib, min. 20 karakter)</Label>
            <Textarea
              value={bypassJustification}
              onChange={(event) => setBypassJustification(event.target.value)}
              placeholder="Alasan mengapa pemberhentian dilakukan tanpa melalui tahapan SP…"
              rows={3}
              disabled={isPending}
            />
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={isPending || !employeeId}
          variant={isTermination ? "destructive" : "default"}
        >
          {isTermination ? <UserMinus className="mr-1 h-4 w-4" /> : <ShieldAlert className="mr-1 h-4 w-4" />}
          {isTermination ? "Berhentikan karyawan" : `Terbitkan ${mode.toUpperCase()}`}
        </Button>
      </CardContent>
    </Card>
  );
}
