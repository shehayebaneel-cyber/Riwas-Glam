import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SITE } from "../config";
import { api, money } from "../lib/api";
import { NewBookingModal } from "../components/NewBookingModal";
import { GiftCardPayModal } from "../components/GiftCardPayModal";
import { todayIso as salonToday, nowMinutes, parseDay } from "../lib/time";
import type { Appointment, DaySchedule } from "../types";

const TKEY = "staff-token";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_START = 8,
  DAY_END = 21,
  PXH = 56; // calendar window 08:00–21:00, 56px/hour
const GRID_H = (DAY_END - DAY_START) * PXH;
const toMin = (t: string) => {
  const [h, m] = (t || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};
const iso = (d: Date) => d.toLocaleDateString("en-CA");
const fmtHour = (h: number) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const BADGE: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/15 text-emerald-600",
  COMPLETED: "bg-brand-soft text-brand-dark",
  CANCELLED: "bg-red-500/15 text-red-500",
  NO_SHOW: "bg-amber-400/15 text-amber-600",
};
const BLOCK: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/90 text-white",
  COMPLETED: "bg-brand text-white",
  CANCELLED: "bg-red-300/70 text-white line-through",
  NO_SHOW: "bg-amber-400/90 text-white",
};

// Lay out a day's appointments, splitting overlapping ones into side-by-side columns.
type Placed = { a: Appointment; top: number; height: number; leftPct: number; widthPct: number };
function layoutDay(list: Appointment[]): Placed[] {
  const items = list.map((a) => ({ a, start: toMin(a.time), end: toMin(a.time) + (a.durationMin || 30) })).sort((x, y) => x.start - y.start || x.end - y.end);
  const placed: Placed[] = [];
  let group: { a: Appointment; start: number; end: number; col: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    if (group.length) {
      const cols = Math.max(...group.map((g) => g.col)) + 1;
      for (const g of group) {
        placed.push({
          a: g.a,
          top: Math.max(0, (g.start - DAY_START * 60) * (PXH / 60)),
          height: Math.max(24, (g.end - g.start) * (PXH / 60) - 2),
          leftPct: (g.col / cols) * 100,
          widthPct: (1 / cols) * 100,
        });
      }
    }
    group = [];
    groupEnd = -1;
  };
  for (const it of items) {
    if (group.length && it.start >= groupEnd) flush();
    const used = new Set(group.filter((g) => g.end > it.start).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ ...it, col });
    groupEnd = Math.max(groupEnd, it.end);
  }
  flush();
  return placed;
}

export function StaffPortal() {
  const [token, setToken] = useState(() => localStorage.getItem(TKEY) ?? "");
  const [me, setMe] = useState<{ name: string; role: string; commissionPct: number; schedule: DaySchedule[] } | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [anchor, setAnchor] = useState(() => parseDay(salonToday())); // any day inside the shown week (Beirut)
  const [byDate, setByDate] = useState<Record<string, Appointment[]>>({});
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [newB, setNewB] = useState<{ date: string; time: string } | null>(null);
  const [giftFor, setGiftFor] = useState<Appointment | null>(null);
  const H = { "x-staff-token": token };
  const A = { "x-admin-key": token }; // same token also authorises admin reads if the staff has permissions
  const canSeeAll = perms.includes("bookings"); // receptionists/managers see the whole salon's schedule

  const days = useMemo(() => {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchor]);
  const weekKey = days[0] ? iso(days[0]) : "";

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    Promise.all([api.get<typeof me>("/api/staff/me", H), api.get<{ permissions: string[] }>("/api/admin/me", A).catch(() => ({ permissions: [] as string[] }))])
      .then(([m, adm]) => {
        setMe(m);
        setPerms(adm.permissions || []);
      })
      .catch(() => {
        localStorage.removeItem(TKEY);
        setToken("");
      })
      .finally(() => setChecking(false));
    // eslint-disable-next-line
  }, [token]);

  const loadWeek = () => {
    if (!token) return;
    const fetchDay = (d: Date) =>
      canSeeAll ? api.get<Appointment[]>(`/api/admin/appointments?date=${iso(d)}`, A) : api.get<Appointment[]>(`/api/staff/me/appointments?date=${iso(d)}`, H);
    Promise.all(
      days.map((d) =>
        fetchDay(d)
          .then((a) => [iso(d), a] as const)
          .catch(() => [iso(d), [] as Appointment[]] as const),
      ),
    ).then((entries) => setByDate(Object.fromEntries(entries)));
  };
  useEffect(() => {
    loadWeek(); /* eslint-disable-next-line */
  }, [token, weekKey, canSeeAll]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const r = await api.post<{ token: string }>("/api/staff/login", { email, password: pw });
      localStorage.setItem(TKEY, r.token);
      setToken(r.token);
    } catch {
      setErr("Wrong email or password.");
    }
  }
  function logout() {
    localStorage.removeItem(TKEY);
    setToken("");
    setMe(null);
    setPerms([]);
  }
  const setStatus = (a: Appointment, status: string) => {
    const req = canSeeAll ? api.patch(`/api/admin/appointments/${a.id}`, { status }, A) : api.patch(`/api/staff/me/appointments/${a.id}`, { status }, H);
    return req.then(() => {
      setSelected(null);
      loadWeek();
    });
  };

  if (checking) return <div className="text-muted p-16 text-center">Loading…</div>;

  if (!token || !me) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24">
        <h1 className="font-display text-ink text-center text-2xl font-extrabold">{SITE.name} · Staff</h1>
        <form onSubmit={login} className="card mt-6 space-y-3 p-6">
          <p className="text-muted text-sm">Log in to see your appointments.</p>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email or username" className="input" autoFocus />
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" className="input" />
          {err && <p className="text-sm font-medium text-red-600">{err}</p>}
          <button className="btn btn-primary w-full py-2.5">Log in</button>
        </form>
        <Link to="/" className="text-muted hover:text-ink mt-4 block text-center text-sm">
          ← Back to site
        </Link>
      </div>
    );
  }

  const weekAppts = Object.values(byDate).flat();
  const active = weekAppts.filter((a) => a.status !== "CANCELLED");
  const revenue = active.reduce((s, a) => s + a.price, 0);
  const commission = active.reduce((s, a) => s + (a.commissionAmount ?? 0), 0);
  const completed = active.filter((a) => a.status === "COMPLETED").length;
  const todayIso = salonToday();
  const nowMin = nowMinutes();
  const shift = (n: number) =>
    setAnchor((a) => {
      const d = new Date(a);
      d.setDate(d.getDate() + n * 7);
      return d;
    });

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-5 sm:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-ink text-2xl font-extrabold">Hi, {me.name} 👋</h1>
          <p className="text-muted text-sm">
            {me.role}
            {canSeeAll ? " · all bookings" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canSeeAll && (
            <Link to="/admin" onClick={() => localStorage.setItem("riwa-admin-key", token)} className="btn btn-ghost px-4 py-2 text-sm">
              ⚙ Full dashboard
            </Link>
          )}
          {canSeeAll && (
            <button onClick={() => setNewB({ date: todayIso, time: "" })} className="btn btn-primary px-4 py-2 text-sm">
              + New booking
            </button>
          )}
          <button onClick={logout} className="btn btn-ghost px-3 py-2 text-sm">
            Log out
          </button>
        </div>
      </div>

      {/* Week nav */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => shift(-1)}
            className="text-ink hover:bg-surface-2 flex h-9 w-9 items-center justify-center rounded-full text-lg transition"
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            onClick={() => setAnchor(parseDay(salonToday()))}
            className="border-border text-ink hover:border-brand hover:text-brand rounded-full border px-3 py-1.5 text-sm font-semibold transition"
          >
            Today
          </button>
          <button
            onClick={() => shift(1)}
            className="text-ink hover:bg-surface-2 flex h-9 w-9 items-center justify-center rounded-full text-lg transition"
            aria-label="Next week"
          >
            ›
          </button>
        </div>
        <p className="text-ink text-sm font-semibold sm:text-base">
          {fmtDay(days[0])} – {fmtDay(days[6])}, {days[6].getFullYear()}
        </p>
      </div>

      {/* Week stats */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Appointments" value={active.length} />
        <Stat label="Revenue" value={money(revenue)} />
        {canSeeAll ? <Stat label="Completed" value={completed} /> : <Stat label="Commission" value={money(commission)} />}
      </div>

      {/* Calendar grid (horizontally scrollable on mobile) */}
      <div className="no-scrollbar border-border bg-surface mt-4 overflow-x-auto rounded-2xl border shadow-[0_18px_46px_-24px_rgba(176,104,127,0.32)]">
        <div className="min-w-[760px]">
          {/* Day headers */}
          <div className="border-border grid border-b" style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}>
            <div />
            {days.map((d) => {
              const isToday = iso(d) === todayIso;
              const off = !canSeeAll && me.schedule?.[d.getDay()]?.off;
              return (
                <div key={iso(d)} className={`border-border border-s py-2 text-center ${isToday ? "bg-brand-soft/50" : ""}`}>
                  <p className="text-muted text-[11px] font-semibold uppercase tracking-wide">{DOW[d.getDay()]}</p>
                  <p className={`font-display text-lg font-extrabold ${isToday ? "text-brand" : "text-ink"}`}>{d.getDate()}</p>
                  {off && <p className="text-muted/70 text-[9px] uppercase tracking-wide">off</p>}
                </div>
              );
            })}
          </div>
          {/* Time rows + day columns */}
          <div className="grid" style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}>
            {/* Time labels */}
            <div className="relative" style={{ height: GRID_H }}>
              {Array.from({ length: DAY_END - DAY_START }, (_, i) => (
                <div key={i} className="text-muted absolute right-1.5 -translate-y-1/2 text-[10px]" style={{ top: i * PXH }}>
                  {fmtHour(DAY_START + i)}
                </div>
              ))}
            </div>
            {/* Day columns */}
            {days.map((d) => {
              const isToday = iso(d) === todayIso;
              return (
                <div
                  key={iso(d)}
                  onClick={(e) => {
                    if (!canSeeAll) return;
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    const raw = DAY_START * 60 + Math.round(((y / PXH) * 60) / 15) * 15;
                    const min = Math.max(DAY_START * 60, Math.min(DAY_END * 60 - 15, raw));
                    const hh = String(Math.floor(min / 60)).padStart(2, "0");
                    const mm = String(min % 60).padStart(2, "0");
                    setNewB({ date: iso(d), time: hh + ":" + mm });
                  }}
                  className={`border-border relative border-s ${isToday ? "bg-brand-soft/15" : ""} ${canSeeAll ? "cursor-pointer" : ""}`}
                  style={{ height: GRID_H }}
                >
                  {/* hour gridlines */}
                  {Array.from({ length: DAY_END - DAY_START }, (_, i) => (
                    <div key={i} className="border-border/50 absolute inset-x-0 border-t" style={{ top: i * PXH }} />
                  ))}
                  {/* now line */}
                  {isToday && nowMin >= DAY_START * 60 && nowMin <= DAY_END * 60 && (
                    <div className="absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: (nowMin - DAY_START * 60) * (PXH / 60) }}>
                      <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
                    </div>
                  )}
                  {/* appointments (overlap-aware) */}
                  {layoutDay(byDate[iso(d)] ?? []).map(({ a, top, height, leftPct, widthPct }) => (
                    <button
                      key={a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(a);
                      }}
                      style={{ top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)` }}
                      className={`absolute z-[5] overflow-hidden rounded-lg px-1.5 py-1 text-left shadow-sm transition hover:brightness-105 ${BLOCK[a.status] ?? "bg-surface-2 text-ink"}`}
                    >
                      <p className="truncate text-[10px] font-bold leading-tight">
                        {a.time} · {a.serviceName}
                      </p>
                      <p className="truncate text-[10px] leading-tight opacity-90">{canSeeAll && a.staffName ? a.staffName : a.customerName}</p>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-muted mt-2 text-center text-[11px] sm:hidden">← swipe the calendar sideways to see the whole week →</p>

      {/* Appointment detail / actions */}
      {selected && (
        <div
          className="bg-ink/40 fixed inset-0 z-50 flex items-end justify-center p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setSelected(null)}
        >
          <div className="bg-surface w-full max-w-md rounded-t-3xl p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-brand-dark text-xl font-extrabold">
                  {selected.time} · {selected.serviceName}
                </p>
                <p className="text-muted text-sm">
                  {new Date(selected.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} ·{" "}
                  {selected.durationMin} min
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${BADGE[selected.status] ?? "bg-surface-2 text-muted"}`}>
                {selected.status.replace("_", " ").toLowerCase()}
              </span>
            </div>
            <div className="mt-4 space-y-1 text-sm">
              <p className="text-ink">
                <span className="text-muted">Client:</span> {selected.customerName}
              </p>
              <p className="text-ink">
                <span className="text-muted">Phone:</span>{" "}
                <a href={`tel:${selected.customerPhone}`} className="text-brand font-semibold">
                  {selected.customerPhone}
                </a>
              </p>
              {canSeeAll && selected.staffName && (
                <p className="text-ink">
                  <span className="text-muted">With:</span> {selected.staffName}
                </p>
              )}
              <p className="text-ink">
                <span className="text-muted">Price:</span> {money(selected.price)}
              </p>
              {selected.note && (
                <p className="text-ink">
                  <span className="text-muted">Note:</span> “{selected.note}”
                </p>
              )}
            </div>
            {selected.status === "CONFIRMED" && (
              <div className="mt-5 grid grid-cols-3 gap-2">
                <button
                  onClick={() => setStatus(selected, "COMPLETED")}
                  className="rounded-xl bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-600 transition active:scale-95"
                >
                  Done
                </button>
                <button
                  onClick={() => setStatus(selected, "NO_SHOW")}
                  className="rounded-xl bg-amber-400/15 py-2.5 text-sm font-semibold text-amber-600 transition active:scale-95"
                >
                  No-show
                </button>
                <button
                  onClick={() => setStatus(selected, "CANCELLED")}
                  className="rounded-xl bg-red-500/15 py-2.5 text-sm font-semibold text-red-500 transition active:scale-95"
                >
                  Cancel
                </button>
              </div>
            )}
            {canSeeAll && selected.paymentStatus !== "PAID" && selected.status !== "CANCELLED" && (
              <button
                onClick={() => setGiftFor(selected)}
                className="bg-brand-soft text-brand-dark mt-3 w-full rounded-xl py-2.5 text-sm font-semibold transition active:scale-[0.98]"
              >
                🎀 Pay with gift card
              </button>
            )}
            <button
              onClick={() => setSelected(null)}
              className="bg-surface-2 text-ink mt-3 w-full rounded-xl py-2.5 text-sm font-semibold transition active:scale-[0.98]"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {newB && (
        <NewBookingModal
          adminKey={token}
          defaultDate={newB.date}
          defaultTime={newB.time}
          onClose={() => setNewB(null)}
          onCreated={() => {
            setNewB(null);
            loadWeek();
          }}
        />
      )}
      {giftFor && (
        <GiftCardPayModal
          adminKey={token}
          appointment={giftFor}
          onClose={() => setGiftFor(null)}
          onPaid={() => {
            setGiftFor(null);
            setSelected(null);
            loadWeek();
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-3 text-center">
      <p className="text-muted text-xs">{label}</p>
      <p className="font-display text-ink text-xl font-extrabold">{value}</p>
    </div>
  );
}
