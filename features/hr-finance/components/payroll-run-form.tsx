import { createPayrollRunAction } from "../actions/hr-finance.actions";

async function submit(formData: FormData) {
  "use server";
  await createPayrollRunAction({
    branchId: String(formData.get("branchId")),
    periodMonth: Number(formData.get("periodMonth")),
    periodYear: Number(formData.get("periodYear")),
  });
}

export function PayrollRunForm({ branches }: { branches: { id: string; name: string }[] }) {
  const now = new Date();
  return (
    <form action={submit} className="grid gap-3 sm:grid-cols-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="branchId">Cabang</label>
        <select name="branchId" id="branchId" required className="h-9 rounded-md border bg-background px-3 text-sm">
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="periodMonth">Bulan</label>
        <input type="number" min={1} max={12} name="periodMonth" id="periodMonth" defaultValue={now.getMonth() + 1} required className="h-9 rounded-md border bg-background px-3 text-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="periodYear">Tahun</label>
        <input type="number" min={2020} name="periodYear" id="periodYear" defaultValue={now.getFullYear()} required className="h-9 rounded-md border bg-background px-3 text-sm" />
      </div>
      <div className="flex items-end">
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Buat Payroll Run
        </button>
      </div>
    </form>
  );
}
