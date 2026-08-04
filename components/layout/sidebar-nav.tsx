"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_GROUPS } from "@/constants/nav";
import type { PermissionKey } from "@/constants/rbac";
import { cn } from "@/lib/utils";

export function SidebarNav({ permissions, onNavigate }: { permissions: PermissionKey[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="relative flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => {
          if (!item.permission) return true;
          const required = Array.isArray(item.permission) ? item.permission : [item.permission];
          return required.some((key) => permissions.includes(key));
        });
        if (items.length === 0) return null;

        return (
          <div key={group.label} className="space-y-1">
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {group.label}
            </p>
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
        );
      })}
    </nav>
  );
}
