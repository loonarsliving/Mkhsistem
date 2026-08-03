import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { GlobalSearch } from "@/features/search/components/global-search";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import type { CurrentSession } from "@/types/domain";

export function Topnav({ session }: { session: CurrentSession }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <MobileSidebar permissions={session.permissions} />
      <div className="hidden lg:block">
        <Breadcrumb />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <GlobalSearch permissions={session.permissions} />
        <NotificationBell userId={session.userId} />
        <ThemeToggle />
        <UserMenu session={session} />
      </div>
    </header>
  );
}
