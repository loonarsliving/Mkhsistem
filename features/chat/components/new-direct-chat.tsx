"use client";

import * as React from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { ChatContact } from "@/repositories/chat.repository";

import { loadDirectContactsAction, openDirectChatAction } from "../actions/chat.actions";
import { avatarColor, initials } from "./chat-utils";

/**
 * Contact picker for a direct chat (0300), shown in place of the
 * conversation list like WhatsApp's "new chat". Who appears here (Jogja +
 * Loonars Private Living + owners) is decided by the database, not the UI.
 */
export function NewDirectChat({ onBack, onOpened }: { onBack: () => void; onOpened: (conversationId: string) => void }) {
  const [contacts, setContacts] = React.useState<ChatContact[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [term, setTerm] = React.useState("");
  const [opening, setOpening] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    loadDirectContactsAction()
      .then((r) => {
        if (!alive) return;
        if (r.success) setContacts(r.data ?? []);
        else setError(r.error ?? "Gagal memuat kontak");
      })
      .catch(() => alive && setError("Gagal memuat kontak. Periksa koneksi lalu coba lagi."));
    return () => {
      alive = false;
    };
  }, []);

  const needle = term.trim().toLowerCase();
  const shown = (contacts ?? []).filter(
    (c) => !needle || c.name.toLowerCase().includes(needle) || (c.position ?? "").toLowerCase().includes(needle) || (c.branch ?? "").toLowerCase().includes(needle),
  );

  async function open(contact: ChatContact) {
    if (opening) return;
    if (contact.conversationId) return onOpened(contact.conversationId);
    setOpening(contact.id);
    const r = await openDirectChatAction({ employeeId: contact.id }).catch(() => null);
    setOpening(null);
    if (!r?.success || !r.data) return void toast.error(r?.error ?? "Gagal membuka chat. Periksa koneksi lalu coba lagi.");
    onOpened(r.data.id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-2">
        <button type="button" onClick={onBack} className="rounded-full p-1.5 hover:bg-muted" aria-label="Kembali ke daftar chat">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">Chat baru</p>
          <p className="text-xs text-muted-foreground">{contacts ? `${contacts.length} kontak` : "Memuat kontak…"}</p>
        </div>
      </div>
      <div className="border-b px-3 py-2">
        <div className="flex items-center gap-2 rounded-full bg-muted px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cari nama atau jabatan"
            className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            aria-label="Cari kontak"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {error ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{error}</p>
        ) : !contacts ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat kontak…
          </div>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{needle ? "Tidak ada kontak yang cocok." : "Belum ada kontak."}</p>
        ) : (
          shown.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void open(c)}
              disabled={!!opening}
              className="flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
            >
              <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white", avatarColor(c.name))}>
                {initials(c.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">{[c.position, c.branch].filter(Boolean).join(" · ") || "Karyawan"}</p>
              </div>
              {opening === c.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
