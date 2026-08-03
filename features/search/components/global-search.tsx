"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Megaphone, Search, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NAV_GROUPS } from "@/constants/nav";
import type { PermissionKey } from "@/constants/rbac";
import { useDebounce } from "@/hooks/use-debounce";
import { getInitials } from "@/lib/utils";

import { globalSearchAction } from "../actions/search.actions";
import type { GlobalSearchResults } from "@/repositories/search.repository";

const EMPTY: GlobalSearchResults = { memos: [], announcements: [], employees: [] };

/** Every nav item across every group, flattened once at module scope -- static data, no need to recompute per render. */
const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

/** ⌘K command palette: jump to any page you have permission for, or search live data (karyawan/memo/pengumuman). Built on shadcn's Command (cmdk) instead of a hand-rolled list so arrow-key navigation and selection come for free. */
export function GlobalSearch({ permissions }: { permissions: PermissionKey[] }) {
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

  const navMatches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return [];
    return ALL_NAV_ITEMS.filter((item) => {
      if (!item.label.toLowerCase().includes(needle)) return false;
      if (!item.permission) return true;
      const required = Array.isArray(item.permission) ? item.permission : [item.permission];
      return required.some((key) => permissions.includes(key));
    }).slice(0, 6);
  }, [query, permissions]);

  const hasDataResults =
    results.memos.length + results.announcements.length + results.employees.length > 0;
  const hasAnyResults = hasDataResults || navMatches.length > 0;

  return (
    <>
      <Button
        variant="outline"
        className="w-full max-w-sm justify-start gap-2 text-muted-foreground sm:w-64"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Cari atau lompat ke halaman...</span>
        <span className="sm:hidden">Cari...</span>
        <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 text-xs sm:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Ketik nama halaman, memo, karyawan..."
          loading={loading}
        />
        <CommandList>
          {query.trim().length < 2 && <CommandEmpty>Ketik minimal 2 karakter</CommandEmpty>}
          {query.trim().length >= 2 && !loading && !hasAnyResults && (
            <CommandEmpty>Tidak ada hasil ditemukan</CommandEmpty>
          )}

          {navMatches.length > 0 && (
            <CommandGroup heading="Halaman">
              {navMatches.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={`nav-${item.href}`}
                    onSelect={() => navigate(item.href)}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {item.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {results.employees.length > 0 && (
            <CommandGroup heading="Karyawan">
              {results.employees.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`emp-${e.id}`}
                  onSelect={() => navigate(`/employees/${e.id}`)}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {getInitials(e.full_name)}
                  </span>
                  {e.full_name}
                  <span className="ml-auto text-xs text-muted-foreground">{e.employee_code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.memos.length > 0 && (
            <CommandGroup heading="Memo">
              {results.memos.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`memo-${m.id}`}
                  onSelect={() => navigate(`/memo/${m.id}`)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" /> {m.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.announcements.length > 0 && (
            <CommandGroup heading="Pengumuman">
              {results.announcements.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`ann-${a.id}`}
                  onSelect={() => navigate(`/announcements/${a.id}`)}
                >
                  <Megaphone className="h-4 w-4 text-muted-foreground" /> {a.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        {query.trim().length >= 2 && (
          <Link
            href={`/search?q=${encodeURIComponent(query)}`}
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 border-t border-border py-2.5 text-sm text-primary hover:underline"
          >
            <User className="h-3.5 w-3.5" /> Lihat semua hasil untuk &ldquo;{query}&rdquo;
          </Link>
        )}
      </CommandDialog>
    </>
  );
}
