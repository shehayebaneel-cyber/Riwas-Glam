import { useEffect, useState } from "react";
import { api } from "../lib/api";

const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
type Row = { id: number | null; name: string; isDefault: boolean; staffCount: number; bookings: number; revenue: number; profit: number };

/** Side-by-side branch comparison (only interesting once there are 2+ branches). */
export function BranchAnalytics({ adminKey }: { adminKey: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { api.get<Row[]>("/api/admin/analytics/branches", { "x-admin-key": adminKey }).then(setRows).catch(() => {}); }, [adminKey]);
  if (!rows || rows.length < 2) return null; // single branch → nothing to compare
  return (
    <div className="card mb-4 p-4">
      <p className="font-display font-bold text-ink">🏢 Branch comparison <span className="text-xs font-normal text-muted">(all-time, completed)</span></p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="py-1 pr-2 font-semibold">Branch</th><th className="py-1 px-2 font-semibold">Staff</th><th className="py-1 px-2 font-semibold">Bookings</th><th className="py-1 px-2 font-semibold">Revenue</th><th className="py-1 pl-2 font-semibold">Profit</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id ?? "none"} className="border-t border-border">
                <td className="py-1.5 pr-2 font-semibold text-ink">{r.name}{r.isDefault ? " ·" : ""}<span className="text-[10px] text-brand">{r.isDefault ? " main" : ""}</span></td>
                <td className="px-2 text-muted">{r.staffCount}</td>
                <td className="px-2 text-muted">{r.bookings}</td>
                <td className="px-2 font-semibold text-ink">{money(r.revenue)}</td>
                <td className={`pl-2 font-semibold ${r.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{money(r.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
