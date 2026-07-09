import Link from "next/link";

import { APP_NAME } from "@/constants/app";
import type { PermissionKey } from "@/constants/rbac";

import { SidebarNav } from "./sidebar-nav";

export function Sidebar({ permissions }: { permissions: PermissionKey[] }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <Link href="/dashboard" className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          MK
        </div>
        <span className="text-sm font-semibold">{APP_NAME}</span>
      </Link>
      <SidebarNav permissions={permissions} />
    </aside>
  );
}
