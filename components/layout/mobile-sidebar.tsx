"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { APP_NAME } from "@/constants/app";
import type { PermissionKey } from "@/constants/rbac";

import { SidebarNav } from "./sidebar-nav";

export function MobileSidebar({ permissions }: { permissions: PermissionKey[] }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex flex-col bg-sidebar p-0 text-sidebar-foreground">
        <Link href="/dashboard" className="flex items-center gap-2 px-5 py-5" onClick={() => setOpen(false)}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            MK
          </div>
          <span className="text-sm font-semibold">{APP_NAME}</span>
        </Link>
        <SidebarNav permissions={permissions} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
