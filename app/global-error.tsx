"use client";

import { useEffect } from "react";

import { reportClientErrorAction } from "@/features/monitoring/actions/monitoring.actions";

import "./globals.css";

/**
 * Catches errors thrown by the root layout itself (outside app/(app)/error.tsx's
 * reach), so it must render its own <html>/<body> — Next.js replaces the
 * entire tree with this file when that happens.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void reportClientErrorAction({
      level: "fatal",
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    });
  }, [error]);

  return (
    <html lang="id">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "1.5rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Aplikasi mengalami kesalahan</h1>
          <p style={{ color: "#6b7280", maxWidth: "28rem" }}>
            Kesalahan sudah tercatat dan akan ditinjau oleh tim sistem. Silakan muat ulang halaman.
          </p>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1.25rem", borderRadius: "0.5rem", background: "#111827", color: "#fff", border: "none", cursor: "pointer" }}
          >
            Muat Ulang
          </button>
        </div>
      </body>
    </html>
  );
}
