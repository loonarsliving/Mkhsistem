"use client";

import * as React from "react";
import { Check, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { APP_URL } from "@/constants/app";

interface ShareSiteplanButtonProps {
  kode: string;
  nama: string;
}

/**
 * Lets a Sales/Kepala Cabang rep hand a buyer's family the public, unauthenticated live-status link
 * (/share/siteplan/[kode], migration 0265) -- Web Share API on a phone (which is how this app is
 * mostly used, per its own Capacitor shell) opens the native "Send to WhatsApp/..." sheet directly;
 * falls back to copying the link when the API isn't available (most desktop browsers).
 */
export function ShareSiteplanButton({ kode, nama }: ShareSiteplanButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const url = `${APP_URL}/share/siteplan/${kode}`;

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Siteplan ${nama}`, url });
      } catch {
        // User cancelled the native share sheet -- not an error worth surfacing.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Tautan siteplan live disalin");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin tautan");
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleShare}>
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      Bagikan Siteplan Live
    </Button>
  );
}
