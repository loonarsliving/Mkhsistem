"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { NAV_GROUPS } from "@/constants/nav";
import type { PermissionKey } from "@/constants/rbac";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mkc:sidebar-expanded-groups";

function isGroupActive(group: (typeof NAV_GROUPS)[number], pathname: string) {
  return group.items.some((item) => !item.external && (pathname === item.href || pathname.startsWith(`${item.href}/`)));
}

export function SidebarNav({ permissions, onNavigate }: { permissions: PermissionKey[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeGroupLabel = React.useMemo(
    () => NAV_GROUPS.find((group) => isGroupActive(group, pathname))?.label,
    [pathname],
  );

  // Smart collapsing: only the group containing the current page is expanded
  // by default. Manual toggles persist across sessions (localStorage), but
  // whichever group holds the active route always stays force-expanded so
  // navigating (e.g. via search or a deep link) never hides the page you're
  // actually on inside a collapsed section.
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(activeGroupLabel ? [activeGroupLabel] : []),
  );

  React.useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
      setExpanded((prev) => new Set([...prev, ...stored]));
    } catch {
      // corrupt/legacy value -- ignore and keep the smart default
    }
  }, []);

  React.useEffect(() => {
    if (!activeGroupLabel) return;
    setExpanded((prev) => (prev.has(activeGroupLabel) ? prev : new Set(prev).add(activeGroupLabel)));
  }, [activeGroupLabel]);

  function toggleGroup(label: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <nav className="relative flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => {
          if (!item.permission) return true;
          const required = Array.isArray(item.permission) ? item.permission : [item.permission];
          return required.some((key) => permissions.includes(key));
        });
        if (items.length === 0) return null;

        const isExpanded = expanded.has(group.label);

        return (
          <div key={group.label} className="pb-1">
            <button
              type="button"
              onClick={() => toggleGroup(group.label)}
              aria-expanded={isExpanded}
              className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/80"
            >
              {group.label}
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isExpanded && "rotate-180")}
              />
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-200 ease-out"
              style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div className="space-y-1 pt-1">
                  {items.map((item) => {
                    const active = !item.external && (pathname === item.href || pathname.startsWith(`${item.href}/`));
                    const Icon = item.icon;
                    const linkClassName = cn(
                      "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-all duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      active &&
                        "bg-gradient-to-r from-primary/25 to-transparent text-sidebar-foreground before:absolute before:-left-1 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary before:shadow-[0_0_8px_hsl(var(--primary)/0.8)] [&_svg]:text-primary [&_svg]:drop-shadow-[0_0_4px_hsl(var(--primary)/0.6)]",
                    );
                    if (item.external) {
                      return (
                        <a
                          key={item.href}
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={onNavigate}
                          className={linkClassName}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {item.label}
                        </a>
                      );
                    }
                    return (
                      <Link key={item.href} href={item.href} onClick={onNavigate} className={linkClassName}>
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
