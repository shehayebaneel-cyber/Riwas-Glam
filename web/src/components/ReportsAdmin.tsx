import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Row { staffId: number; staffName: string; appts: number; revenue: number; commission: number }

export function ReportsAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(now.toLocaleDateString("en-CA"));
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { api.get<{ rows: Row[] }>(`/api/admin/commissions?from=${from}&to=${to}`, H).then((d) => setRows(d.rows)).catch(() => setRows([])); /* eslint-disable-next-line */ }, [from, to]);

  const totalRev = (rows ?? []).reduce((s, r) => s + r.revenue, 0);
  const totalComm = (rows ?? []).reduce((s, r) => s + r.commission, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <p className="text-sm text-muted">Revenue & commission per specialist. Excludes cancelled appointments.</p>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input !w-auto !py-2" />
          <span className="text-muted">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input !w-auto !py-2" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Appointments" value={(rows ?? []).reduce((s, r) => s + r.appts, 0)} />
        <Stat label="Revenue" value={`$${Math.round(totalRev).toLocaleString()}`} />
        <Stat label="Commission owed" value={`$${Math.round(totalComm).toLocaleString()}`} />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
            <tr><th className="p-3">Specialist</th><th className="p-3 text-right">Appts</th><th className="p-3 text-right">Revenue</th><th className="p-3 text-right">Commission</th></tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={4} className="p-6 text-center text-muted">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-muted">No appointments in this range.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.staffId} className="border-t border-border">
                <td className="p-3 font-semibold text-ink">{r.staffName}</td>
                <td className="p-3 text-right">{r.appts}</td>
                <td className="p-3 text-right">${Math.round(r.revenue).toLocaleString()}</td>
                <td className="p-3 text-right font-bold text-brand-dark">${Math.round(r.commission).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="card p-3 text-center"><p className="text-xs text-muted">{label}</p><p className="font-display text-xl font-extrabold text-ink">{value}</p></div>;
}
