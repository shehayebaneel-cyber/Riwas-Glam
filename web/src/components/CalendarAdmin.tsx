import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { todayIso } from "../lib/time";
import type { Appointment, StaffFull } from "../types";

export function CalendarAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [date, setDate] = useState(todayIso());
  const [staff, setStaff] = useState<StaffFull[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  useEffect(() => { api.get<StaffFull[]>("/api/admin/staff", H).then(setStaff).catch(() => {}); /* eslint-disable-next-line */ }, []);
  useEffect(() => { api.get<Appointment[]>(`/api/admin/appointments?date=${date}`, H).then(setAppts).catch(() => setAppts([])); /* eslint-disable-next-line */ }, [date]);

  const dow = new Date(date + "T00:00:00").getDay();
  const active = staff.filter((s) => s.isActive);
  const forStaff = (id: number) => appts.filter((a) => a.staffId === id && a.status !== "CANCELLED").sort((a, b) => a.time.localeCompare(b.time));
  const unassigned = appts.filter((a) => !a.staffId && a.status !== "CANCELLED");

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Each specialist's day at a glance.</p>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input !w-auto !py-2 text-sm" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((s) => {
          const day = s.schedule?.[dow];
          const blocked = s.blockedDates?.includes(date);
          const off = blocked || !day || day.off;
          const list = forStaff(s.id);
          return (
            <div key={s.id} className="card p-3">
              <div className="flex items-center justify-between">
                <p className="font-display font-bold text-ink">{s.name}</p>
                <span className={`text-xs font-semibold ${off ? "text-red-500" : "text-emerald-600"}`}>{blocked ? "Blocked" : off ? "Day off" : `${day!.open}–${day!.close}`}</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {list.length === 0 ? <p className="py-3 text-center text-xs text-muted">{off ? "Not working" : "No appointments"}</p> : list.map((a) => (
                  <div key={a.id} className="rounded-lg border border-border p-2 text-sm">
                    <p className="font-semibold text-ink"><span className="text-brand-dark">{a.time}</span> · {a.serviceName}</p>
                    <p className="text-xs text-muted">{a.customerName} · {a.customerPhone}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {unassigned.length > 0 && (
          <div className="card border-dashed p-3">
            <p className="font-display font-bold text-muted">Unassigned</p>
            <div className="mt-2 space-y-1.5">
              {unassigned.map((a) => (
                <div key={a.id} className="rounded-lg border border-border p-2 text-sm">
                  <p className="font-semibold text-ink"><span className="text-brand-dark">{a.time}</span> · {a.serviceName}</p>
                  <p className="text-xs text-muted">{a.customerName} · {a.customerPhone}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
