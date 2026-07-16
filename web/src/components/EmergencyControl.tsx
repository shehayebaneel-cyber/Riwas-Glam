import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Status = { closed: boolean; message: string };

/** One-tap temporary close: pauses online booking and shows a site-wide notice. */
export function EmergencyControl({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    api
      .get<Status>("/api/admin/settings/emergency", H)
      .then(setS)
      .catch(() => {}); /* eslint-disable-next-line */
  }, []);
  if (!s) return null;
  const save = (next: Status) => {
    setS(next);
    api.post("/api/admin/settings/emergency", next, H).catch(() => {});
  };

  return (
    <div className={`mb-3 rounded-2xl border p-3 ${s.closed ? "border-red-300 bg-red-500/10" : "border-border bg-surface"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ink text-sm font-bold">{s.closed ? "🔴 Temporarily closed" : "🟢 Open for bookings"}</p>
          <p className="text-muted text-xs">
            {s.closed ? "Online booking is paused and a notice shows on your site." : "Customers can book online as normal."}
          </p>
        </div>
        <button onClick={() => save({ ...s, closed: !s.closed })} className={`btn px-4 py-2 text-sm ${s.closed ? "btn-primary" : "btn-ghost text-red-500"}`}>
          {s.closed ? "Reopen" : "Close now"}
        </button>
      </div>
      {s.closed && (
        <input
          value={s.message}
          onChange={(e) => setS({ ...s, message: e.target.value })}
          onBlur={() => save(s)}
          placeholder="Notice shown to customers (e.g. Closed for the holiday — back Monday)"
          className="input mt-2 !py-2 text-sm"
        />
      )}
    </div>
  );
}
