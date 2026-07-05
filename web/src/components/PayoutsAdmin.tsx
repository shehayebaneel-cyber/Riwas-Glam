import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { SITE } from "../config";

type Row = { staffId: number; name: string; role: string; commissionPct: number; appointments: number; revenue: number; commissionEarned: number };
type Adj = { bonus: number; tips: number; deduction: number };
type Payout = { id: number; staffId: number; periodFrom: string; periodTo: string; appointments: number; revenue: number; commissionEarned: number; bonus: number; tips: number; deduction: number; total: number; note: string; paidAt: string; staff: { name: string } };

const ymd = (d: Date) => d.toLocaleDateString("en-CA");
const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
function rangeFor(period: string): { from: string; to: string } | null {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (period === "today") return { from: ymd(now), to: ymd(now) };
  if (period === "week") { const dow = (now.getDay() + 6) % 7; const mon = new Date(now); mon.setDate(now.getDate() - dow); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { from: ymd(mon), to: ymd(sun) }; }
  if (period === "month") return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  return null;
}

export function PayoutsAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [view, setView] = useState<"current" | "history">("current");
  const [period, setPeriod] = useState("month");
  const [custom, setCustom] = useState({ from: ymd(new Date()), to: ymd(new Date()) });
  const range = useMemo(() => rangeFor(period) ?? custom, [period, custom]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-full bg-surface-2 p-1">
        {([["current", "💸 Pay staff"], ["history", "🕑 History"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${view === v ? "bg-brand text-white" : "text-muted"}`}>{l}</button>
        ))}
      </div>
      {view === "current" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {[["today", "Today"], ["week", "This week"], ["month", "This month"], ["custom", "Custom"]].map(([v, l]) => (
              <button key={v} onClick={() => setPeriod(v)} className={`chip ${period === v ? "chip-active" : ""}`}>{l}</button>
            ))}
            {period === "custom" && (
              <span className="flex items-center gap-2">
                <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="input !w-auto !py-1.5 text-sm" />
                <span className="text-muted">→</span>
                <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="input !w-auto !py-1.5 text-sm" />
              </span>
            )}
          </div>
          <Current hdr={hdr} range={range} />
        </>
      )}
      {view === "history" && <History hdr={hdr} />}
    </div>
  );
}

function Current({ hdr, range }: { hdr: Record<string, string>; range: { from: string; to: string } }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [adj, setAdj] = useState<Record<number, Adj>>({});
  const [paid, setPaid] = useState<Record<number, boolean>>({});
  const load = () => api.get<Row[]>(`/api/admin/payouts?from=${range.from}&to=${range.to}`, hdr).then((r) => { setRows(r); setAdj({}); setPaid({}); }).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range.from, range.to]);

  const getAdj = (id: number) => adj[id] ?? { bonus: 0, tips: 0, deduction: 0 };
  const setA = (id: number, k: keyof Adj, v: number) => setAdj({ ...adj, [id]: { ...getAdj(id), [k]: v } });
  const totalFor = (r: Row) => { const a = getAdj(r.staffId); return Math.round((r.commissionEarned + a.bonus + a.tips - a.deduction) * 100) / 100; };

  async function pay(r: Row) {
    const a = getAdj(r.staffId);
    await api.post("/api/admin/payouts", { staffId: r.staffId, from: range.from, to: range.to, ...a }, hdr);
    setPaid({ ...paid, [r.staffId]: true });
  }
  function payslip(r: Row) {
    const a = getAdj(r.staffId);
    const html = `<html><head><title>Payslip — ${r.name}</title><style>body{font-family:system-ui,sans-serif;padding:40px;color:#4a3330;max-width:520px;margin:auto}h1{color:#c26480}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 0;border-bottom:1px solid #eee}td:last-child{text-align:right;font-weight:600}.tot{font-size:1.3em;color:#c26480}</style></head><body>
      <h1>${SITE.name}</h1><p><b>Payslip</b> · ${r.name} — ${r.role}</p><p>Period: ${range.from} → ${range.to}</p>
      <table>
        <tr><td>Appointments completed</td><td>${r.appointments}</td></tr>
        <tr><td>Revenue generated</td><td>${money(r.revenue)}</td></tr>
        <tr><td>Commission (${r.commissionPct}%)</td><td>${money(r.commissionEarned)}</td></tr>
        <tr><td>Bonus</td><td>${money(a.bonus)}</td></tr>
        <tr><td>Tips</td><td>${money(a.tips)}</td></tr>
        <tr><td>Deduction</td><td>−${money(a.deduction)}</td></tr>
        <tr><td class="tot">Total payout</td><td class="tot">${money(totalFor(r))}</td></tr>
      </table><p style="margin-top:30px;color:#a98a92;font-size:.85em">Generated ${new Date().toLocaleDateString()}</p>
      </body></html>`;
    const w = window.open("", "_blank"); if (!w) return; w.document.write(html); w.document.close(); w.focus(); w.print();
  }
  function exportCSV() {
    const head = ["Staff", "Role", "Appointments", "Revenue", "Commission %", "Commission earned", "Bonus", "Tips", "Deduction", "Total payout"];
    const lines = rows.map((r) => { const a = getAdj(r.staffId); return [r.name, r.role, r.appointments, r.revenue, r.commissionPct, r.commissionEarned, a.bonus, a.tips, a.deduction, totalFor(r)].join(","); });
    const csv = [head.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = `payouts_${range.from}_${range.to}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  if (rows.length === 0) return <p className="card p-8 text-center text-muted">No staff yet.</p>;
  return (
    <div className="space-y-3">
      <button onClick={exportCSV} className="btn btn-ghost px-4 py-2 text-sm">⬇ Export CSV (Excel)</button>
      {rows.map((r) => {
        const a = getAdj(r.staffId);
        return (
          <div key={r.staffId} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-bold text-ink">{r.name}</span>
              <span className="text-xs text-brand">{r.role}</span>
              {paid[r.staffId] && <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">✓ Paid</span>}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <Mini label="Completed" value={String(r.appointments)} />
              <Mini label="Revenue" value={money(r.revenue)} />
              <Mini label={`Commission ${r.commissionPct}%`} value={money(r.commissionEarned)} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["bonus", "tips", "deduction"] as const).map((k) => (
                <label key={k} className="block"><span className="mb-1 block text-xs font-semibold capitalize text-muted">{k}</span>
                  <input type="number" value={a[k] || ""} onChange={(e) => setA(r.staffId, k, Number(e.target.value) || 0)} placeholder="0" className="input !py-2 text-sm" /></label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <span className="text-sm text-muted">Total payout: <b className="font-display text-lg text-brand">{money(totalFor(r))}</b></span>
              <div className="ml-auto flex gap-2">
                <button onClick={() => payslip(r)} className="btn btn-ghost px-3 py-1.5 text-xs">🖨 Payslip / PDF</button>
                <button onClick={() => pay(r)} disabled={paid[r.staffId]} className="btn btn-primary px-4 py-1.5 text-xs disabled:opacity-50">{paid[r.staffId] ? "Paid" : "Mark as paid"}</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function History({ hdr }: { hdr: Record<string, string> }) {
  const [items, setItems] = useState<Payout[]>([]);
  const load = () => api.get<Payout[]>("/api/admin/payouts/history", hdr).then(setItems).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  async function del(id: number) { if (!confirm("Delete this payout record?")) return; await api.delete(`/api/admin/payouts/${id}`, hdr); load(); }
  const total = items.reduce((s, p) => s + p.total, 0);
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="font-display font-bold text-brand-dark">Payout history</p>
        <p className="text-sm text-muted">Total paid: <b className="text-ink">{money(total)}</b></p>
      </div>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? <p className="py-6 text-center text-muted">No payouts recorded yet.</p> : items.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 text-sm last:border-0">
            <span className="font-semibold text-ink">{p.staff?.name ?? "—"}</span>
            <span className="text-xs text-muted">{p.periodFrom} → {p.periodTo}</span>
            <span className="text-xs text-muted">· {new Date(p.paidAt).toLocaleDateString()}</span>
            <span className="ml-auto font-display font-bold text-brand">{money(p.total)}</span>
            <button onClick={() => del(p.id)} className="text-xs font-semibold text-red-500">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface-2 p-2 text-center"><p className="text-[10px] text-muted">{label}</p><p className="font-display font-bold text-ink">{value}</p></div>;
}
