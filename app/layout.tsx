import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { headers } from "next/headers";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { WebVitalsReporter } from "@/components/shared/web-vitals-reporter";
import { APP_NAME, APP_TAGLINE, APP_URL, COMPANY_NAME } from "@/constants/app";
import { Providers } from "./providers";

import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
// Huruf judul ala loonars.id -- hanya untuk judul halaman & angka besar.
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});

const description = `${APP_TAGLINE} untuk ${COMPANY_NAME}`;

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s | ${APP_NAME}`,
  },
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "/",
    siteName: APP_NAME,
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#14110e" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${sans.variable} ${serif.variable} font-sans`}>
        <Providers nonce={nonce}>{children}</Providers>
        <WebVitalsReporter />
        <SpeedInsights />
      </body>
    </html>
  );
}
