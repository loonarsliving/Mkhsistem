"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";

import { setProductSalesAssignmentAction } from "../actions/crm.actions";
import { listProductSalesAssignmentsAction, listSalesEmployeesForAssignmentAction } from "../actions/crm-query.actions";

/**
 * Which Sales reps (in this branch) sell this product -- what Target
 * Distribution reads to decide who a product's target_unit gets split
 * across. "Sales A: Rumah Subsidi only" is set here, per product.
 */
export function ManageProductAssignmentDialog({ productId, productName, branchId }: { productId: string; productName: string; branchId: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: sales, isLoading: loadingSales } = useQuery({
    queryKey: ["crm-branch-sales", branchId],
    queryFn: () => listSalesEmployeesForAssignmentAction(branchId),
    enabled: open && Boolean(branchId),
  });
  const { data: assignedIds, isLoading: loadingAssignments } = useQuery({
    queryKey: ["crm-product-assignments", productId],
    queryFn: () => listProductSalesAssignmentsAction(productId),
    enabled: open,
  });

  const assignedSet = new Set(assignedIds ?? []);

  async function toggle(salesId: string, assigned: boolean) {
    setPending(salesId);
    const result = await setProductSalesAssignmentAction({ productId, salesId, assigned });
    setPending(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengubah penugasan");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["crm-product-assignments", productId] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" title={`Kelola Sales untuk ${productName}`}>
          <Users className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sales untuk {productName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Hanya Sales yang dicentang di sini yang akan menerima bagian target saat &quot;Simpan &amp; Distribusikan&quot; untuk produk ini.
        </p>

        {loadingSales || loadingAssignments ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (sales ?? []).length === 0 ? (
          <EmptyState icon={Users} title="Belum ada Sales di cabang ini" className="border-0 py-8" />
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {(sales ?? []).map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                <Checkbox
                  id={`assign-${s.id}`}
                  checked={assignedSet.has(s.id)}
                  disabled={pending === s.id}
                  onCheckedChange={(checked) => toggle(s.id, checked === true)}
                />
                <label htmlFor={`assign-${s.id}`} className="flex-1 cursor-pointer text-sm">
                  <span className="font-medium">{s.full_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{s.employee_code}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
