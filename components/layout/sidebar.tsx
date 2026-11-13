import Link from "next/link";

import type { PermissionKey } from "@/constants/rbac";

import { BrandMark } from "./brand-mark";
import { SidebarNav } from "./sidebar-nav";

export function Sidebar({ permissions }: { permissions: PermissionKey[] }) {
  return (
    <aside className="relative hidden w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      {/* Cahaya hangat lembut di pojok atas + lingkaran tipis ala loonars.id */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-70"
        style={{ background: "radial-gradient(22rem 12rem at 15% 0%, hsl(var(--terra) / 0.22), transparent 70%)" }}
      />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full border border-sidebar-foreground/5 shadow-[0_0_0_40px_hsl(var(--sidebar-foreground)/0.02),0_0_0_80px_hsl(var(--sidebar-foreground)/0.015)]" />
      <Link href="/dashboard" className="relative flex items-center px-5 pb-5 pt-6">
        <BrandMark />
      </Link>
      <div className="relative mx-5 mb-1 h-px bg-gradient-to-r from-sidebar-foreground/15 via-sidebar-foreground/10 to-transparent" />
      <SidebarNav permissions={permissions} />
    </aside>
  );
}
