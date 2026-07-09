import Image from "next/image";

import { APP_NAME, APP_TAGLINE, COMPANY_NAME } from "@/constants/app";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground lg:mx-0">
              MK
            </div>
            <h1 className="text-xl font-semibold">{APP_NAME}</h1>
            <p className="text-sm text-muted-foreground">{APP_TAGLINE}</p>
          </div>
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-sidebar lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-sidebar to-sidebar" />
        <div className="relative flex h-full flex-col items-center justify-center gap-6 p-12 text-center text-sidebar-foreground">
          <Image
            src="/images/office-illustration.svg"
            alt=""
            width={320}
            height={240}
            className="opacity-90"
            priority
          />
          <div className="space-y-2">
            <p className="text-2xl font-semibold">{COMPANY_NAME}</p>
            <p className="max-w-md text-sm text-sidebar-foreground/70">
              Satu platform untuk absensi, memo, pengumuman, dan seluruh komunikasi internal perusahaan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
