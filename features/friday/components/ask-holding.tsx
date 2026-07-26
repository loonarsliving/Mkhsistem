"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { runHoldingBriefingAction } from "../actions/friday.actions";

/** On-demand group analysis. Mirrors AskFriday one scope wider — same background-queue reasoning applies, only more so, since this reads every business at once. */
export function AskHolding() {
  const [question, setQuestion] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run() {
    startTransition(async () => {
      const result = await runHoldingBriefingAction({ question });
      if (!result.success) {
        toast.error(result.error ?? "Gagal menjalankan analisa grup");
        return;
      }
      setQuestion("");
      toast.success("FRIDAY sedang membaca seluruh unit bisnis. Hasilnya muncul di halaman ini sebentar lagi.");
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
        placeholder="Opsional — contoh: unit mana yang paling layak mendapat tambahan modal kuartal ini? Kosongkan untuk briefing grup umum."
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          FRIDAY membaca setiap unit lewat Connector-nya masing-masing. Sumber kebenaran data tetap di sistem operasional tiap bisnis.
        </p>
        <Button onClick={run} disabled={isPending} className="shrink-0">
          <Building2 className={isPending ? "size-4 animate-pulse" : "size-4"} />
          {isPending ? "Menganalisa grup..." : "Analisa grup"}
        </Button>
      </div>
    </div>
  );
}
