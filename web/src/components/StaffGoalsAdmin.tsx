import { useEffect, useState } from "react";
import { api } from "../lib/api";

const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
type Row = { staffId: number; name: string; revenueTarget: number; appointmentsTarget: number; revenue: number; appointments: number; commission: number };

function Bar({ value, target, label, fmt }: { value: number; target: number; label: string; fmt: (n: number) => string }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="text-ink font-semibold">
          {fmt(value)}
          {target > 0 ? ` / ${fmt(target)} · ${pct}%` : ""}
        </span>
      </div>
      <div className="bg-surface-2 mt-1 h-2 rounded-full">
        <div className={`h-2 rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function StaffGoalsAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Row[] | null>(null);
  const load = () =>
    api
      .get<{ staff: Row[] }>(`/api/admin/staff-goals?month=${month}`, H)
      .then((d) => setRows(d.staff))
      .catch(() => setRows([]));
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [month]);
  function save(r: Row, patch: Partial<Row>) {
    const next = { ...r, ...patch };
    setRows((rs) => (rs ?? []).map((x) => (x.staffId === r.staffId ? next : x)));
    api
      .post("/api/admin/staff-goals", { staffId: r.staffId, month, revenueTarget: next.revenueTarget, appointmentsTarget: next.appointmentsTarget }, H)
      .catch(() => {});
  }
  if (!rows) return <div className="text-muted py-10 text-center">Loading…</div>;

  return (
    <div className="space-y-3">
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input !w-auto !py-2 text-sm" />
      {rows.length === 0 ? (
        <div className="card text-muted p-8 text-center">No active staff.</div>
      ) : (
        rows.map((r) => (
          <div key={r.staffId} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-ink font-semibold">{r.name}</p>
              <p className="text-muted text-xs">
                Commission earned: <b className="text-brand">{money(r.commission)}</b>
              </p>
            </div>
            <div className="mt-3 space-y-2.5">
              <Bar value={r.revenue} target={r.revenueTarget} label="Revenue" fmt={money} />
              <Bar value={r.appointments} target={r.appointmentsTarget} label="Appointments" fmt={(n) => String(n)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-ink text-xs font-semibold">
                Revenue target
                <input
                  type="number"
                  defaultValue={r.revenueTarget || ""}
                  onBlur={(e) => save(r, { revenueTarget: Number(e.target.value) })}
                  placeholder="0"
                  className="input mt-1 !py-1.5 text-sm"
                />
              </label>
              <label className="text-ink text-xs font-semibold">
                Appointments target
                <input
                  type="number"
                  defaultValue={r.appointmentsTarget || ""}
                  onBlur={(e) => save(r, { appointmentsTarget: Number(e.target.value) })}
                  placeholder="0"
                  className="input mt-1 !py-1.5 text-sm"
                />
              </label>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
