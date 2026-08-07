"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { settleConstructionExpenseAction } from "../actions/construction-finance.actions";

export function ConstructionSettleUtangButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await settleConstructionExpenseAction({ id });
      if (!result.success) {
        toast.error(result.error ?? "Gagal menandai lunas");
        return;
      }
      toast.success("Utang ditandai lunas");
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleClick} disabled={isPending}>
      {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
      Tandai Lunas
    </Button>
  );
}
