import { useEffect, useState } from "react";
import { api } from "../lib/api";

const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
type Insights = { totalCustomers: number; repeatCustomers: number; repeatRate: number; avgLifetimeValue: number; active90: number; retentionRate: number; topCustomers: { name: string; spent: number; visits: number }[]; acquisition: { month: string; count: number }[] };

/** Advanced customer analytics: CLV, repeat rate, retention, top spenders, acquisition. */
export function CustomerInsights({ adminKey }: { adminKey: string }) {
  const [d, setD] = useState<Insights | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get<Insights>("/api/admin/analytics/customers", { "x-admin-key": adminKey }).then(setD).catch(() => {}); }, [adminKey]);
  if (!d) return null;
  return (
    <div className="card p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between">
        <span className="font-display font-bold text-ink">📊 Customer insights</span>
        <span className="text-xs text-muted">{open ? "Hide ▲" : "More ▼"}</span>
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini label="Customers" value={String(d.totalCustomers)} />
        <Mini label="Repeat rate" value={`${d.repeatRate}%`} />
        <Mini label="Avg lifetime" value={money(d.avgLifetimeValue)} />
        <Mini label="Retention (90d)" value={`${d.retentionRate}%`} />
      </div>
      {open && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Top customers</p>
            {d.topCustomers.length === 0 ? <p className="text-sm text-muted">No visits yet.</p> : d.topCustomers.map((c) => (
              <div key={c.name} className="flex justify-between border-b border-border py-1 text-sm last:border-0"><span className="text-ink">{c.name} <span className="text-muted">· {c.visits} visit{c.visits === 1 ? "" : "s"}</span></span><span className="font-semibold text-brand">{money(c.spent)}</span></div>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">New customers / month</p>
            {d.acquisition.length === 0 ? <p className="text-sm text-muted">—</p> : d.acquisition.map((a) => (
              <div key={a.month} className="flex items-center gap-2 py-1 text-sm">
                <span className="w-16 shrink-0 text-muted">{a.month}</span>
                <span className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(6, Math.min(100, a.count * 12))}%` }} />
                <span className="text-ink">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface-2 p-2 text-center"><p className="text-[10px] text-muted">{label}</p><p className="font-display font-bold text-ink">{value}</p></div>;
}
