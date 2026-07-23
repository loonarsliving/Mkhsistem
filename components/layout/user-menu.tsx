"use client";

import Link from "next/link";
import { KeyRound, LogOut, Settings, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/features/auth/actions/auth.actions";
import { unsubscribeFromWebPush } from "@/lib/push/web-push";
import { getInitials } from "@/lib/utils";
import type { CurrentSession } from "@/types/domain";

export function UserMenu({ session }: { session: CurrentSession }) {
  const { employee } = session;

  async function handleLogout() {
    // Best-effort: a shared/lost device shouldn't keep receiving this
    // user's pushes after they sign out. Never block logout on this.
    await unsubscribeFromWebPush().catch(() => {});
    await logoutAction();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu akun untuk ${employee.full_name}`}
        className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar>
          <AvatarImage src={employee.avatar_url ?? undefined} alt={employee.full_name} />
          <AvatarFallback>{getInitials(employee.full_name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold text-foreground">{employee.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">{employee.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {employee.role_name} · {employee.branch_name}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <User className="h-4 w-4" /> Profil Saya
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profile?tab=password">
            <KeyRound className="h-4 w-4" /> Ganti Password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="h-4 w-4" /> Pengaturan
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handleLogout()} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
