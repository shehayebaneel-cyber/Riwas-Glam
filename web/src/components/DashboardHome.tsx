import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Dash = {
  today: { bookings: number; revenue: number; profit: number };
  month: { revenue: number; profit: number };
  workingToday: { name: string; role: string }[];
  commissionOwed: number; pendingReviews: number; waitlist: number; birthdays: string[];
  lowStock: { count: number; items: { name: string; quantity: number; unit: string }[] };
  giftCards: { count: number; value: number };
  bestServices: { name: string; value: number }[];
  mostBookedStaff: { name: string; value: number }[];
  charts: { revenueByDay: { date: string; value: number }[]; revenueByCategory: { name: string; value: number }[]; bookingsByStaff: { name: string; value: number }[]; profitByMonth: { name: string; value: number }[] };
};
const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const COLORS = ["#d97c9a", "#c8a86a", "#e6a4b8", "#b0687f", "#8a5a68", "#f0c8d4", "#d4b483", "#a98a92"];

export function DashboardHome({ adminKey, go }: { adminKey: string; go: (tab: string) => void }) {
  const [d, setD] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get<Dash>("/api/admin/dashboard", { "x-admin-key": adminKey }).then(setD).catch(() => setD(null)).finally(() => setLoading(false)); /* eslint-disable-next-line */ }, []);
  if (loading) return <p className="card p-10 text-center text-muted">Loading your dashboard…</p>;
  if (!d) return <p className="card p-10 text-center text-muted">Couldn't load the dashboard.</p>;
  const maxDay = Math.max(1, ...d.charts.revenueByDay.map((x) => x.value));
  const maxPM = Math.max(1, ...d.charts.profitByMonth.map((x) => Math.abs(x.value)));

  return (
    <div className="space-y-7">
      {/* Today */}
      <section>
        <SectionTitle>Today</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <Card label="Bookings" value={String(d.today.bookings)} onClick={() => go("bookings")} />
          <Card label="Revenue" value={money(d.today.revenue)} />
          <Card label="Profit" value={money(d.today.profit)} tone={d.today.profit >= 0 ? "good" : "bad"} />
        </div>
      </section>

      {/* This month */}
      <section>
        <SectionTitle>This month</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="Revenue" value={money(d.month.revenue)} onClick={() => go("finances")} />
          <Card label="Profit" value={money(d.month.profit)} tone={d.month.profit >= 0 ? "good" : "bad"} onClick={() => go("finances")} />
          <Card label="Commission owed" value={money(d.commissionOwed)} onClick={() => go("payouts")} />
          <Card label="Gift cards sold" value={`${d.giftCards.count} · ${money(d.giftCards.value)}`} onClick={() => go("giftcards")} />
        </div>
      </section>

      {/* Needs attention */}
      <section>
        <SectionTitle>Needs attention</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile icon="⏳" label="Waiting list" value={d.waitlist} sub={d.waitlist ? "in the queue" : "empty"} tone={d.waitlist ? "brand" : "ink"} onClick={() => go("waitlist")} />
          <Tile icon="📝" label="Pending reviews" value={d.pendingReviews} sub={d.pendingReviews ? "tap to moderate" : "all clear"} tone={d.pendingReviews ? "amber" : "ink"} onClick={() => go("reviews")} />
          <Tile icon="📦" label="Low / out of stock" value={d.lowStock.count} sub={d.lowStock.items.length ? d.lowStock.items.map((i) => i.name).join(", ") : "all stocked"} tone={d.lowStock.count ? "red" : "ink"} onClick={() => go("inventory")} />
          <Tile icon="🎂" label="Birthdays this month" value={d.birthdays.length} sub={d.birthdays.length ? d.birthdays.join(", ") : "none"} tone={d.birthdays.length ? "brand" : "ink"} onClick={() => go("customers")} />
        </div>
      </section>

      {/* Team today */}
      <section>
        <SectionTitle>Team today</SectionTitle>
        <div className="card p-4">
          {d.workingToday.length === 0 ? <p className="text-sm text-muted">Nobody scheduled today.</p> : (
            <div className="flex flex-wrap gap-1.5">{d.workingToday.map((s) => <span key={s.name} className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-dark">{s.name}</span>)}</div>
          )}
        </div>
      </section>

      {/* Analytics */}
      <section>
        <SectionTitle>Analytics</SectionTitle>
        <div className="space-y-3">
          {d.charts.revenueByDay.length > 0 && (
            <div className="card p-5">
              <p className="font-display font-bold text-brand-dark">Revenue this month</p>
              <div className="mt-4 flex h-36 items-end gap-1">
                {d.charts.revenueByDay.map((x) => <div key={x.date} className="flex-1 rounded-t bg-brand" style={{ height: `${(x.value / maxDay) * 100}%` }} title={`${x.date}: ${money(x.value)}`} />)}
              </div>
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <Donut title="Revenue by category" data={d.charts.revenueByCategory} />
            <BarList title="Bookings by staff" data={d.charts.bookingsByStaff} unit="" />
            <BarList title="Best-selling services (by bookings)" data={d.bestServices} unit="" />
            <div className="card p-5">
              <p className="font-display font-bold text-brand-dark">Profit by month</p>
              <div className="mt-3 space-y-2">
                {d.charts.profitByMonth.map((m) => (
                  <div key={m.name}>
                    <div className="flex justify-between text-sm"><span className="text-ink">{m.name}</span><span className={`font-semibold ${m.value >= 0 ? "text-emerald-600" : "text-red-500"}`}>{money(m.value)}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-surface-2"><div className={`h-2 rounded-full ${m.value >= 0 ? "bg-emerald-400" : "bg-red-400"}`} style={{ width: `${(Math.abs(m.value) / maxPM) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted/70">{children}</h2>;
}
function Tile({ icon, label, value, sub, tone = "ink", onClick }: { icon: string; label: string; value: string | number; sub?: string; tone?: "ink" | "brand" | "amber" | "red"; onClick?: () => void }) {
  const c = tone === "brand" ? "text-brand" : tone === "amber" ? "text-amber-600" : tone === "red" ? "text-red-500" : "text-ink";
  const cls = `card flex h-full items-start gap-3 p-4 text-left ${onClick ? "transition hover:border-brand" : ""}`;
  const inner = (
    <>
      <span className="shrink-0 text-xl leading-none">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className={`font-display text-2xl font-extrabold ${c}`}>{value}</p>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
    </>
  );
  return onClick ? <button onClick={onClick} className={`${cls} w-full`}>{inner}</button> : <div className={cls}>{inner}</div>;
}

function Card({ label, value, tone = "ink", big = false, onClick }: { label: string; value: string; tone?: "ink" | "good" | "bad"; big?: boolean; onClick?: () => void }) {
  const c = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-500" : "text-ink";
  const cls = `card h-full p-4 text-left ${big ? "ring-2 ring-brand/30" : ""} ${onClick ? "transition hover:border-brand" : ""}`;
  const inner = <><p className="text-xs text-muted">{label}</p><p className={`font-display text-2xl font-extrabold ${c}`}>{value}</p></>;
  return onClick ? <button onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>;
}
function BarList({ title, data, unit }: { title: string; data: { name: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="card p-5">
      <p className="font-display font-bold text-brand-dark">{title}</p>
      <div className="mt-3 space-y-2">
        {data.length === 0 ? <p className="text-sm text-muted">No data yet.</p> : data.map((d, i) => (
          <div key={d.name}>
            <div className="flex justify-between text-sm"><span className="truncate text-ink">{d.name}</span><span className="font-semibold text-muted">{unit === "$" ? money(d.value) : d.value}</span></div>
            <div className="mt-1 h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
function Donut({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1; let acc = 0;
  const stops = data.map((d, i) => { const f = (acc / total) * 100; acc += d.value; return `${COLORS[i % COLORS.length]} ${f}% ${(acc / total) * 100}%`; }).join(", ");
  return (
    <div className="card p-5">
      <p className="font-display font-bold text-brand-dark">{title}</p>
      {data.length === 0 ? <p className="mt-3 text-sm text-muted">No data yet.</p> : (
        <div className="mt-4 flex items-center gap-5">
          <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }}><div className="absolute inset-[24%] rounded-full bg-surface" /></div>
          <div className="min-w-0 flex-1 space-y-1">{data.map((d, i) => <div key={d.name} className="flex items-center gap-2 text-sm"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /><span className="truncate text-ink">{d.name}</span><span className="ml-auto font-semibold text-muted">{money(d.value)}</span></div>)}</div>
        </div>
      )}
    </div>
  );
}
