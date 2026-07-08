import { SITE } from "../config";

// Turn a stored phone into wa.me digits (full international, no + or spaces).
// Handles Lebanese local mobiles (8 digits, e.g. 78 910 551) and 0-prefixed numbers.
export function waDigits(phone: string): string {
  let d = (phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 8) d = "961" + d;            // local Lebanese mobile
  else if (d.startsWith("0")) d = "961" + d.slice(1);
  return d;
}

// Build a click-to-chat link that opens WhatsApp with the message pre-filled.
export function waLink(phone: string, text: string): string {
  return `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`;
}

const fill = (tpl: string, data: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => data[k] ?? "");
const bookingUrl = () => (typeof window !== "undefined" ? `${window.location.origin}/book` : "");

type Appt = { customerName: string; serviceName: string; date: string; time: string };

// Ready-made, warm messages the owner can send in one tap (she still presses send in WhatsApp).
export const waMessages = {
  confirmation: (a: Appt) => fill("Hi {name} 💖 Your {service} appointment on {date} at {time} is confirmed. See you soon! — {salon}", { name: a.customerName, service: a.serviceName, date: a.date, time: a.time, salon: SITE.name }),
  reminder: (a: Appt) => fill("Hi {name} 💐 A little reminder for your {service} appointment on {date} at {time}. Can't wait to see you! — {salon}", { name: a.customerName, service: a.serviceName, date: a.date, time: a.time, salon: SITE.name }),
  thanks: (a: Appt) => fill("Hi {name} ✨ Thank you for visiting {salon} today! If you enjoyed your {service} we'd love a quick review 💕", { name: a.customerName, service: a.serviceName, salon: SITE.name }),
};

// Default offer/broadcast text. {name} is replaced per-customer when sending.
export const defaultOffer = () =>
  `Hi {name}! 💖 This week at ${SITE.name}: [describe your offer here]. Book now at ${bookingUrl()} — see you soon! ✨`;
