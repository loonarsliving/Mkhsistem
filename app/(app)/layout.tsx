import { Sidebar } from "@/components/layout/sidebar";
import { Topnav } from "@/components/layout/topnav";
import { PushRegistration } from "@/components/shared/push-registration";
import { requireSession } from "@/lib/rbac/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen">
      <PushRegistration />
      <Sidebar permissions={session.permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topnav session={session} />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
