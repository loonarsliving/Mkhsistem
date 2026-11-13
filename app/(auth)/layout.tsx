import { APP_NAME, APP_TAGLINE, COMPANY_NAME } from "@/constants/app";

// Next.js can only embed a correct per-request CSP nonce into dynamically
// rendered pages — a statically prerendered page's <script> tags are fixed
// at build time and would carry a stale nonce, breaking hydration under the
// strict-dynamic script-src set in lib/security/csp.ts.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8 stagger">
          <div className="space-y-2 text-center lg:text-left">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-primary/25 bg-card text-primary shadow-[0_14px_30px_-18px_hsl(var(--primary)/0.8)] lg:mx-0">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <path d="M12 3c-3.5 3.6-3.5 8.4 0 12 3.5-3.6 3.5-8.4 0-12Z" />
                <path d="M12 15v6M6 9.5c1 4 3.2 5.6 6 5.5M18 9.5c-1 4-3.2 5.6-6 5.5" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="font-display text-4xl tracking-[0.04em]">{APP_NAME}</h1>
            <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
          </div>
          {children}
        </div>
      </div>
      {/* Panel kanan: hijau hutan ala loonars.id -- lengkung arsitektur,
          cahaya terakota, dan lencana teks berputar. Murni hiasan. */}
      <div className="relative hidden overflow-hidden bg-[hsl(134_18%_15%)] lg:block">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(40rem 26rem at 90% 0%, hsl(22 48% 48% / 0.32), transparent 70%), radial-gradient(34rem 22rem at 0% 100%, hsl(118 22% 45% / 0.28), transparent 70%)",
          }}
        />
        <div className="absolute left-1/2 top-[14%] h-[62%] w-[54%] -translate-x-1/2 rounded-t-full border border-white/10 [animation:mkc-rise_1.2s_0.2s_cubic-bezier(0.22,1,0.36,1)_backwards]" />
        <div className="absolute left-1/2 top-[20%] h-[56%] w-[42%] -translate-x-1/2 rounded-t-full border border-white/[0.07] bg-white/[0.02] [animation:mkc-rise_1.2s_0.35s_cubic-bezier(0.22,1,0.36,1)_backwards]" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full border border-white/5 shadow-[0_0_0_50px_hsl(0_0%_100%/0.02),0_0_0_100px_hsl(0_0%_100%/0.015)]" />
        <div className="absolute right-12 top-12 flex h-32 w-32 items-center justify-center rounded-full bg-[hsl(40_100%_99%/0.95)] text-[hsl(28_32%_46%)] shadow-2xl">
          <svg viewBox="0 0 200 200" className="absolute inset-1 animate-[spin_24s_linear_infinite]" aria-hidden>
            <defs>
              <path id="mkc-lingkar" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0" />
            </defs>
            <text fontSize="15" letterSpacing="3.4" fill="hsl(32 15% 30%)">
              <textPath href="#mkc-lingkar">MK CONNECT · MAHA KARYA HALUOLEO ·</textPath>
            </text>
          </svg>
          <span className="text-lg">✦</span>
        </div>
        <div className="relative flex h-full flex-col justify-end gap-4 p-14 text-[hsl(39_40%_94%)]">
          <p className="text-[0.7rem] uppercase tracking-[0.3em] text-[hsl(36_45%_75%)] [animation:mkc-rise_0.9s_0.4s_backwards]">Komunikasi Internal</p>
          <p className="font-display text-5xl leading-[1.05] [animation:mkc-rise_0.9s_0.5s_backwards]">{COMPANY_NAME}</p>
          <p className="max-w-md text-sm leading-relaxed text-[hsl(39_40%_94%/0.7)] [animation:mkc-rise_0.9s_0.65s_backwards]">
            Satu platform untuk absensi, memo, pengumuman, dan seluruh komunikasi internal perusahaan.
          </p>
        </div>
      </div>
    </div>
  );
}
