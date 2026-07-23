import type { Metadata } from "next";

import { APP_NAME, COMPANY_NAME } from "@/constants/app";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {APP_NAME} — {COMPANY_NAME}
      </p>
      <p className="mt-8 text-sm text-muted-foreground">This page is being prepared. Content will be published here soon.</p>
    </main>
  );
}
