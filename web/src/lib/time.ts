// The salon is in Lebanon. Every date/time shown or sent must be Beirut
// wall-clock time, regardless of the device's own timezone (a traveling owner
// or a mis-set phone should still see the salon's real day and hours).
export const SALON_TZ = "Asia/Beirut";

/** Today in Beirut as "YYYY-MM-DD". */
export const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: SALON_TZ });

/** Parse "YYYY-MM-DD" to a Date at *local* midnight. Because it's built from a
 *  Beirut calendar date, .getDate() and toLocaleDateString(...) (without a
 *  timeZone) then render that exact day correctly in any browser. */
export const parseDay = (s: string) => new Date(s + "T00:00:00");

/** "YYYY-MM-DD" for a Date produced by parseDay()/nextDays() (local midnight). */
export const ymd = (d: Date) => d.toLocaleDateString("en-CA");

/** N consecutive days starting with Beirut's today, as local-midnight Dates. */
export const nextDays = (n: number) => {
  const base = parseDay(todayIso());
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });
};

/** Add n days to a "YYYY-MM-DD" and return "YYYY-MM-DD" (built from a Beirut
 *  calendar date via parseDay, so it renders correctly in any browser). */
export const addDaysIso = (s: string, n: number) => {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

/** The 7 iso dates (Monday→Sunday) of the week that contains `s`. */
export const weekOf = (s: string) => {
  const d = parseDay(s);
  const mondayOffset = (d.getDay() + 6) % 7; // getDay: 0=Sun → treat Monday as start
  const mon = new Date(d);
  mon.setDate(d.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    return ymd(x);
  });
};

/** Selectable booking times: 24-hour values ("13:30") with clear 12-hour labels
 *  ("1:30 PM"). Used by the admin booking forms so an afternoon booking can never
 *  be saved as AM by mistake. Defaults span 8:00 AM–9:00 PM in 15-min steps. */
export function timeOptions(stepMin = 15, startMin = 8 * 60, endMin = 21 * 60): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let t = startMin; t <= endMin; t += stepMin) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out.push({ value, label: `${h12}:${String(m).padStart(2, "0")} ${ampm}` });
  }
  return out;
}

/** A friendly 12-hour label for a stored 24h "HH:MM" (e.g. "13:30" → "1:30 PM"). */
export function label12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Minutes since midnight, right now, in Beirut. */
export const nowMinutes = () => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: SALON_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(p.find((x) => x.type === "hour")?.value || "0") % 24;
  const m = Number(p.find((x) => x.type === "minute")?.value || "0");
  return h * 60 + m;
};
