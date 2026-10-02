"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Send, TicketPercent, Wallet } from "lucide-react";
import { toast } from "sonner";

import { StatTile } from "@/components/shared/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { VillaReferralCode } from "@/lib/villa/referral";

import {
  createVillaReferralAction,
  sendVillaReferralWaAction,
  setVillaReferralActiveAction,
} from "../actions/villa-referral.actions";

function formatRp(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export function ReferralBoard({
  codes,
  employees,
  loadError,
}: {
  codes: VillaReferralCode[];
  employees: { id: string; name: string; branch: string | null }[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [employeeId, setEmployeeId] = React.useState("");
  const [kode, setKode] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const totals = React.useMemo(
    () =>
      codes.reduce(
        (t, c) => ({
          aktif: t.aktif + (c.aktif ? 1 : 0),
          dipakai: t.dipakai + c.jumlah_dipakai,
          feeSah: t.feeSah + Number(c.fee_sah),
          feeMenunggu: t.feeMenunggu + Number(c.fee_menunggu),
        }),
        { aktif: 0, dipakai: 0, feeSah: 0, feeMenunggu: 0 },
      ),
    [codes],
  );

  async function handleCreate() {
    if (!employeeId) {
      toast.error("Pilih karyawan dulu");
      return;
    }
    setSaving(true);
    const result = await createVillaReferralAction({ employeeId, kode, kirimWa: true });
    setSaving(false);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "Gagal membuat kode");
      return;
    }
    toast.success(`Kode ${result.data.kode} dibuat. ${result.data.waNote ?? ""}`);
    setOpen(false);
    setEmployeeId("");
    setKode("");
    router.refresh();
  }

  async function handleSend(c: VillaReferralCode) {
    if (!c.employee_id) {
      toast.error("Kode ini tidak terhubung ke data karyawan");
      return;
    }
    setBusyId(c.id);
    const result = await sendVillaReferralWaAction({
      employeeId: c.employee_id,
      kode: c.kode,
      diskonPersen: Number(c.diskon_persen),
    });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim WA");
      return;
    }
    toast.success(`Kode ${c.kode} dikirim ke WA ${result.data?.name ?? "karyawan"}`);
  }

  async function handleToggle(c: VillaReferralCode) {
    if (c.aktif && !confirm(`Nonaktifkan kode ${c.kode}? Tamu tidak bisa memakainya lagi.`)) return;
    setBusyId(c.id);
    const result = await setVillaReferralActiveAction({ id: c.id, aktif: !c.aktif });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengubah status");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Gagal memuat kode referral: {loadError}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={TicketPercent} label="Kode aktif" value={String(totals.aktif)} />
        <StatTile icon={Send} label="Booking via referral" value={String(totals.dipakai)} />
        <StatTile
          icon={Wallet}
          label="Fee sah (tamu lunas)"
          value={formatRp(totals.feeSah)}
          tone="success"
        />
        <StatTile
          icon={Wallet}
          label="Fee menunggu tamu lunas"
          value={formatRp(totals.feeMenunggu)}
          tone="warning"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Daftar kode</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> Tambah kode
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah kode referral</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Karyawan</label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih karyawan" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                          {e.branch ? ` — ${e.branch}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Kode (opsional)</label>
                  <Input
                    value={kode}
                    onChange={(e) => setKode(e.target.value.toUpperCase())}
                    placeholder="Kosongkan untuk dibuat otomatis, mis. REF-BUDI27"
                  />
                  <p className="text-xs text-muted-foreground">
                    Selalu diawali REF-. Diskon tamu 10%, fee karyawan sebesar diskon.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Kode langsung dikirim ke WA karyawan setelah dibuat.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                  Batal
                </Button>
                <Button onClick={handleCreate} disabled={saving || !employeeId}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Buat & kirim WA
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          {codes.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Belum ada kode. Tekan &quot;Tambah kode&quot;, atau kirim WA{" "}
              <span className="font-mono">REFERAL nama-karyawan</span> ke nomor sistem.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Dipakai</TableHead>
                    <TableHead className="text-right">Fee sah</TableHead>
                    <TableHead className="text-right">Menunggu lunas</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-semibold">{c.kode}</TableCell>
                      <TableCell>{c.employee_nama}</TableCell>
                      <TableCell>
                        <Badge variant={c.aktif ? "success" : "secondary"}>
                          {c.aktif ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.jumlah_dipakai}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRp(Number(c.fee_sah))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatRp(Number(c.fee_menunggu))}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-2"
                          disabled={busyId === c.id || !c.aktif}
                          onClick={() => handleSend(c)}
                        >
                          <Send className="mr-1 h-3.5 w-3.5" /> Kirim WA
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === c.id}
                          onClick={() => handleToggle(c)}
                        >
                          {c.aktif ? "Nonaktifkan" : "Aktifkan"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
