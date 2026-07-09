"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Megaphone, Search, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { getInitials } from "@/lib/utils";

import { globalSearchAction } from "../actions/search.actions";
import type { GlobalSearchResults } from "@/repositories/search.repository";

const EMPTY: GlobalSearchResults = { memos: [], announcements: [], employees: [] };

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<GlobalSearchResults>(EMPTY);
  const [loading, setLoading] = React.useState(false);
  const debouncedQuery = useDebounce(query, 300);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  React.useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    setLoading(true);
    globalSearchAction(debouncedQuery)
      .then(setResults)
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  function navigate(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const hasResults = results.memos.length + results.announcements.length + results.employees.length > 0;

  return (
    <>
      <Button
        variant="outline"
        className="w-full max-w-sm justify-start gap-2 text-muted-foreground sm:w-64"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Cari memo, pengumuman, karyawan...</span>
        <span className="sm:hidden">Cari...</span>
        <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 text-xs sm:inline">⌘K</kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-24 max-w-xl translate-y-0 p-0">
          <DialogTitle className="sr-only">Pencarian Global</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ketik untuk mencari..."
              className="border-0 shadow-none focus-visible:ring-0"
            />
            {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {query.trim().length < 2 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Ketik minimal 2 karakter</p>
            )}
            {query.trim().length >= 2 && !loading && !hasResults && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Tidak ada hasil ditemukan</p>
            )}
            {results.employees.length > 0 && (
              <SearchGroup label="Karyawan">
                {results.employees.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => navigate(`/employees/${e.id}`)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {getInitials(e.full_name)}
                    </span>
                    {e.full_name}
                    <span className="ml-auto text-xs text-muted-foreground">{e.employee_code}</span>
                  </button>
                ))}
              </SearchGroup>
            )}
            {results.memos.length > 0 && (
              <SearchGroup label="Memo">
                {results.memos.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => navigate(`/memo/${m.id}`)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" /> {m.title}
                  </button>
                ))}
              </SearchGroup>
            )}
            {results.announcements.length > 0 && (
              <SearchGroup label="Pengumuman">
                {results.announcements.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/announcements/${a.id}`)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <Megaphone className="h-4 w-4 text-muted-foreground" /> {a.title}
                  </button>
                ))}
              </SearchGroup>
            )}
          </div>
          {query.trim().length >= 2 && (
            <Link
              href={`/search?q=${encodeURIComponent(query)}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-2 border-t border-border py-2.5 text-sm text-primary hover:underline"
            >
              <User className="h-3.5 w-3.5" /> Lihat semua hasil untuk &ldquo;{query}&rdquo;
            </Link>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SearchGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
