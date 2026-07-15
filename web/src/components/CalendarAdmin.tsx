import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { addDaysIso, nowMinutes, parseDay, todayIso, weekOf } from "../lib/time";
import { waLink, waMessages } from "../lib/whatsapp";
import type { Appointment, StaffFull } from "../types";
import { GiftCardPayModal } from "./GiftCardPayModal";
import { NewBookingModal } from "./NewBookingModal";

// Views are intentionally open-ended so a "month" grid can slot in later.
type View = "day" | "week";
const HOUR_H = 84; // px per hour in the week grid
const GUTTER = 60; // px width of the time-label column

// Fresha-style: each STAFF member gets their own colour; status is a small
// marker on the block (✓ done, ⚠ no-show, ✕ cancelled, ◔ pending) instead of
// driving the whole colour. Class strings are literal so Tailwind keeps them.
type Theme = { bg: string; border: string; text: string; dot: string };
const PALETTE: Theme[] = [
  { bg: "bg-rose-100", border: "border-rose-500", text: "text-rose-800", dot: "bg-rose-500" },
  { bg: "bg-violet-100", border: "border-violet-500", text: "text-violet-800", dot: "bg-violet-500" },
  { bg: "bg-sky-100", border: "border-sky-500", text: "text-sky-800", dot: "bg-sky-500" },
  { bg: "bg-amber-100", border: "border-amber-500", text: "text-amber-900", dot: "bg-amber-500" },
  { bg: "bg-emerald-100", border: "border-emerald-500", text: "text-emerald-800", dot: "bg-emerald-500" },
  { bg: "bg-fuchsia-100", border: "border-fuchsia-500", text: "text-fuchsia-800", dot: "bg-fuchsia-500" },
  { bg: "bg-teal-100", border: "border-teal-500", text: "text-teal-800", dot: "bg-teal-500" },
  { bg: "bg-indigo-100", border: "border-indigo-500", text: "text-indigo-800", dot: "bg-indigo-500" },
  { bg: "bg-orange-100", border: "border-orange-500", text: "text-orange-900", dot: "bg-orange-500" },
  { bg: "bg-cyan-100", border: "border-cyan-500", text: "text-cyan-800", dot: "bg-cyan-500" },
];
const NEUTRAL: Theme = { bg: "bg-slate-100", border: "border-slate-400", text: "text-slate-700", dot: "bg-slate-400" };
const STATUS_MARK: Record<string, string> = { COMPLETED: "✓", NO_SHOW: "⚠", CANCELLED: "✕", PENDING: "◔" };

// Status chip (used in the day list + detail modal, where colour = staff).
const STATUS: Record<string, { label: string; chip: string }> = {
  CONFIRMED: { label: "Confirmed", chip: "bg-brand-soft text-brand-dark" },
  PENDING: { label: "Pending", chip: "bg-amber-100 text-amber-700" },
  COMPLETED: { label: "Completed", chip: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "Cancelled", chip: "bg-surface-2 text-muted" },
  NO_SHOW: { label: "No-show", chip: "bg-red-100 text-red-600" },
};
const st = (s: string) => STATUS[s] ?? STATUS.CONFIRMED;

const toMin = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const pad = (n: number) => String(n).padStart(2, "0");
const hoursBetween = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
const fmtClock = (m: number) => `${Math.floor(m / 60)}:${pad(m % 60)}`;

// Greedy lane packing so overlapping appointments sit side by side (Google-style).
function layout(list: Appointment[]) {
  const sorted = [...list].sort((a, b) => toMin(a.time) - toMin(b.time) || (b.durationMin || 30) - (a.durationMin || 30));
  const laneEnds: number[] = [];
  const placed = sorted.map((a) => {
    const s = toMin(a.time), e = s + Math.max(a.durationMin || 30, 20);
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(e); } else laneEnds[lane] = e;
    return { a, s, e, lane };
  });
  return { placed, laneCount: Math.max(1, laneEnds.length) };
}

export function CalendarAdmin({ adminKey }: { adminKey: string }) {
  const H = { "x-admin-key": adminKey };
  const [view, setView] = useState<View>(() => (localStorage.getItem("rg-cal-view") as View) || "day");
  const [anchor, setAnchor] = useState(todayIso());
  const [staff, setStaff] = useState<StaffFull[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [staffFilter, setStaffFilter] = useState<number | "all">("all");
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [giftFor, setGiftFor] = useState<Appointment | null>(null);
  const [newSlot, setNewSlot] = useState<{ date: string; time: string; staffId: string } | null>(null);

  const week = useMemo(() => weekOf(anchor), [anchor]);
  const active = useMemo(() => staff.filter((s) => s.isActive), [staff]);

  // Stable colour per staff member (assigned by id order, so it never shifts).
  const themeById = useMemo(() => {
    const m = new Map<number, Theme>();
    [...staff].sort((a, b) => a.id - b.id).forEach((s, i) => m.set(s.id, PALETTE[i % PALETTE.length]));
    return m;
  }, [staff]);
  const themeFor = (id?: number | null) => (id != null ? themeById.get(id) : undefined) ?? NEUTRAL;

  useEffect(() => { api.get<StaffFull[]>("/api/admin/staff", H).then(setStaff).catch(() => {}); /* eslint-disable-next-line */ }, []);

  function load() {
    const url = view === "day"
      ? `/api/admin/appointments?date=${anchor}`
      : `/api/admin/appointments?from=${week[0]}&to=${week[6]}`;
    api.get<Appointment[]>(url, H).then(setAppts).catch(() => setAppts([]));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [view, anchor]);
  useEffect(() => { localStorage.setItem("rg-cal-view", view); }, [view]);

  // Grid hour range = union of the visible staff working hours + any appointment
  // that spills outside them, clamped to a sensible default.
  const { startH, endH } = useMemo(() => {
    let min = 9 * 60, max = 20 * 60;
    for (const a of appts) { const s = toMin(a.time); min = Math.min(min, s); max = Math.max(max, s + (a.durationMin || 60)); }
    const days = view === "day" ? [anchor] : week;
    for (const s of active) for (const iso of days) {
      const d = s.schedule?.[parseDay(iso).getDay()];
      if (d && !d.off) { min = Math.min(min, toMin(d.open)); max = Math.max(max, toMin(d.close)); }
    }
    return { startH: Math.max(0, Math.floor(min / 60)), endH: Math.min(24, Math.max(Math.ceil(max / 60), Math.floor(min / 60) + 1)) };
  }, [appts, active, view, anchor, week]);

  const step = (dir: number) => setAnchor((a) => addDaysIso(a, dir * (view === "week" ? 7 : 1)));
  const label = view === "day"
    ? parseDay(anchor).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : `${parseDay(week[0]).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${parseDay(week[6]).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div>
      {/* ---------- Toolbar ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setNewSlot({ date: anchor, time: "", staffId: "" })} className="btn btn-primary px-4 py-2 text-sm">+ New booking</button>

        <div className="flex items-center gap-1.5">
          <button onClick={() => step(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink transition hover:bg-surface-2" aria-label="Previous">‹</button>
          <button onClick={() => setAnchor(todayIso())} className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand">Today</button>
          <button onClick={() => step(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink transition hover:bg-surface-2" aria-label="Next">›</button>
          <span className="ms-1 text-sm font-semibold text-ink">{label}</span>
        </div>

        {/* Day | Week (Month drops in here later) */}
        <div className="flex gap-1 rounded-full bg-surface-2 p-1">
          {(["day", "week"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${view === v ? "bg-brand text-white shadow" : "text-muted hover:text-ink"}`}>{v}</button>
          ))}
        </div>
      </div>

      {/* Legend (staff colours) + status key + (week) staff filter */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {active.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink">
              <span className={`h-2.5 w-2.5 rounded-full ${themeFor(s.id).dot}`} />{s.name}
            </span>
          ))}
        </div>
        <span className="hidden text-[11px] text-muted sm:inline">✓ done · ⚠ no-show · ✕ cancelled · ◔ pending</span>
        {view === "week" && (
          <select value={String(staffFilter)} onChange={(e) => setStaffFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="input !w-auto !py-1.5 text-sm ms-auto">
            <option value="all">All specialists</option>
            {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* ---------- Views ---------- */}
      {view === "day"
        ? <DayView date={anchor} staff={active} appts={appts} themeFor={themeFor} onOpen={setDetail} onSlot={(date, time, staffId) => setNewSlot({ date, time, staffId })} />
        : <WeekView dates={week} appts={appts} staffFilter={staffFilter} startH={startH} endH={endH} themeFor={themeFor}
            onOpen={setDetail} onSlot={(date, time) => setNewSlot({ date, time, staffId: staffFilter === "all" ? "" : String(staffFilter) })} />}

      {/* ---------- Modals ---------- */}
      {detail && <BookingDetailModal appt={detail} adminKey={adminKey} onClose={() => setDetail(null)}
        onChanged={load} onGift={(a) => { setDetail(null); setGiftFor(a); }} />}
      {giftFor && <GiftCardPayModal adminKey={adminKey} appointment={giftFor} onClose={() => setGiftFor(null)} onPaid={() => { setGiftFor(null); load(); }} />}
      {newSlot && <NewBookingModal adminKey={adminKey} onClose={() => setNewSlot(null)} onCreated={() => { setNewSlot(null); load(); }}
        defaultDate={newSlot.date} defaultTime={newSlot.time} defaultStaffId={newSlot.staffId} />}
    </div>
  );
}

/* ============================ DAY VIEW ============================ */
function DayView({ date, staff, appts, themeFor, onOpen, onSlot }: {
  date: string; staff: StaffFull[]; appts: Appointment[]; themeFor: (id?: number | null) => Theme;
  onOpen: (a: Appointment) => void; onSlot: (date: string, time: string, staffId: string) => void;
}) {
  const dow = parseDay(date).getDay();
  const forStaff = (id: number) => appts.filter((a) => a.staffId === id && a.status !== "CANCELLED").sort((a, b) => a.time.localeCompare(b.time));
  const unassigned = appts.filter((a) => !a.staffId && a.status !== "CANCELLED").sort((a, b) => a.time.localeCompare(b.time));

  const Item = ({ a }: { a: Appointment }) => {
    const t = themeFor(a.staffId);
    return (
      <button onClick={() => onOpen(a)} className={`flex w-full items-start gap-2 rounded-lg border-s-4 p-2 text-left text-sm shadow-sm transition hover:shadow ${t.bg} ${t.border} ${t.text}`}>
        <div className="min-w-0">
          <p className="font-semibold"><span className="font-extrabold">{a.time}</span> · {a.serviceName}</p>
          <p className="truncate text-xs opacity-80">{a.customerName} · {a.customerPhone}</p>
        </div>
        {a.status !== "CONFIRMED" && <span className={`ms-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st(a.status).chip}`}>{st(a.status).label}</span>}
      </button>
    );
  };

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {staff.map((s) => {
        const day = s.schedule?.[dow];
        const blocked = s.blockedDates?.includes(date);
        const off = blocked || !day || day.off;
        const list = forStaff(s.id);
        return (
          <div key={s.id} className="card p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 font-display font-bold text-ink"><span className={`h-3 w-3 rounded-full ${themeFor(s.id).dot}`} />{s.name}</p>
              <span className={`text-xs font-semibold ${off ? "text-red-500" : "text-emerald-600"}`}>{blocked ? "Blocked" : off ? "Day off" : `${day!.open}–${day!.close}`}</span>
            </div>
            <div className="mt-2 max-h-[22rem] space-y-1.5 overflow-y-auto pe-0.5">
              {list.length === 0
                ? <p className="py-3 text-center text-xs text-muted">{off ? "Not working" : "No appointments"}</p>
                : list.map((a) => <Item key={a.id} a={a} />)}
              {!off && <button onClick={() => onSlot(date, "", String(s.id))} className="w-full rounded-lg border border-dashed border-border py-1.5 text-xs font-semibold text-muted transition hover:border-brand hover:text-brand">+ Add booking</button>}
            </div>
          </div>
        );
      })}

      {unassigned.length > 0 && (
        <div className="card border-dashed p-3">
          <p className="font-display font-bold text-muted">Unassigned</p>
          <div className="mt-2 max-h-[22rem] space-y-1.5 overflow-y-auto pe-0.5">
            {unassigned.map((a) => <Item key={a.id} a={a} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ WEEK VIEW ============================ */
function WeekView({ dates, appts, staffFilter, startH, endH, themeFor, onOpen, onSlot }: {
  dates: string[]; appts: Appointment[]; staffFilter: number | "all"; themeFor: (id?: number | null) => Theme;
  startH: number; endH: number; onOpen: (a: Appointment) => void; onSlot: (date: string, time: string) => void;
}) {
  const hours = hoursBetween(startH, endH);
  const gridH = hours.length * HOUR_H;
  const today = todayIso();
  const cols = `${GUTTER}px repeat(${dates.length}, minmax(150px, 1fr))`;

  const showAll = staffFilter === "all";
  const byDay = (iso: string) => appts.filter((a) => a.date === iso && (showAll ? true : a.staffId === staffFilter));

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
      {/* Header row */}
      <div className="grid border-b border-border bg-surface/95" style={{ gridTemplateColumns: cols }}>
        <div />
        {dates.map((iso) => {
          const d = parseDay(iso); const isToday = iso === today;
          return (
            <div key={iso} className={`border-s border-border px-1 py-2.5 text-center ${isToday ? "bg-brand-soft/40" : ""}`}>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{d.toLocaleDateString("en-US", { weekday: "short" })}</p>
              <p className={`mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-base font-extrabold ${isToday ? "bg-brand text-white shadow" : "text-ink"}`}>{d.getDate()}</p>
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="grid" style={{ gridTemplateColumns: cols }}>
        {/* Time gutter */}
        <div className="relative" style={{ height: gridH }}>
          {hours.map((h, i) => <div key={h} className="absolute end-2 -translate-y-1/2 text-xs font-semibold text-muted" style={{ top: i * HOUR_H }}>{fmtHour(h)}</div>)}
        </div>

        {/* Day columns */}
        {dates.map((iso) => {
          const isToday = iso === today;
          const { placed, laneCount } = layout(byDay(iso));
          const nowTop = isToday ? (nowMinutes() - startH * 60) / 60 * HOUR_H : -1;
          return (
            <div key={iso} className={`relative border-s border-border ${isToday ? "bg-brand-soft/15" : ""}`} style={{ height: gridH }}>
              {/* Empty hour slots (click to add) + half-hour guide */}
              {hours.map((h, i) => (
                <button key={h} onClick={() => onSlot(iso, `${pad(h)}:00`)} title="Add booking"
                  className="group absolute inset-x-0 border-t border-border transition hover:bg-brand-soft/30" style={{ top: i * HOUR_H, height: HOUR_H }}>
                  <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/50" />
                </button>
              ))}

              {/* Now line */}
              {isToday && nowTop >= 0 && nowTop <= gridH && (
                <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-400" style={{ top: nowTop }}>
                  <span className="absolute -start-1 -top-1 h-2 w-2 rounded-full bg-red-400" />
                </div>
              )}

              {/* Appointment blocks — coloured by staff member */}
              {placed.map(({ a, s, e, lane }) => {
                const top = (s - startH * 60) / 60 * HOUR_H;
                const h = Math.max((e - s) / 60 * HOUR_H, 30);
                const w = 100 / laneCount;
                const t = themeFor(a.staffId);
                const mark = STATUS_MARK[a.status];
                const cancelled = a.status === "CANCELLED";
                return (
                  <button key={a.id} onClick={() => onOpen(a)} title={`${a.time}–${fmtClock(e)} · ${a.serviceName} · ${a.customerName}${a.staffName ? ` · ${a.staffName}` : ""}`}
                    style={{ top, height: h - 3, left: `calc(${lane * w}% + 3px)`, width: `calc(${w}% - 6px)` }}
                    className={`absolute z-20 flex flex-col overflow-hidden rounded-lg border-s-4 px-2 py-1 text-left leading-tight shadow-sm transition hover:z-30 hover:shadow-md ${t.bg} ${t.border} ${t.text} ${cancelled ? "line-through opacity-60" : a.status === "NO_SHOW" ? "opacity-80" : ""}`}>
                    <span className="flex items-center gap-1 text-[10px] font-semibold opacity-80">{a.time}–{fmtClock(e)}{mark && <span className="ms-auto text-xs">{mark}</span>}</span>
                    {showAll && a.staffName && (
                      <span className="flex items-center gap-1 truncate text-xs font-extrabold">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`} />{a.staffName}
                      </span>
                    )}
                    <span className="truncate text-[13px] font-bold">{a.serviceName}</span>
                    {h > 76 && <span className="truncate text-[11px] opacity-80">{a.customerName}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ======================= BOOKING DETAIL MODAL ======================= */
function BookingDetailModal({ appt: a, adminKey, onClose, onChanged, onGift }: {
  appt: Appointment; adminKey: string; onClose: () => void; onChanged: () => void; onGift: (a: Appointment) => void;
}) {
  const H = { "x-admin-key": adminKey };
  const [busy, setBusy] = useState(false);

  async function setStatus(status: string) {
    setBusy(true);
    try { await api.patch(`/api/admin/appointments/${a.id}`, { status }, H); onChanged(); onClose(); }
    catch (e) { alert(e instanceof Error ? e.message : "Couldn't update."); } finally { setBusy(false); }
  }
  async function markPaid() {
    if (!a.paymentId) return;
    setBusy(true);
    try { await api.post(`/api/admin/payments/${a.paymentId}/mark-paid`, {}, H); onChanged(); onClose(); }
    catch (e) { alert(e instanceof Error ? e.message : "Couldn't mark paid."); } finally { setBusy(false); }
  }

  const done = a.status === "COMPLETED", cancelled = a.status === "CANCELLED";
  const waText = (a.status === "COMPLETED" ? waMessages.thanks : waMessages.confirmation)({ customerName: a.customerName, serviceName: a.serviceName, date: a.date, time: a.time });
  const Row = ({ k, v }: { k: string; v: string }) => v ? <div className="flex justify-between gap-4 text-sm"><span className="text-muted">{k}</span><span className="text-end font-medium text-ink">{v}</span></div> : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-[1.5rem] bg-surface p-5 shadow-2xl sm:rounded-[1.5rem]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-bold text-ink">{a.serviceName}</p>
            <p className="text-sm text-muted">{parseDay(a.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · {a.time}{a.durationMin ? ` · ${a.durationMin}m` : ""}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${st(a.status).chip}`}>{st(a.status).label}</span>
        </div>

        <div className="mt-4 space-y-1.5 rounded-xl bg-surface-2/60 p-3">
          <Row k="Customer" v={a.customerName} />
          <Row k="Phone" v={a.customerPhone} />
          <Row k="Specialist" v={a.staffName || "Unassigned"} />
          <Row k="Price" v={a.price ? `$${a.price}` : ""} />
          <Row k="Payment" v={a.paymentMethod ? `${a.paymentMethod}${a.paymentStatus ? ` · ${a.paymentStatus.toLowerCase()}` : ""}` : ""} />
          <Row k="Note" v={a.note} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href={waLink(a.customerPhone, waText)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366]/12 px-3 py-1.5 text-xs font-bold text-[#128C4A] transition hover:bg-[#25D366]/20">💬 WhatsApp</a>
          {a.paymentId && a.paymentStatus !== "PAID" && <button onClick={markPaid} disabled={busy} className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-600 transition hover:bg-emerald-500/25">💵 Mark paid</button>}
          <button onClick={() => onGift(a)} className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand-dark transition hover:bg-brand-soft/70">🎀 Gift card</button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {!done && !cancelled && <button onClick={() => setStatus("COMPLETED")} disabled={busy} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500/15">Mark done</button>}
          {!done && !cancelled && <button onClick={() => setStatus("NO_SHOW")} disabled={busy} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-amber-600 transition hover:bg-amber-400/15">No-show</button>}
          {!cancelled && <button onClick={() => setStatus("CANCELLED")} disabled={busy} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/15">Cancel</button>}
          {(cancelled || a.status === "NO_SHOW") && <button onClick={() => setStatus("CONFIRMED")} disabled={busy} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand-soft">Restore</button>}
          <button onClick={onClose} className="ms-auto rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink">Close</button>
        </div>
      </div>
    </div>
  );
}
