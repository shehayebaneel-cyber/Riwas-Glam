import { useEffect, useState } from "react";
import { api } from "../lib/api";

type L = { label: string; count: number };
type Data = { days: number; pageViews: number; topPages: L[]; topServices: L[]; sources: L[]; clicks: L[]; bookingsStarted: number; bookingsCompleted: number; conversionRate: number };

/** In-house website analytics: traffic, funnel, top services, sources. */
export function WebAnalytics({ adminKey }: { adminKey: string }) {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { api.get<Data>(`/api/admin/analytics/web?days=${days}`, { "x-admin-key": adminKey }).then(setD).catch(() => {}); }, [days, adminKey]);
  if (!d) return null;
  return (
    <div className="card mb-4 p-4">
      <div className="flex items-center justify-between">
        <p className="font-display font-bold text-ink">🌐 Website analytics</p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input !w-auto !py-1 text-xs">
          <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
        </select>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini label="Page views" value={String(d.pageViews)} />
        <Mini label="Bookings started" value={String(d.bookingsStarted)} />
        <Mini label="Completed" value={String(d.bookingsCompleted)} />
        <Mini label="Conversion" value={`${d.conversionRate}%`} />
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <List title="Top pages" items={d.topPages} />
        <List title="Top services viewed" items={d.topServices} />
        <List title="Traffic sources" items={d.sources} />
        <List title="Button clicks" items={d.clicks} />
      </div>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface-2 p-2 text-center"><p className="text-[10px] text-muted">{label}</p><p className="font-display font-bold text-ink">{value}</p></div>;
}
function List({ title, items }: { title: string; items: L[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{title}</p>
      {items.map((i) => <div key={i.label} className="flex justify-between border-b border-border py-1 text-sm last:border-0"><span className="min-w-0 truncate text-ink">{i.label}</span><span className="shrink-0 font-semibold text-muted">{i.count}</span></div>)}
    </div>
  );
}
