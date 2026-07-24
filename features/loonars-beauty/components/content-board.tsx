"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";

import { sendContentItemToKontenAiAction } from "../actions/kontenai-bridge.actions";
import {
  createContentItemAction,
  deleteContentItemAction,
  listContentItemsAction,
  updateContentItemStatusAction,
} from "../actions/loonars-beauty.actions";
import { CONTENT_CATEGORIES, CONTENT_PLATFORMS, CONTENT_STATUSES, type CreateContentItemInput } from "../schemas/loonars-beauty.schema";

const CATEGORY_LABEL: Record<string, string> = {
  problem_solution: "Problem-Solution",
  ugc: "Testimoni/UGC",
  edukasi: "Edukasi",
  promosi: "Promosi",
};

const STATUS_LABEL: Record<string, string> = {
  idea: "Ide",
  draft: "Draft",
  scheduled: "Terjadwal",
  published: "Published",
  archived: "Arsip",
};

const STATUS_VARIANT: Record<string, "secondary" | "default" | "success" | "outline"> = {
  idea: "outline",
  draft: "secondary",
  scheduled: "secondary",
  published: "success",
  archived: "outline",
};

export function ContentBoard({ canManage, isSuperAdmin = false }: { canManage: boolean; isSuperAdmin?: boolean }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [statusTarget, setStatusTarget] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [form, setForm] = React.useState<CreateContentItemInput>({
    category: "problem_solution",
    platform: "tiktok",
    title: "",
    hook: "",
    caption: "",
    scriptNotes: "",
    cta: "",
  });
  const [statusValue, setStatusValue] = React.useState<string>("draft");
  const [statusUrl, setStatusUrl] = React.useState("");

  const { data, isLoading } = useQuery({ queryKey: ["loonars-content-items"], queryFn: () => listContentItemsAction() });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["loonars-content-items"] });
    queryClient.invalidateQueries({ queryKey: ["loonars-beauty-ratio-summary"] });
    queryClient.invalidateQueries({ queryKey: ["loonars-beauty-retargeting"] });
  }

  const sendToKontenAiMutation = useMutation({
    mutationFn: async (contentItemId: string) => {
      const result = await sendContentItemToKontenAiAction(contentItemId);
      if (!result.success) throw new Error(result.error ?? "Gagal mengirim ke KontenAI");
      return result.data!;
    },
    onSuccess: ({ renderQueued, pendingVideoGenerationCount }) => {
      if (renderQueued) {
        toast.success("Terkirim ke KontenAI -- storyboard lengkap, render otomatis sudah diantrikan");
      } else if (pendingVideoGenerationCount > 0) {
        toast.success(`Terkirim ke KontenAI -- ${pendingVideoGenerationCount} scene menunggu video AI (Veo), render akan otomatis lanjut setelah selesai`);
      } else {
        toast.success("Terkirim ke KontenAI");
      }
      invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal mengirim ke KontenAI");
    },
  });

  async function handleCreate() {
    setSubmitting(true);
    const result = await createContentItemAction(form);
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan konten");
      return;
    }
    toast.success("Konten ditambahkan");
    setForm({ category: "problem_solution", platform: "tiktok", title: "", hook: "", caption: "", scriptNotes: "", cta: "" });
    setAddOpen(false);
    invalidate();
  }

  async function handleUpdateStatus() {
    if (!statusTarget) return;
    setSubmitting(true);
    const result = await updateContentItemStatusAction({
      id: statusTarget,
      status: statusValue as (typeof CONTENT_STATUSES)[number],
      contentUrl: statusUrl,
    });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengubah status");
      return;
    }
    toast.success("Status konten diperbarui");
    setStatusTarget(null);
    setStatusUrl("");
    invalidate();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSubmitting(true);
    const result = await deleteContentItemAction(deleteTarget);
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus konten");
      return;
    }
    toast.success("Konten dihapus");
    setDeleteTarget(null);
    invalidate();
  }

  const items = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Rencana Konten</p>
        {canManage && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" /> Tambah Konten
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tambah Konten Baru</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as CreateContentItemInput["category"] }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTENT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v as CreateContentItemInput["platform"] }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTENT_PLATFORMS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p === "tiktok" ? "TikTok" : "Instagram"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input placeholder="Judul konten" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                <Input placeholder="Hook pembuka" value={form.hook} onChange={(e) => setForm((f) => ({ ...f, hook: e.target.value }))} />
                <Textarea placeholder="Caption" value={form.caption} onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))} rows={2} />
                <Textarea
                  placeholder="Catatan naskah/format visual"
                  value={form.scriptNotes}
                  onChange={(e) => setForm((f) => ({ ...f, scriptNotes: e.target.value }))}
                  rows={2}
                />
                <Input placeholder="CTA" value={form.cta} onChange={(e) => setForm((f) => ({ ...f, cta: e.target.value }))} />
              </div>
              <DialogFooter>
                <Button disabled={submitting || !form.title.trim()} onClick={handleCreate}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Simpan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!isLoading && items.length === 0 && (
        <EmptyState icon={Plus} title="Belum ada konten" description="Tambahkan rencana konten pertama sesuai kategori strategi." />
      )}

      {items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">{item.title}</p>
                  <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>{STATUS_LABEL[item.status] ?? item.status}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{CATEGORY_LABEL[item.category] ?? item.category}</Badge>
                  <Badge variant="outline">{item.platform === "tiktok" ? "TikTok" : "Instagram"}</Badge>
                </div>
                {item.hook && <p className="text-xs text-muted-foreground">Hook: {item.hook}</p>}
                {item.content_url && (
                  <a href={item.content_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    Lihat konten <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {item.kontenai_creative_brief_id && (
                  <a href="/kontenai/ai-director" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Sparkles className="h-3 w-3" /> Terkirim ke KontenAI
                  </a>
                )}
                {canManage && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setStatusTarget(item.id);
                        setStatusValue(item.status);
                        setStatusUrl(item.content_url ?? "");
                      }}
                    >
                      Ubah Status
                    </Button>
                    {isSuperAdmin && !item.kontenai_creative_brief_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={sendToKontenAiMutation.isPending}
                        onClick={() => sendToKontenAiMutation.mutate(item.id)}
                      >
                        {sendToKontenAiMutation.isPending && sendToKontenAiMutation.variables === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        Kirim ke KontenAI
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteTarget(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={statusTarget !== null} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah Status Konten</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={statusValue} onValueChange={setStatusValue}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Link konten (TikTok/Instagram, opsional)" value={statusUrl} onChange={(e) => setStatusUrl(e.target.value)} />
          </div>
          <DialogFooter>
            <Button disabled={submitting} onClick={handleUpdateStatus}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Hapus konten ini?"
        confirmLabel="Hapus"
        destructive
        loading={submitting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
