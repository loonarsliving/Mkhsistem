"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radar } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { runFridayBriefingAction } from "../actions/friday.actions";

/**
 * On-demand analysis.
 *
 * The question is optional on purpose: leaving it empty asks the same standing
 * question the daily briefing answers ("what should I know right now"), which
 * is the common case after something visibly changed and waiting until 06:30
 * tomorrow is not an option.
 *
 * Analysis runs in the background job queue rather than inline — a full
 * cross-domain read plus a 4k-token generation does not fit comfortably in a
 * server action's budget, and putting it in the queue means it inherits the
 * same retry and circuit-breaker behavior as every other AI job in the system.
 */
export function AskFriday() {
  const [question, setQuestion] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const result = await runFridayBriefingAction({ question });
      if (!result.success) {
        toast.error(result.error ?? "Gagal menjalankan analisa");
        return;
      }
      setQuestion("");
      toast.success("FRIDAY sedang menganalisa. Hasilnya muncul di halaman ini sebentar lagi.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Opsional — tanyakan hal spesifik. Contoh: kenapa biaya iklan naik tapi closing turun? Kosongkan untuk briefing eksekutif umum."
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          FRIDAY membaca CRM, iklan, keuangan, HR, Markom, okupansi, dan kesehatan automation sekaligus — bukan satu modul saja.
        </p>
        <Button onClick={run} disabled={isPending} className="shrink-0">
          <Radar className={isPending ? "size-4 animate-spin" : "size-4"} />
          {isPending ? "Menganalisa..." : "Jalankan analisa"}
        </Button>
      </div>
    </div>
  );
}
