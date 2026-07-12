import { approveHrExpenseAction, rejectHrExpenseAction } from "../actions/hr-finance.actions";

async function approve(formData: FormData) {
  "use server";
  await approveHrExpenseAction(String(formData.get("id")));
}

async function reject(formData: FormData) {
  "use server";
  await rejectHrExpenseAction({ hrExpenseId: String(formData.get("id")), reason: String(formData.get("reason") ?? "") });
}

type PendingHrExpense = {
  id: string;
  expense_type: string;
  amount: number;
  expense_date: string;
  description: string;
  employee: { full_name: string; employee_code: string } | null;
  branch: { name: string } | null;
};

export function HrExpenseQueue({ items }: { items: PendingHrExpense[] }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Tidak ada pengajuan yang menunggu persetujuan.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.expense_type}</span>
              <p className="font-medium">{item.employee?.full_name} ({item.employee?.employee_code}) — {item.branch?.name}</p>
              <p className="text-sm text-muted-foreground">{item.description}</p>
              <p className="text-sm">Rp {Number(item.amount).toLocaleString("id-ID")} · {item.expense_date}</p>
            </div>
            <div className="flex gap-2">
              <form action={approve}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white">
                  Setujui
                </button>
              </form>
              <form action={reject}>
                <input type="hidden" name="id" value={item.id} />
                <button type="submit" className="h-8 rounded-md border border-destructive/40 bg-destructive/10 px-3 text-xs font-medium text-destructive">
                  Tolak
                </button>
              </form>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
