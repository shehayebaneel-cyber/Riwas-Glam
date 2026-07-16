import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Alert = { type: string; severity: string; title: string; detail?: string; tab: string };
const DOT: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-500", info: "bg-brand" };

/** Bell in the admin header that surfaces every actionable alert in one dropdown. */
export function AlertsBell({ adminKey, onGo }: { adminKey: string; onGo: (tab: string) => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api
      .get<{ alerts: Alert[] }>("/api/admin/alerts", { "x-admin-key": adminKey })
      .then((d) => setAlerts(d.alerts ?? []))
      .catch(() => {});
  }, [adminKey]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="bg-surface-2 relative flex h-10 w-10 items-center justify-center rounded-full text-lg transition active:scale-90"
        aria-label="Alerts"
      >
        🔔
        {alerts.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {alerts.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="border-border bg-surface absolute right-0 z-50 mt-2 w-72 rounded-2xl border p-2 shadow-xl">
            <p className="text-muted px-2 py-1 text-xs font-bold uppercase tracking-wide">Alerts</p>
            {alerts.length === 0 ? (
              <p className="text-muted px-2 py-5 text-center text-sm">All clear 🎉</p>
            ) : (
              alerts.map((a, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onGo(a.tab);
                    setOpen(false);
                  }}
                  className="hover:bg-surface-2 flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition"
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[a.severity] ?? "bg-muted"}`} />
                  <span className="min-w-0">
                    <span className="text-ink block text-sm font-semibold">{a.title}</span>
                    {a.detail && <span className="text-muted block truncate text-xs">{a.detail}</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
