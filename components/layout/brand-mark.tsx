import { APP_NAME } from "@/constants/app";
import { cn } from "@/lib/utils";

/** Logo daun + nama aplikasi, gaya loonars.id. Dipakai di sidebar desktop & HP. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("group flex items-center gap-3", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-foreground/25 text-[hsl(36_45%_75%)] transition-transform duration-500 group-hover:rotate-[14deg]">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <path d="M12 3c-3.5 3.6-3.5 8.4 0 12 3.5-3.6 3.5-8.4 0-12Z" />
          <path d="M12 15v6M6 9.5c1 4 3.2 5.6 6 5.5M18 9.5c-1 4-3.2 5.6-6 5.5" strokeLinecap="round" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.35rem] tracking-[0.08em]">{APP_NAME}</span>
        <span className="mt-1 whitespace-nowrap text-[0.56rem] uppercase tracking-[0.2em] text-sidebar-foreground/55">Maha Karya Haluoleo</span>
      </span>
    </span>
  );
}
