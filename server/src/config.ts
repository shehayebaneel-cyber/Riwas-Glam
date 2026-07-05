// Salon operating config used for availability. (Branding lives in web/src/config.ts.)
// hours indexed by weekday: 0=Sun … 6=Sat.
export const SALON = {
  name: "Riwa's Glam",
  slotStepMin: 30, // booking grid granularity
  leadMin: 30, // can't book a slot starting within this many minutes from now
  hours: [
    { closed: false, open: "11:00", close: "18:00" }, // Sun
    { closed: true, open: "", close: "" }, // Mon (closed)
    { closed: false, open: "10:00", close: "19:00" }, // Tue
    { closed: false, open: "10:00", close: "19:00" }, // Wed
    { closed: false, open: "10:00", close: "19:00" }, // Thu
    { closed: false, open: "10:00", close: "20:00" }, // Fri
    { closed: false, open: "10:00", close: "20:00" }, // Sat
  ] as { closed: boolean; open: string; close: string }[],
};
