export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Wall-clock date ("YYYY-MM-DD") and minutes-since-midnight in a given IANA timezone,
 *  independent of the server's own timezone (Render runs in UTC). */
export function wallClock(now: Date, tz: string): { date: string; min: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  let hh = Number(get("hour")); if (hh === 24) hh = 0; // some engines emit '24' for midnight
  return { date: `${get("year")}-${get("month")}-${get("day")}`, min: hh * 60 + Number(get("minute")) };
}

export interface DaySchedule { off: boolean; open: string; close: string; breakStart: string; breakEnd: string }
export interface StaffLite { id: number; schedule: DaySchedule[]; blockedDates: string[] }
export interface ApptLite { time: string; durationMin: number; staffId: number | null; status: string }

/** Can this staff member start a `durationMin` service at minute `t` on `date`? */
function staffFree(staff: StaffLite, dow: number, date: string, t: number, durationMin: number, staffAppts: ApptLite[]): boolean {
  const day = staff.schedule?.[dow];
  if (!day || day.off || !day.open || !day.close) return false;
  if (staff.blockedDates?.includes(date)) return false;
  const open = toMin(day.open), close = toMin(day.close);
  if (t < open || t + durationMin > close) return false;
  if (day.breakStart && day.breakEnd) { const bs = toMin(day.breakStart), be = toMin(day.breakEnd); if (t < be && bs < t + durationMin) return false; }
  // Both confirmed bookings and unpaid PENDING (Whish) holds occupy the slot.
  for (const a of staffAppts) if (a.status === "CONFIRMED" || a.status === "PENDING") { const as = toMin(a.time); if (t < as + a.durationMin && as < t + durationMin) return false; }
  return true;
}

const apptsByStaff = (existing: ApptLite[]) => {
  const m = new Map<number, ApptLite[]>();
  for (const a of existing) if (a.staffId != null) { const arr = m.get(a.staffId) ?? []; arr.push(a); m.set(a.staffId, arr); }
  return m;
};

/** Bookable start times ("HH:MM") for a service on a date, honouring each eligible
 *  staff's own schedule. staffId set → that staff; null → any eligible staff free. */
export function availableSlots(opts: {
  date: string; durationMin: number; staffId: number | null; staff: StaffLite[]; existing: ApptLite[]; now: Date; stepMin: number; leadMin: number; tz?: string;
}): string[] {
  const { date, durationMin, staffId, staff, existing, now, stepMin, leadMin, tz = "Asia/Beirut" } = opts;
  const pool = staffId != null ? staff.filter((s) => s.id === staffId) : staff;
  if (!pool.length) return [];
  const dow = new Date(date + "T00:00:00").getDay();
  const wc = wallClock(now, tz);
  const isToday = date === wc.date;
  const nowMin = wc.min;
  const byStaff = apptsByStaff(existing);

  let minOpen = 24 * 60, maxClose = 0;
  for (const s of pool) { const d = s.schedule?.[dow]; if (d && !d.off && d.open && d.close) { minOpen = Math.min(minOpen, toMin(d.open)); maxClose = Math.max(maxClose, toMin(d.close)); } }
  if (maxClose <= minOpen) return [];

  const out: string[] = [];
  for (let t = minOpen; t + durationMin <= maxClose; t += stepMin) {
    if (isToday && t <= nowMin + leadMin) continue;
    if (pool.some((s) => staffFree(s, dow, date, t, durationMin, byStaff.get(s.id) ?? []))) out.push(toHHMM(t));
  }
  return out;
}

/** First eligible staff free for a given date/time (for "Any" bookings). */
export function pickFreeStaff(opts: { date: string; time: string; durationMin: number; staff: StaffLite[]; existing: ApptLite[] }): number | null {
  const dow = new Date(opts.date + "T00:00:00").getDay();
  const t = toMin(opts.time);
  const byStaff = apptsByStaff(opts.existing);
  for (const s of opts.staff) if (staffFree(s, dow, opts.date, t, opts.durationMin, byStaff.get(s.id) ?? [])) return s.id;
  return null;
}
