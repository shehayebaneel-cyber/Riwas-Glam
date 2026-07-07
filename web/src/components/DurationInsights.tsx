import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Row = { name: string; count: number; avgExpected: number; avgActual: number; diff: number };
type Data = { rows: Row[]; sampleSize: number; avgExpected: number; avgActual: number };

/** Scheduled vs actual service time, to tighten the booking calendar. */
export function DurationInsights({ adminKey }: { adminKey: string }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { api.get<Data>("/api/admin/analytics/duration", { "x-admin-key": adminKey }).then(setD).catch(() => {}); }, [adminKey]);
  if (!d || d.sampleSize === 0) return null;
  const overall = d.avgActual - d.avgExpected;
  return (
    <div className="card mb-4 p-4">
      <p className="font-display font-bold text-ink">⏱ Duration insights <span className="text-xs font-normal text-muted">({d.sampleSize} recorded)</span></p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Mini label="Avg scheduled" value={`${d.avgExpected}m`} />
        <Mini label="Avg actual" value={`${d.avgActual}m`} />
        <Mini label="Avg diff" value={`${overall >= 0 ? "+" : ""}${overall}m`} />
      </div>
      <div className="mt-3 space-y-1">
        {d.rows.map((r) => (
          <div key={r.name} className="flex justify-between border-b border-border py-1 text-sm last:border-0">
            <span className="min-w-0 truncate text-ink">{r.name} <span className="text-muted">· {r.count}</span></span>
            <span className="shrink-0 text-muted">{r.avgExpected}m → <b className="text-ink">{r.avgActual}m</b> <span className={r.diff > 0 ? "text-amber-600" : r.diff < 0 ? "text-emerald-600" : "text-muted"}>({r.diff >= 0 ? "+" : ""}{r.diff}m)</span></span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">Record actual time on completed bookings (Bookings tab) to grow this.</p>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface-2 p-2 text-center"><p className="text-[10px] text-muted">{label}</p><p className="font-display font-bold text-ink">{value}</p></div>;
}
