import Link from "next/link";

import { APP_NAME } from "@/constants/app";
import type { PermissionKey } from "@/constants/rbac";

import { SidebarNav } from "./sidebar-nav";

export function Sidebar({ permissions }: { permissions: PermissionKey[] }) {
  return (
    <aside className="relative hidden w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-60"
        style={{ background: "radial-gradient(24rem 12rem at 20% 0%, hsl(var(--primary) / 0.25), transparent 70%)" }}
      />
      <Link href="/dashboard" className="relative flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-sm font-bold text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.5)]">
          MK
        </div>
        <span className="text-sm font-semibold">{APP_NAME}</span>
      </Link>
      <SidebarNav permissions={permissions} />
    </aside>
  );
}
