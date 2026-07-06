import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { SITE } from "../config";

const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

type Report = {
  date: string; revenue: number; profit: number; material: number; commission: number; expenses: number;
  cashReceived: number; whishReceived: number; totalReceived: number; giftCardsSold: number;
  appointmentsCompleted: number; cancelled: number; noShows: number; booked: number;
  inventoryConsumed: { count: number; value: number; items: { name: string; qty: number }[] };
  staffCommissions: { name: string; amount: number }[];
};

export function DayCloseAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [r, setR] = useState<Report | null>(null);
  useEffect(() => { setR(null); api.get<Report>(`/api/admin/reports/daily-closing?date=${date}`, H).then(setR).catch(() => {}); /* eslint-disable-next-line */ }, [date]);

  function downloadCSV() {
    if (!r) return;
    const rows: [string, string | number][] = [
      ["Date", r.date], ["Revenue", r.revenue], ["Profit", r.profit],
      ["Cash received", r.cashReceived], ["Whish received", r.whishReceived], ["Total received", r.totalReceived],
      ["Gift cards sold", r.giftCardsSold], ["Material cost", r.material], ["Commissions", r.commission], ["Expenses", r.expenses],
      ["Appointments completed", r.appointmentsCompleted], ["Cancelled", r.cancelled], ["No-shows", r.noShows], ["Still booked", r.booked],
      ["Inventory items consumed", r.inventoryConsumed.count], ["Inventory value", r.inventoryConsumed.value],
      ...r.staffCommissions.map((s) => [`Commission · ${s.name}`, s.amount] as [string, number]),
    ];
    const csv = "data:text/csv;charset=utf-8," + encodeURIComponent(rows.map(([k, v]) => `"${k}",${v}`).join("\n"));
    const a = document.createElement("a"); a.href = csv; a.download = `daily-closing-${r.date}.csv`; a.click();
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input !w-auto !py-2 text-sm" />
        <button onClick={downloadCSV} disabled={!r} className="btn btn-ghost px-4 py-2 text-sm disabled:opacity-50">Download CSV</button>
        <button onClick={() => window.print()} disabled={!r} className="btn btn-primary px-4 py-2 text-sm disabled:opacity-50">Print / Save PDF</button>
      </div>

      {!r ? <p className="py-10 text-center text-muted">Loading…</p> : (
        <div className="printable card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-display text-xl font-extrabold text-ink">{SITE.name}</p>
              <p className="text-sm text-muted">Daily closing report</p>
            </div>
            <p className="text-sm font-semibold text-ink">{new Date(r.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Big label="Revenue" value={money(r.revenue)} />
            <Big label="Profit" value={money(r.profit)} tone={r.profit >= 0 ? "text-emerald-600" : "text-red-500"} />
            <Big label="Cash" value={money(r.cashReceived)} />
            <Big label="Whish" value={money(r.whishReceived)} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Money</p>
              <Row k="Total received" v={money(r.totalReceived)} />
              <Row k="Gift cards sold" v={money(r.giftCardsSold)} />
              <Row k="Material cost" v={money(r.material)} />
              <Row k="Commissions" v={money(r.commission)} />
              <Row k="Expenses" v={money(r.expenses)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Appointments</p>
              <Row k="Completed" v={String(r.appointmentsCompleted)} />
              <Row k="Cancelled" v={String(r.cancelled)} />
              <Row k="No-shows" v={String(r.noShows)} />
              <Row k="Still booked" v={String(r.booked)} />
              <Row k="Inventory consumed" v={`${r.inventoryConsumed.count} · ${money(r.inventoryConsumed.value)}`} />
            </div>
          </div>

          {r.staffCommissions.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Staff commissions</p>
              {r.staffCommissions.map((s) => <Row key={s.name} k={s.name} v={money(s.amount)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Big({ label, value, tone = "text-ink" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl bg-surface-2 p-3 text-center"><p className="text-xs text-muted">{label}</p><p className={`font-display text-lg font-extrabold ${tone}`}>{value}</p></div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between border-b border-border py-1.5 text-sm last:border-0"><span className="text-muted">{k}</span><span className="font-semibold text-ink">{v}</span></div>;
}
