import { Building2, Network, ShieldCheck } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import type { EmployeeDirectoryRow } from "@/types/domain";

/**
 * Kartu sambutan di atas Dashboard -- banner hijau hutan ala loonars.id
 * (lingkaran tipis, cahaya terakota, tanggal WIB berhuruf serif). Isi
 * datanya sama dengan kartu profil sebelumnya.
 */
export function ProfileSummaryCard({ employee }: { employee: EmployeeDirectoryRow }) {
  const tanggal = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <section className="anim-rise relative isolate overflow-hidden rounded-3xl bg-[hsl(134_18%_15%)] text-[hsl(39_40%_94%)] shadow-[0_30px_60px_-34px_hsl(134_30%_10%/0.8)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(30rem 16rem at 100% 0%, hsl(22 48% 48% / 0.35), transparent 70%), radial-gradient(24rem 14rem at 0% 100%, hsl(118 22% 45% / 0.25), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full border border-white/10 shadow-[0_0_0_36px_hsl(0_0%_100%/0.03),0_0_0_72px_hsl(0_0%_100%/0.02)] [animation:mkc-float_9s_ease-in-out_infinite]"
      />
      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-7">
        <Avatar className="h-16 w-16 ring-2 ring-[hsl(36_45%_75%/0.6)] ring-offset-2 ring-offset-[hsl(134_18%_15%)] transition-transform duration-500 hover:scale-105">
          <AvatarImage src={employee.avatar_url ?? undefined} alt={employee.full_name} />
          <AvatarFallback className="text-lg">{getInitials(employee.full_name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <p className="text-[0.66rem] uppercase tracking-[0.24em] text-[hsl(36_45%_75%)]">{tanggal}</p>
          <p className="font-display text-[1.9rem] leading-tight">{employee.full_name}</p>
          <p className="text-sm text-[hsl(39_40%_94%/0.7)]">
            {employee.employee_code} · {employee.role_name}
          </p>
          <div className="flex flex-wrap gap-2 pt-2 text-xs text-[hsl(39_40%_94%/0.85)] [&>span]:rounded-full [&>span]:border [&>span]:border-white/15 [&>span]:bg-white/5 [&>span]:px-3 [&>span]:py-1 [&>span]:backdrop-blur">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> {employee.branch_name}
            </span>
            {employee.division_name && (
              <span className="flex items-center gap-1.5">
                <Network className="h-3.5 w-3.5" /> {employee.division_name}
              </span>
            )}
            {employee.position_name && (
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> {employee.position_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
