import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { WebVitalsReporter } from "@/components/shared/web-vitals-reporter";
import { APP_NAME, APP_TAGLINE, APP_URL, COMPANY_NAME } from "@/constants/app";
import { Providers } from "./providers";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

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
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <Providers nonce={nonce}>{children}</Providers>
        <WebVitalsReporter />
        <SpeedInsights />
      </body>
    </html>
  );
}
