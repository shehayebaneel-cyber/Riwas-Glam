import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Entry = { id: number; actor: string; action: string; detail: string; ip: string; createdAt: string };

/** Read-only audit trail of every change made in the admin dashboard. */
export function ActivityAdmin({ adminKey }: { adminKey: string }) {
  const [items, setItems] = useState<Entry[] | null>(null);
  useEffect(() => { api.get<Entry[]>("/api/admin/activity", { "x-admin-key": adminKey }).then(setItems).catch(() => setItems([])); }, [adminKey]);
  if (!items) return <div className="py-10 text-center text-muted">Loading…</div>;
  if (!items.length) return <div className="card p-10 text-center text-muted">No admin activity recorded yet.</div>;
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted">Every change made in the admin, most recent first.</p>
      {items.map((e) => (
        <div key={e.id} className="card p-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="font-semibold text-ink">{e.actor}</span>
            <span className="text-muted">{e.action}</span>
            <span className="ml-auto text-xs text-muted/70">{new Date(e.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted/60">{e.detail}{e.ip ? ` · ${e.ip}` : ""}</p>
        </div>
      ))}
    </div>
  );
}
