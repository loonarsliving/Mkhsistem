"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

import { deactivateEmployeeAction } from "../actions/employee.actions";

export function DeactivateEmployeeButton({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    setLoading(true);
    const result = await deactivateEmployeeAction(employeeId);
    setLoading(false);
    setOpen(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menonaktifkan karyawan");
      return;
    }
    toast.success("Karyawan dinonaktifkan");
    router.push("/employees");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserX className="h-4 w-4 text-destructive" /> Nonaktifkan
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Nonaktifkan karyawan ini?"
        description="Karyawan tidak akan bisa lagi mengakses sistem, namun data historis tetap tersimpan."
        destructive
        loading={loading}
        onConfirm={handleConfirm}
      />
    </>
  );
}
