import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type Analytics = {
  revenue: number;
  material: number;
  commission: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
  appointments: number;
  avgTicket: number;
  bestService: string;
  topStaff: string;
  byCategory: { name: string; value: number }[];
  byStaff: { name: string; value: number }[];
  byService: { name: string; count: number; revenue: number; profit: number }[];
  daily: { date: string; value: number }[];
};
type Expense = { id: number; category: string; label: string; amount: number; date: string; note: string };
type Cat = { id: number; name: string; emoji: string; services: { id: number; name: string; price: number; materialCost: number }[] };

const ymd = (d: Date) => d.toLocaleDateString("en-CA");
const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const COLORS = ["#d97c9a", "#c8a86a", "#e6a4b8", "#b0687f", "#8a5a68", "#f0c8d4", "#d4b483", "#a98a92"];
const EXPENSE_CATS = ["Rent", "Utilities", "Supplies", "Marketing", "Salaries", "Equipment", "Cleaning", "Other"];

function rangeFor(period: string): { from: string; to: string } | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (period === "today") return { from: ymd(now), to: ymd(now) };
  if (period === "week") {
    const dow = (now.getDay() + 6) % 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - dow);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: ymd(mon), to: ymd(sun) };
  }
  if (period === "month") {
    return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (period === "year") return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  return null;
}

export function FinancesAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [view, setView] = useState<"dashboard" | "expenses" | "costs">("dashboard");
  const [period, setPeriod] = useState("month");
  const [custom, setCustom] = useState({ from: ymd(new Date()), to: ymd(new Date()) });
  const range = useMemo(() => rangeFor(period) ?? custom, [period, custom]);

  return (
    <div className="space-y-4">
      <div className="no-scrollbar bg-surface-2 flex gap-1 overflow-x-auto rounded-full p-1">
        {(
          [
            ["dashboard", "📊 Dashboard"],
            ["expenses", "🧾 Expenses"],
            ["costs", "🧴 Material costs"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold ${view === v ? "bg-brand text-white" : "text-muted"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {view !== "costs" && (
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["today", "Today"],
            ["week", "This week"],
            ["month", "This month"],
            ["year", "This year"],
            ["custom", "Custom"],
          ].map(([v, l]) => (
            <button key={v} onClick={() => setPeriod(v)} className={`chip ${period === v ? "chip-active" : ""}`}>
              {l}
            </button>
          ))}
          {period === "custom" && (
            <span className="flex items-center gap-2">
              <input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                className="input !w-auto !py-1.5 text-sm"
              />
              <span className="text-muted">→</span>
              <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="input !w-auto !py-1.5 text-sm" />
            </span>
          )}
        </div>
      )}

      {view === "dashboard" && <Dashboard hdr={hdr} range={range} />}
      {view === "expenses" && <Expenses hdr={hdr} range={range} />}
      {view === "costs" && <MaterialCosts hdr={hdr} />}
    </div>
  );
}

function Dashboard({ hdr, range }: { hdr: Record<string, string>; range: { from: string; to: string } }) {
  const [a, setA] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api
      .get<Analytics>(`/api/admin/analytics?from=${range.from}&to=${range.to}`, hdr)
      .then(setA)
      .catch(() => setA(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [range.from, range.to]);

  if (loading) return <p className="card text-muted p-8 text-center">Crunching numbers…</p>;
  if (!a) return <p className="card text-muted p-8 text-center">No data for this period.</p>;
  const maxDay = Math.max(1, ...a.daily.map((d) => d.value));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Revenue" value={money(a.revenue)} tone="ink" />
        <Card label="Net profit" value={money(a.netProfit)} tone={a.netProfit >= 0 ? "good" : "bad"} big />
        <Card label="Appointments" value={String(a.appointments)} tone="ink" />
        <Card label="Avg ticket" value={money(a.avgTicket)} tone="ink" />
      </div>

      {/* Profit waterfall */}
      <div className="card p-5">
        <p className="font-display text-brand-dark font-bold">How profit is calculated</p>
        <div className="mt-3 space-y-1.5 text-sm">
          <Line k="Revenue" v={money(a.revenue)} />
          <Line k="− Material costs" v={"−" + money(a.material)} muted />
          <Line k="− Staff commissions" v={"−" + money(a.commission)} muted />
          <Line k="= Gross profit" v={money(a.grossProfit)} bold />
          <Line k="− Expenses" v={"−" + money(a.expenses)} muted />
          <div className="border-border mt-1 border-t pt-2">
            <Line k="= Net profit" v={money(a.netProfit)} bold tone={a.netProfit >= 0 ? "good" : "bad"} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat label="Best-selling service" value={a.bestService} />
        <MiniStat label="Top staff (by revenue)" value={a.topStaff} />
        <MiniStat label="Gross margin" value={a.revenue ? Math.round((a.grossProfit / a.revenue) * 100) + "%" : "—"} />
      </div>

      {/* Daily revenue */}
      {a.daily.length > 0 && (
        <div className="card p-5">
          <p className="font-display text-brand-dark font-bold">Revenue by day</p>
          <div className="mt-4 flex h-40 items-end gap-1">
            {a.daily.map((d) => (
              <div key={d.date} className="group relative flex-1" title={`${d.date}: ${money(d.value)}`}>
                <div className="bg-brand group-hover:bg-brand-dark w-full rounded-t transition-all" style={{ height: `${(d.value / maxDay) * 100}%` }} />
              </div>
            ))}
          </div>
          <p className="text-muted mt-2 text-center text-xs">
            {a.daily[0].date} → {a.daily[a.daily.length - 1].date}
          </p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Donut title="Revenue by category" data={a.byCategory} />
        <BarList title="Revenue by staff" data={a.byStaff} />
      </div>

      {/* Per-service profit */}
      {a.byService.length > 0 && (
        <div className="card overflow-hidden p-0">
          <p className="border-border font-display text-brand-dark border-b p-4 font-bold">Profit by service</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-left text-xs uppercase">
                  <th className="p-3">Service</th>
                  <th className="p-3 text-right"># </th>
                  <th className="p-3 text-right">Revenue</th>
                  <th className="p-3 text-right">Profit</th>
                </tr>
              </thead>
              <tbody>
                {a.byService.map((s) => (
                  <tr key={s.name} className="border-border border-t">
                    <td className="text-ink p-3 font-semibold">{s.name}</td>
                    <td className="text-muted p-3 text-right">{s.count}</td>
                    <td className="p-3 text-right">{money(s.revenue)}</td>
                    <td className={`p-3 text-right font-semibold ${s.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{money(s.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Expenses({ hdr, range }: { hdr: Record<string, string>; range: { from: string; to: string } }) {
  const [items, setItems] = useState<Expense[]>([]);
  const [form, setForm] = useState({ category: "Rent", label: "", amount: "", date: ymd(new Date()), note: "" });
  const load = () =>
    api
      .get<Expense[]>(`/api/admin/expenses?from=${range.from}&to=${range.to}`, hdr)
      .then(setItems)
      .catch(() => {});
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [range.from, range.to]);
  const total = items.reduce((s, e) => s + e.amount, 0);

  async function add() {
    if (!form.amount || !form.date) return;
    await api.post("/api/admin/expenses", { ...form, amount: Number(form.amount) }, hdr);
    setForm({ ...form, label: "", amount: "", note: "" });
    load();
  }
  async function del(id: number) {
    await api.delete(`/api/admin/expenses/${id}`, hdr);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="font-display text-brand-dark font-bold">Add an expense</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
            {EXPENSE_CATS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Description (e.g. July rent)"
            className="input"
          />
          <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount $" className="input" />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
        </div>
        <button onClick={add} className="btn btn-primary mt-3 px-5 py-2">
          + Add expense
        </button>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-brand-dark font-bold">Expenses this period</p>
          <p className="font-display text-ink text-lg font-extrabold">{money(total)}</p>
        </div>
        <div className="mt-3 space-y-2">
          {items.length === 0 ? (
            <p className="text-muted py-6 text-center">No expenses recorded.</p>
          ) : (
            items.map((e) => (
              <div key={e.id} className="border-border flex items-center gap-3 border-b pb-2 text-sm last:border-0">
                <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 text-xs font-semibold">{e.category}</span>
                <span className="text-ink font-semibold">{e.label || "—"}</span>
                <span className="text-muted text-xs">{e.date}</span>
                <span className="text-ink ml-auto font-semibold">{money(e.amount)}</span>
                <button onClick={() => del(e.id)} className="text-xs font-semibold text-red-500">
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MaterialCosts({ hdr }: { hdr: Record<string, string> }) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => {
    api
      .get<Cat[]>("/api/admin/catalog", hdr)
      .then(setCats)
      .catch(() => {}); /* eslint-disable-next-line */
  }, []);

  async function save(id: number, materialCost: number) {
    await api.patch(`/api/admin/services/${id}`, { materialCost }, hdr);
    setCats((cs) => cs.map((c) => ({ ...c, services: c.services.map((s) => (s.id === id ? { ...s, materialCost } : s)) })));
    setSaved(id);
    setTimeout(() => setSaved((x) => (x === id ? null : x)), 1200);
  }

  return (
    <div className="space-y-4">
      <p className="card text-muted p-4 text-sm">
        Set the estimated product/material cost for each service (foundation, gel, wax…). This feeds the <b>profit</b> figures. Later, the Inventory module can
        fill these in automatically.
      </p>
      {cats.map((c) => (
        <div key={c.id} className="card p-4">
          <p className="font-display text-brand-dark font-bold">
            {c.emoji} {c.name}
          </p>
          <div className="mt-2 space-y-1.5">
            {c.services.map((s) => (
              <div key={s.id} className="flex items-center gap-3 text-sm">
                <span className="text-ink flex-1 font-semibold">{s.name}</span>
                <span className="text-muted text-xs">Price {money(s.price)}</span>
                <span className="flex items-center gap-1">
                  <span className="text-muted text-xs">Cost $</span>
                  <input
                    type="number"
                    defaultValue={s.materialCost}
                    onBlur={(e) => save(s.id, Math.max(0, Number(e.target.value) || 0))}
                    className="input !w-24 !py-1.5 text-sm"
                  />
                </span>
                {saved === s.id && <span className="text-xs font-semibold text-emerald-600">✓</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- little presentational helpers ----
function Card({ label, value, tone = "ink", big = false }: { label: string; value: string; tone?: "ink" | "good" | "bad"; big?: boolean }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-500" : "text-ink";
  return (
    <div className={`card p-4 ${big ? "ring-brand/30 ring-2" : ""}`}>
      <p className="text-muted text-xs">{label}</p>
      <p className={`font-display text-2xl font-extrabold ${color}`}>{value}</p>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-muted text-xs">{label}</p>
      <p className="font-display text-ink mt-0.5 text-lg font-bold">{value}</p>
    </div>
  );
}
function Line({ k, v, muted = false, bold = false, tone }: { k: string; v: string; muted?: boolean; bold?: boolean; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-500" : bold ? "text-ink" : muted ? "text-muted" : "text-ink";
  return (
    <div className="flex justify-between">
      <span className={muted ? "text-muted" : "text-ink"}>{k}</span>
      <span className={`${color} ${bold ? "font-bold" : "font-semibold"}`}>{v}</span>
    </div>
  );
}
function BarList({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="card p-5">
      <p className="font-display text-brand-dark font-bold">{title}</p>
      <div className="mt-3 space-y-2">
        {data.length === 0 ? (
          <p className="text-muted text-sm">No data.</p>
        ) : (
          data.map((d, i) => (
            <div key={d.name}>
              <div className="flex justify-between text-sm">
                <span className="text-ink">{d.name}</span>
                <span className="text-muted font-semibold">{money(d.value)}</span>
              </div>
              <div className="bg-surface-2 mt-1 h-2 rounded-full">
                <div className="h-2 rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: COLORS[i % COLORS.length] }} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
function Donut({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const stops = data
    .map((d, i) => {
      const from = (acc / total) * 100;
      acc += d.value;
      const to = (acc / total) * 100;
      return `${COLORS[i % COLORS.length]} ${from}% ${to}%`;
    })
    .join(", ");
  return (
    <div className="card p-5">
      <p className="font-display text-brand-dark font-bold">{title}</p>
      {data.length === 0 ? (
        <p className="text-muted mt-3 text-sm">No data.</p>
      ) : (
        <div className="mt-4 flex items-center gap-5">
          <div className="relative h-32 w-32 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }}>
            <div className="bg-surface absolute inset-[24%] rounded-full" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-ink truncate">{d.name}</span>
                <span className="text-muted ml-auto font-semibold">{Math.round((d.value / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
