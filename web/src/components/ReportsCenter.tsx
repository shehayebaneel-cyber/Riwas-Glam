import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { SITE } from "../config";

type Col = { key: string; label: string; money?: boolean };
type Built = { columns: Col[]; rows: Record<string, unknown>[]; summary: { label: string; value: string }[] };
type Range = { from: string; to: string };

const ymd = (d: Date) => d.toLocaleDateString("en-CA");
const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const sum = (rows: Record<string, unknown>[], k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

const REPORTS: Record<string, { label: string; range: boolean; build: (r: Range, hdr: Record<string, string>) => Promise<Built> }> = {
  revenue: {
    label: "Revenue & Profit", range: true,
    build: async (r, hdr) => {
      const a = await api.get<{ revenue: number; netProfit: number; expenses: number; appointments: number; byService: { name: string; count: number; revenue: number; profit: number }[] }>(`/api/admin/analytics?from=${r.from}&to=${r.to}`, hdr);
      return { columns: [{ key: "name", label: "Service" }, { key: "count", label: "Count" }, { key: "revenue", label: "Revenue", money: true }, { key: "profit", label: "Profit", money: true }], rows: a.byService, summary: [{ label: "Revenue", value: money(a.revenue) }, { label: "Net profit", value: money(a.netProfit) }, { label: "Expenses", value: money(a.expenses) }, { label: "Appointments", value: String(a.appointments) }] };
    },
  },
  expenses: {
    label: "Expenses", range: true,
    build: async (r, hdr) => {
      const items = await api.get<{ date: string; category: string; label: string; amount: number }[]>(`/api/admin/expenses?from=${r.from}&to=${r.to}`, hdr);
      return { columns: [{ key: "date", label: "Date" }, { key: "category", label: "Category" }, { key: "label", label: "Description" }, { key: "amount", label: "Amount", money: true }], rows: items, summary: [{ label: "Entries", value: String(items.length) }, { label: "Total", value: money(sum(items, "amount")) }] };
    },
  },
  inventory: {
    label: "Inventory", range: false,
    build: async (_r, hdr) => {
      const items = await api.get<{ name: string; brand: string; category: string; quantity: number; unit: string; minQuantity: number; costPrice: number; expiryDate: string }[]>("/api/admin/products", hdr);
      const rows = items.map((p) => ({ ...p, value: Math.round(p.quantity * p.costPrice * 100) / 100, status: p.quantity <= 0 ? "Out" : p.quantity <= p.minQuantity ? "Low" : "In stock" }));
      return { columns: [{ key: "name", label: "Product" }, { key: "brand", label: "Brand" }, { key: "quantity", label: "Qty" }, { key: "unit", label: "Unit" }, { key: "minQuantity", label: "Min" }, { key: "costPrice", label: "Cost", money: true }, { key: "value", label: "Value", money: true }, { key: "expiryDate", label: "Expiry" }, { key: "status", label: "Status" }], rows, summary: [{ label: "Products", value: String(items.length) }, { label: "Total value", value: money(sum(rows, "value")) }] };
    },
  },
  staff: {
    label: "Staff earnings", range: true,
    build: async (r, hdr) => {
      const items = await api.get<{ name: string; role: string; appointments: number; revenue: number; commissionPct: number; commissionEarned: number }[]>(`/api/admin/payouts?from=${r.from}&to=${r.to}`, hdr);
      return { columns: [{ key: "name", label: "Staff" }, { key: "role", label: "Role" }, { key: "appointments", label: "Appts" }, { key: "revenue", label: "Revenue", money: true }, { key: "commissionPct", label: "Comm %" }, { key: "commissionEarned", label: "Commission", money: true }], rows: items, summary: [{ label: "Revenue", value: money(sum(items, "revenue")) }, { label: "Commission owed", value: money(sum(items, "commissionEarned")) }] };
    },
  },
  payouts: {
    label: "Payout history", range: false,
    build: async (_r, hdr) => {
      const items = await api.get<{ periodFrom: string; periodTo: string; paidAt: string; commissionEarned: number; bonus: number; tips: number; deduction: number; total: number; staff: { name: string } }[]>("/api/admin/payouts/history", hdr);
      const rows = items.map((p) => ({ staff: p.staff?.name ?? "—", period: `${p.periodFrom} → ${p.periodTo}`, paid: new Date(p.paidAt).toLocaleDateString(), commissionEarned: p.commissionEarned, bonus: p.bonus, tips: p.tips, deduction: p.deduction, total: p.total }));
      return { columns: [{ key: "staff", label: "Staff" }, { key: "period", label: "Period" }, { key: "paid", label: "Paid" }, { key: "commissionEarned", label: "Commission", money: true }, { key: "bonus", label: "Bonus", money: true }, { key: "tips", label: "Tips", money: true }, { key: "deduction", label: "Deduction", money: true }, { key: "total", label: "Total", money: true }], rows, summary: [{ label: "Payouts", value: String(rows.length) }, { label: "Total paid", value: money(sum(rows, "total")) }] };
    },
  },
  appointments: {
    label: "Appointments", range: true,
    build: async (r, hdr) => {
      const items = await api.get<{ date: string; time: string; serviceName: string; staffName: string; customerName: string; customerPhone: string; price: number; status: string }[]>(`/api/admin/appointments?from=${r.from}&to=${r.to}`, hdr);
      const rev = items.filter((a) => a.status !== "CANCELLED").reduce((s, a) => s + a.price, 0);
      return { columns: [{ key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "serviceName", label: "Service" }, { key: "staffName", label: "Staff" }, { key: "customerName", label: "Customer" }, { key: "customerPhone", label: "Phone" }, { key: "price", label: "Price", money: true }, { key: "status", label: "Status" }], rows: items, summary: [{ label: "Appointments", value: String(items.length) }, { label: "Revenue", value: money(Math.round(rev * 100) / 100) }] };
    },
  },
  customers: {
    label: "Customers", range: false,
    build: async (_r, hdr) => {
      const items = await api.get<{ name: string; phone: string; email: string; visits: number; spent: number; lastVisit: string }[]>("/api/admin/customers", hdr);
      return { columns: [{ key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "visits", label: "Visits" }, { key: "spent", label: "Spent", money: true }, { key: "lastVisit", label: "Last visit" }], rows: items, summary: [{ label: "Customers", value: String(items.length) }, { label: "Total spent", value: money(sum(items, "spent")) }] };
    },
  },
  giftcards: {
    label: "Gift cards", range: false,
    build: async (_r, hdr) => {
      const d = await api.get<{ items: { code: string; initialValue: number; balance: number; status: string; purchaserName: string; expiresAt: string | null }[]; summary: { outstanding: number } }>("/api/admin/gift-cards", hdr);
      const rows = d.items.map((c) => ({ code: c.code, initialValue: c.initialValue, balance: c.balance, status: c.status, purchaserName: c.purchaserName, expiry: c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "" }));
      return { columns: [{ key: "code", label: "Code" }, { key: "initialValue", label: "Initial", money: true }, { key: "balance", label: "Balance", money: true }, { key: "status", label: "Status" }, { key: "purchaserName", label: "Purchaser" }, { key: "expiry", label: "Expiry" }], rows, summary: [{ label: "Cards", value: String(rows.length) }, { label: "Outstanding balance", value: money(d.summary.outstanding) }] };
    },
  },
};

export function ReportsCenter({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [key, setKey] = useState("revenue");
  const monthStart = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [range, setRange] = useState<Range>({ from: monthStart, to: ymd(new Date()) });
  const [built, setBuilt] = useState<Built | null>(null);
  const [loading, setLoading] = useState(true);
  const def = REPORTS[key];

  useEffect(() => {
    setLoading(true);
    def.build(range, hdr).then(setBuilt).catch(() => setBuilt(null)).finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [key, range.from, range.to]);

  const cell = (r: Record<string, unknown>, c: Col) => c.money ? money(Number(r[c.key]) || 0) : String(r[c.key] ?? "");

  function exportCSV() {
    if (!built) return;
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [built.columns.map((c) => c.label).join(","), ...built.rows.map((r) => built.columns.map((c) => esc(r[c.key])).join(","))];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `${key}_report.csv`; a.click(); URL.revokeObjectURL(url);
  }
  function exportPDF() {
    if (!built) return;
    const rangeLabel = def.range ? ` · ${range.from} → ${range.to}` : "";
    const th = built.columns.map((c) => `<th>${c.label}</th>`).join("");
    const trs = built.rows.map((r) => `<tr>${built.columns.map((c) => `<td>${cell(r, c)}</td>`).join("")}</tr>`).join("");
    const sum = built.summary.map((s) => `<span><b>${s.label}:</b> ${s.value}</span>`).join(" &nbsp;·&nbsp; ");
    const html = `<html><head><title>${def.label} report</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#4a3330}h1{color:#c26480;margin:0}.meta{color:#a98a92;margin:4px 0 12px}.sum{margin:10px 0 16px;font-size:.95em}table{width:100%;border-collapse:collapse;font-size:.82em}th,td{border:1px solid #eee;padding:6px 8px;text-align:left}th{background:#fbe4ec;color:#c26480}</style></head><body>
      <h1>${SITE.name}</h1><p class="meta">${def.label} report${rangeLabel} · generated ${new Date().toLocaleDateString()}</p>
      <div class="sum">${sum}</div><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
    const w = window.open("", "_blank"); if (!w) return; w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  return (
    <div className="space-y-4">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {Object.entries(REPORTS).map(([k, r]) => (
          <button key={k} onClick={() => setKey(k)} className={`chip whitespace-nowrap ${key === k ? "chip-active" : ""}`}>{r.label}</button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {def.range && (
          <span className="flex items-center gap-2 text-sm">
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="input !w-auto !py-2" />
            <span className="text-muted">→</span>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="input !w-auto !py-2" />
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={exportCSV} disabled={!built} className="btn btn-ghost px-4 py-2 text-sm disabled:opacity-50">⬇ CSV (Excel)</button>
          <button onClick={exportPDF} disabled={!built} className="btn btn-primary px-4 py-2 text-sm disabled:opacity-50">🖨 PDF</button>
        </div>
      </div>

      {built && built.summary.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {built.summary.map((s) => <div key={s.label} className="card p-3 text-center"><p className="text-xs text-muted">{s.label}</p><p className="font-display text-lg font-extrabold text-ink">{s.value}</p></div>)}
        </div>
      )}

      {loading ? <p className="card p-8 text-center text-muted">Loading…</p> : !built ? <p className="card p-8 text-center text-muted">No data.</p> : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase text-muted"><tr>{built.columns.map((c) => <th key={c.key} className="whitespace-nowrap p-3">{c.label}</th>)}</tr></thead>
              <tbody>
                {built.rows.length === 0 ? <tr><td colSpan={built.columns.length} className="p-6 text-center text-muted">No records.</td></tr> : built.rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">{built.columns.map((c) => <td key={c.key} className="whitespace-nowrap p-3">{cell(r, c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
