type SyncLogRow = {
  id: string;
  direction: string;
  event_type: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  succeeded: "text-emerald-600",
  pending: "text-amber-600",
  sent: "text-amber-600",
  failed: "text-orange-600",
  dead_letter: "text-destructive",
  skipped: "text-muted-foreground",
};

export function SyncLogTable({ rows }: { rows: SyncLogRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">Belum ada aktivitas sinkronisasi.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-muted-foreground">
            <th className="py-2 pr-4">Waktu</th>
            <th className="py-2 pr-4">Arah</th>
            <th className="py-2 pr-4">Event</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Percobaan</th>
            <th className="py-2">Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="py-2 pr-4 whitespace-nowrap">{new Date(row.created_at).toLocaleString("id-ID")}</td>
              <td className="py-2 pr-4">{row.direction === "outbound" ? "→ MKH Property" : "← MKH Property"}</td>
              <td className="py-2 pr-4">{row.event_type}</td>
              <td className={`py-2 pr-4 font-medium ${STATUS_COLOR[row.status] ?? ""}`}>{row.status}</td>
              <td className="py-2 pr-4">{row.attempt_count}</td>
              <td className="py-2 max-w-xs truncate text-muted-foreground">{row.last_error ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
