import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Row = { name: string; count: number; avgExpected: number; avgActual: number; diff: number };
type Data = { rows: Row[]; sampleSize: number; avgExpected: number; avgActual: number };

/** Scheduled vs actual service time, to tighten the booking calendar. */
export function DurationInsights({ adminKey }: { adminKey: string }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    api
      .get<Data>("/api/admin/analytics/duration", { "x-admin-key": adminKey })
      .then(setD)
      .catch(() => {});
  }, [adminKey]);
  if (!d || d.sampleSize === 0) return null;
  const overall = d.avgActual - d.avgExpected;
  return (
    <div className="card mb-4 p-4">
      <p className="font-display text-ink font-bold">
        ⏱ Duration insights <span className="text-muted text-xs font-normal">({d.sampleSize} recorded)</span>
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Mini label="Avg scheduled" value={`${d.avgExpected}m`} />
        <Mini label="Avg actual" value={`${d.avgActual}m`} />
        <Mini label="Avg diff" value={`${overall >= 0 ? "+" : ""}${overall}m`} />
      </div>
      <div className="mt-3 space-y-1">
        {d.rows.map((r) => (
          <div key={r.name} className="border-border flex justify-between border-b py-1 text-sm last:border-0">
            <span className="text-ink min-w-0 truncate">
              {r.name} <span className="text-muted">· {r.count}</span>
            </span>
            <span className="text-muted shrink-0">
              {r.avgExpected}m → <b className="text-ink">{r.avgActual}m</b>{" "}
              <span className={r.diff > 0 ? "text-amber-600" : r.diff < 0 ? "text-emerald-600" : "text-muted"}>
                ({r.diff >= 0 ? "+" : ""}
                {r.diff}m)
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-muted mt-2 text-[11px]">Record actual time on completed bookings (Bookings tab) to grow this.</p>
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
