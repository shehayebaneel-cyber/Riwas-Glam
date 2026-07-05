import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SITE } from "../config";
import { api, money } from "../lib/api";
import type { Appointment, DaySchedule } from "../types";

const TKEY = "staff-token";
const BADGE: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/15 text-emerald-600", COMPLETED: "bg-brand-soft text-brand-dark",
  CANCELLED: "bg-red-500/15 text-red-500", NO_SHOW: "bg-amber-400/15 text-amber-600",
};

export function StaffPortal() {
  const [token, setToken] = useState(() => localStorage.getItem(TKEY) ?? "");
  const [me, setMe] = useState<{ name: string; role: string; commissionPct: number; schedule: DaySchedule[] } | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [appts, setAppts] = useState<Appointment[]>([]);
  const H = { "x-staff-token": token };

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    api.get<typeof me>("/api/staff/me", H).then(setMe).catch(() => { localStorage.removeItem(TKEY); setToken(""); }).finally(() => setChecking(false));
    // eslint-disable-next-line
  }, [token]);

  const load = () => { if (token) api.get<Appointment[]>(`/api/staff/me/appointments?date=${date}`, H).then(setAppts).catch(() => {}); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [token, date]);

  async function login(e: FormEvent) {
    e.preventDefault(); setErr("");
    try { const r = await api.post<{ token: string }>("/api/staff/login", { email, password: pw }); localStorage.setItem(TKEY, r.token); setToken(r.token); }
    catch { setErr("Wrong email or password."); }
  }
  function logout() { localStorage.removeItem(TKEY); setToken(""); setMe(null); }
  const setStatus = (a: Appointment, status: string) => api.patch(`/api/staff/me/appointments/${a.id}`, { status }, H).then(load);

  if (checking) return <div className="p-16 text-center text-muted">Loading…</div>;

  if (!token || !me) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24">
        <h1 className="text-center font-display text-2xl font-extrabold text-ink">{SITE.name} · Staff</h1>
        <form onSubmit={login} className="card mt-6 space-y-3 p-6">
          <p className="text-sm text-muted">Log in to see your appointments.</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email or username" className="input" autoFocus />
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" className="input" />
          {err && <p className="text-sm font-medium text-red-600">{err}</p>}
          <button className="btn btn-primary w-full py-2.5">Log in</button>
        </form>
        <Link to="/" className="mt-4 block text-center text-sm text-muted hover:text-ink">← Back to site</Link>
      </div>
    );
  }

  const dow = new Date(date + "T00:00:00").getDay();
  const day = me.schedule?.[dow];
  const off = !day || day.off;
  const active = appts.filter((a) => a.status !== "CANCELLED");
  const revenue = active.reduce((s, a) => s + a.price, 0);
  const commission = active.reduce((s, a) => s + (a.commissionAmount ?? 0), 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Hi, {me.name} 👋</h1>
          <p className="text-sm text-muted">{me.role}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input !w-auto !py-2 text-sm" />
          <button onClick={logout} className="btn btn-ghost px-3 py-2 text-sm">Log out</button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat label="Appointments" value={active.length} />
        <Stat label="Revenue" value={money(revenue)} />
        <Stat label="Your commission" value={money(commission)} />
      </div>

      <p className="mt-4 text-sm text-muted">{off ? "You're not scheduled to work this day." : `Working ${day!.open}–${day!.close}${day!.breakStart ? ` · break ${day!.breakStart}–${day!.breakEnd}` : ""}`}</p>

      <div className="mt-3 space-y-2">
        {appts.length === 0 ? (
          <div className="card p-10 text-center text-muted">No appointments on this day.</div>
        ) : appts.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-bold text-brand-dark">{a.time}</span>
              <span className="font-semibold text-ink">{a.serviceName}</span>
              <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold ${BADGE[a.status] ?? "bg-surface-2 text-muted"}`}>{a.status.replace("_", " ").toLowerCase()}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{a.customerName} · <a href={`tel:${a.customerPhone}`} className="text-brand">{a.customerPhone}</a> · {money(a.price)}{a.note ? ` · “${a.note}”` : ""}</p>
            {a.status === "CONFIRMED" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setStatus(a, "COMPLETED")} className="btn btn-ghost px-3 py-1.5 text-xs text-emerald-600">Mark done</button>
                <button onClick={() => setStatus(a, "NO_SHOW")} className="btn btn-ghost px-3 py-1.5 text-xs text-amber-600">No-show</button>
                <button onClick={() => setStatus(a, "CANCELLED")} className="btn btn-ghost px-3 py-1.5 text-xs text-red-500">Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="card p-3 text-center"><p className="text-xs text-muted">{label}</p><p className="font-display text-xl font-extrabold text-ink">{value}</p></div>;
}
