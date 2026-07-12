"use client";

import { useState } from "react";

import { approvePayrollRunAction } from "../actions/hr-finance.actions";

type Employee = { id: string; full_name: string; employee_code: string; branch_id: string };
type PayrollRun = { id: string; branch_id: string; period_month: number; period_year: number; branch: { name: string } | null };

export function PayrollRunApprovePanel({ run, employees }: { run: PayrollRun; employees: Employee[] }) {
  const branchEmployees = employees.filter((e) => e.branch_id === run.branch_id);
  const [rows, setRows] = useState(
    branchEmployees.map((e) => ({ employeeId: e.id, name: `${e.full_name} (${e.employee_code})`, baseSalary: 0, allowances: 0, deductions: 0 }))
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateRow(index: number, field: "baseSalary" | "allowances" | "deductions", value: number) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  async function handleApprove() {
    setPending(true);
    setMessage(null);
    const result = await approvePayrollRunAction({
      payrollRunId: run.id,
      items: rows
        .filter((row) => row.baseSalary > 0 || row.allowances > 0)
        .map(({ employeeId, baseSalary, allowances, deductions }) => ({ employeeId, baseSalary, allowances, deductions })),
    });
    setPending(false);
    setMessage(result.success ? "Payroll run disetujui, gaji tersinkronisasi ke MKH Property." : result.error ?? "Gagal");
  }

  if (!branchEmployees.length) {
    return <p className="text-sm text-muted-foreground">Tidak ada karyawan aktif di cabang ini.</p>;
  }

  return (
    <div className="rounded-lg border p-4">
      <p className="mb-3 font-medium">{run.branch?.name} — {run.period_month}/{run.period_year}</p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.employeeId} className="grid grid-cols-4 items-center gap-2 text-sm">
            <span className="truncate">{row.name}</span>
            <input
              type="number"
              placeholder="Gaji pokok"
              className="h-8 rounded border bg-background px-2"
              value={row.baseSalary || ""}
              onChange={(e) => updateRow(i, "baseSalary", Number(e.target.value))}
            />
            <input
              type="number"
              placeholder="Tunjangan"
              className="h-8 rounded border bg-background px-2"
              value={row.allowances || ""}
              onChange={(e) => updateRow(i, "allowances", Number(e.target.value))}
            />
            <input
              type="number"
              placeholder="Potongan"
              className="h-8 rounded border bg-background px-2"
              value={row.deductions || ""}
              onChange={(e) => updateRow(i, "deductions", Number(e.target.value))}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={handleApprove}
        className="mt-3 h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Memproses..." : "Setujui & Generate Gaji"}
      </button>
      {message && <p className="mt-2 text-sm">{message}</p>}
    </div>
  );
}
