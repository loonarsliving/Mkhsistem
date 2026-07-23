import { createHrExpenseAction } from "../actions/hr-finance.actions";

async function submit(formData: FormData) {
  "use server";
  await createHrExpenseAction({
    expenseType: formData.get("expenseType") as "bonus" | "reimbursement" | "other",
    employeeId: String(formData.get("employeeId")),
    branchId: String(formData.get("branchId")),
    amount: Number(formData.get("amount")),
    expenseDate: String(formData.get("expenseDate")),
    description: String(formData.get("description")),
  });
}

export function HrExpenseForm({
  employees,
  branches,
}: {
  employees: { id: string; full_name: string; employee_code: string }[];
  branches: { id: string; name: string }[];
}) {
  return (
    <form action={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="expenseType">Jenis</label>
        <select name="expenseType" id="expenseType" required className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="bonus">Bonus</option>
          <option value="reimbursement">Reimbursement</option>
          <option value="other">HR Expense Lainnya</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="employeeId">Karyawan</label>
        <select name="employeeId" id="employeeId" required className="h-9 rounded-md border bg-background px-3 text-sm">
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="branchId">Cabang</label>
        <select name="branchId" id="branchId" required className="h-9 rounded-md border bg-background px-3 text-sm">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="amount">Jumlah (Rp)</label>
        <input type="number" min={1} step="1" name="amount" id="amount" required className="h-9 rounded-md border bg-background px-3 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="expenseDate">Tanggal</label>
        <input type="date" name="expenseDate" id="expenseDate" required className="h-9 rounded-md border bg-background px-3 text-sm" />
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className="text-sm font-medium" htmlFor="description">Deskripsi</label>
        <textarea name="description" id="description" required rows={2} className="rounded-md border bg-background px-3 py-2 text-sm" />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Ajukan
        </button>
      </div>
    </form>
  );
}
