import { useEffect, useState } from "react";
import { api } from "../lib/api";

const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
type Promo = {
  code: string;
  description: string;
  type: string;
  value: number;
  uses: number;
  maxUses: number;
  active: boolean;
  revenue: number;
  bookings: number;
};
type Data = { promos: Promo[]; acquisition: { month: string; count: number }[]; totalPromoRevenue: number; totalRedemptions: number };

/** Marketing performance: promo/campaign uses + revenue, and customer acquisition. */
export function MarketingDashboard({ adminKey }: { adminKey: string }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    api
      .get<Data>("/api/admin/analytics/marketing", { "x-admin-key": adminKey })
      .then(setD)
      .catch(() => {});
  }, [adminKey]);
  if (!d) return null;
  const maxAcq = Math.max(1, ...d.acquisition.map((a) => a.count));
  return (
    <div className="card mb-4 p-4">
      <p className="font-display text-ink font-bold">📈 Marketing performance</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Mini label="Promo revenue" value={money(d.totalPromoRevenue)} />
        <Mini label="Redemptions" value={String(d.totalRedemptions)} />
        <Mini label="Active codes" value={String(d.promos.filter((p) => p.active).length)} />
      </div>

      {d.promos.length > 0 && (
        <div className="mt-4">
          <p className="text-muted mb-1 text-xs font-bold uppercase tracking-wide">Campaign performance</p>
          <div className="space-y-1">
            {d.promos.map((p) => (
              <div key={p.code} className="border-border flex items-center justify-between border-b py-1.5 text-sm last:border-0">
                <span className="min-w-0">
                  <span className="text-ink font-mono font-semibold">{p.code}</span>{" "}
                  <span className="text-muted">
                    {p.type === "PERCENT" ? `${p.value}%` : money(p.value)}
                    {p.description ? ` · ${p.description}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="text-brand font-semibold">{money(p.revenue)}</span>{" "}
                  <span className="text-muted text-xs">
                    · {p.uses} use{p.uses === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.acquisition.length > 0 && (
        <div className="mt-4">
          <p className="text-muted mb-1 text-xs font-bold uppercase tracking-wide">New customers / month</p>
          {d.acquisition.map((a) => (
            <div key={a.month} className="flex items-center gap-2 py-0.5 text-sm">
              <span className="text-muted w-16 shrink-0">{a.month}</span>
              <span className="bg-brand h-2 rounded-full" style={{ width: `${Math.max(6, Math.round((a.count / maxAcq) * 100))}%` }} />
              <span className="text-ink">{a.count}</span>
            </div>
          ))}
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
