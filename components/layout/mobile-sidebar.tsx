"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { PermissionKey } from "@/constants/rbac";

import { BrandMark } from "./brand-mark";
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
        <Link href="/dashboard" className="flex items-center px-5 pb-5 pt-6" onClick={() => setOpen(false)}>
          <BrandMark />
        </Link>
        <SidebarNav permissions={permissions} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
