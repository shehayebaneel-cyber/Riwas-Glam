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
  return Array.from({ length: n }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i); return d; });
};

/** Minutes since midnight, right now, in Beirut. */
export const nowMinutes = () => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: SALON_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(p.find((x) => x.type === "hour")?.value || "0") % 24;
  const m = Number(p.find((x) => x.type === "minute")?.value || "0");
  return h * 60 + m;
};
