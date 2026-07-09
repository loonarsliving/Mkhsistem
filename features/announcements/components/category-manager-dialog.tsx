"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import {
  deleteAnnouncementCategoryAction,
  listAnnouncementCategoriesAction,
  saveAnnouncementCategoryAction,
} from "../actions/announcement.actions";

export function CategoryManagerDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#2563eb");
  const [submitting, setSubmitting] = React.useState(false);
  const { data: categories, refetch } = useQuery({
    queryKey: ["announcement-categories"],
    queryFn: listAnnouncementCategoriesAction,
    enabled: open,
  });

  async function handleAdd() {
    if (name.trim().length < 2) {
      toast.error("Nama kategori minimal 2 karakter");
      return;
    }
    setSubmitting(true);
    const result = await saveAnnouncementCategoryAction({ name: name.trim(), color });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menambah kategori");
      return;
    }
    setName("");
    refetch();
    router.refresh();
  }

  async function handleDelete(id: string) {
    const result = await deleteAnnouncementCategoryAction(id);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus kategori");
      return;
    }
    refetch();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings className="h-4 w-4" /> Kelola Kategori
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kelola Kategori Pengumuman</DialogTitle>
        </DialogHeader>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Nama Kategori</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: HR, Umum, Event" />
          </div>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input"
            aria-label="Warna kategori"
          />
          <Button onClick={handleAdd} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
        <ul className="space-y-1.5">
          {categories?.map((category) => (
            <li key={category.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                {category.name}
              </span>
              <button onClick={() => handleDelete(category.id)} aria-label="Hapus kategori">
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
