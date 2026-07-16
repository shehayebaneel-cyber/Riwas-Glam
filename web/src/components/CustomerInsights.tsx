import { useEffect, useState } from "react";
import { api } from "../lib/api";

const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
type Insights = {
  totalCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  avgLifetimeValue: number;
  active90: number;
  retentionRate: number;
  topCustomers: { name: string; spent: number; visits: number }[];
  acquisition: { month: string; count: number }[];
};

/** Advanced customer analytics: CLV, repeat rate, retention, top spenders, acquisition. */
export function CustomerInsights({ adminKey }: { adminKey: string }) {
  const [d, setD] = useState<Insights | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api
      .get<Insights>("/api/admin/analytics/customers", { "x-admin-key": adminKey })
      .then(setD)
      .catch(() => {});
  }, [adminKey]);
  if (!d) return null;
  return (
    <div className="card p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between">
        <span className="font-display text-ink font-bold">📊 Customer insights</span>
        <span className="text-muted text-xs">{open ? "Hide ▲" : "More ▼"}</span>
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
            <p className="text-muted mb-1 text-xs font-bold uppercase tracking-wide">Top customers</p>
            {d.topCustomers.length === 0 ? (
              <p className="text-muted text-sm">No visits yet.</p>
            ) : (
              d.topCustomers.map((c) => (
                <div key={c.name} className="border-border flex justify-between border-b py-1 text-sm last:border-0">
                  <span className="text-ink">
                    {c.name}{" "}
                    <span className="text-muted">
                      · {c.visits} visit{c.visits === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="text-brand font-semibold">{money(c.spent)}</span>
                </div>
              ))
            )}
          </div>
          <div>
            <p className="text-muted mb-1 text-xs font-bold uppercase tracking-wide">New customers / month</p>
            {d.acquisition.length === 0 ? (
              <p className="text-muted text-sm">—</p>
            ) : (
              d.acquisition.map((a) => (
                <div key={a.month} className="flex items-center gap-2 py-1 text-sm">
                  <span className="text-muted w-16 shrink-0">{a.month}</span>
                  <span className="bg-brand h-2 rounded-full" style={{ width: `${Math.max(6, Math.min(100, a.count * 12))}%` }} />
                  <span className="text-ink">{a.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-xl p-2 text-center">
      <p className="text-muted text-[10px]">{label}</p>
      <p className="font-display text-ink font-bold">{value}</p>
    </div>
  );
}
