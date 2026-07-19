import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { prisma } from "./db.js";
import { SALON } from "./config.js";
import { availableSlots, pickFreeStaff, toHHMM, toMin, type DaySchedule } from "./lib/slots.js";
import { isPaymentMethod, genReference, whishInitiate, whishVerifyWebhook, whishParseWebhook, whishConfigured } from "./payments.js";
import type { Payment } from "@prisma/client";

// The salon is in Lebanon — run all date/time logic in Beirut wall-clock time
// regardless of the host's timezone (Render runs in UTC).
const TZ = "Asia/Beirut";
process.env.TZ = process.env.TZ || TZ;

// Beirut-local date helpers, independent of the host timezone. Use these for every
// "today"/"this month" comparison so calendar-day logic always matches the salon.
const beirutToday = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // "YYYY-MM-DD"
const beirutDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("en-CA", { timeZone: TZ });
const beirutMonth = (d: Date = new Date()) => d.toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7); // "YYYY-MM"

const app = express();
app.set("trust proxy", true); // Render terminates TLS; trust x-forwarded-proto for absolute image URLs
app.use(cors());
app.use(express.json({ limit: "12mb" })); // room for base64 image uploads

const STR = (v: unknown, max = 200) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const NUM = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round2 = (n: number) => Math.round(n * 100) / 100;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: string) => /^\d{2}:\d{2}$/.test(s);
const parseArr = (s: string) => {
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};
const parseSchedule = (s: string): DaySchedule[] => {
  const a = parseArr(s);
  return a.length === 7 ? a : [];
};

const DEFAULT_SCHEDULE: DaySchedule[] = [0, 1, 2, 3, 4, 5, 6].map((d) =>
  d === 1 ? { off: true, open: "", close: "", breakStart: "", breakEnd: "" } : { off: false, open: "10:00", close: "19:00", breakStart: "", breakEnd: "" },
);

// Key/value settings the manager controls.
async function getSetting<T>(key: string, def: T): Promise<T> {
  const s = await prisma.setting.findUnique({ where: { key } });
  if (!s) return def;
  try {
    return JSON.parse(s.value) as T;
  } catch {
    return def;
  }
}
const setSetting = (key: string, value: unknown) =>
  prisma.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
const GC_DEFAULT = { amounts: [25, 50, 100], min: 10, max: 500, expiryMonths: 12 };
const EMERGENCY_DEFAULT = { closed: false, message: "" };
type Tier = { name: string; minPoints: number; discountPct: number };
type Reward = { id: number; name: string; cost: number; description: string };
const LOYALTY_DEFAULT = {
  enabled: true,
  pointsPerDollar: 1,
  tiers: [
    { name: "Silver", minPoints: 0, discountPct: 0 },
    { name: "Gold", minPoints: 500, discountPct: 5 },
    { name: "VIP", minPoints: 1500, discountPct: 10 },
  ] as Tier[],
  rewards: [
    { id: 1, name: "$10 off your next visit", cost: 200, description: "Redeem 200 points for $10 off any service." },
    { id: 2, name: "Free brow shaping", cost: 350, description: "A complimentary brow shape on your next visit." },
  ] as Reward[],
};
const tierFor = (lifetimePoints: number, tiers: Tier[]) =>
  [...tiers].sort((a, b) => b.minPoints - a.minPoints).find((t) => lifetimePoints >= t.minPoints) ?? null;
const GC_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const gcCode = () => {
  let s = "";
  for (let i = 0; i < 12; i++) s += GC_ALPHABET[crypto.randomInt(GC_ALPHABET.length)];
  return `GC-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
};

// ---- Payments (unified ledger; gateway specifics live in payments.ts) ----
const WEB_URL = (process.env.WEB_URL || "https://riwasglam.beauty").replace(/\/$/, ""); // customer site base for return URLs
const WHISH_HOLD_MS = 20 * 60 * 1000; // unpaid Whish booking holds expire after 20 min

async function createPayment(input: {
  kind: "BOOKING" | "GIFTCARD";
  method: string;
  amount: number;
  appointmentId?: number | null;
  giftCardId?: number | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  meta?: unknown;
}) {
  let reference = genReference();
  for (let i = 0; i < 5 && (await prisma.payment.findUnique({ where: { reference } })); i++) reference = genReference();
  return prisma.payment.create({
    data: {
      reference,
      kind: input.kind,
      method: input.method,
      amount: round2(input.amount),
      currency: "USD",
      appointmentId: input.appointmentId ?? null,
      giftCardId: input.giftCardId ?? null,
      customerName: STR(input.customerName, 80),
      customerEmail: STR(input.customerEmail, 120),
      customerPhone: STR(input.customerPhone, 40),
      provider: input.method === "WHISH" ? "whish" : "",
      meta: JSON.stringify(input.meta ?? {}),
    },
  });
}

// Deliver the purchase once its payment is PAID: confirm the booking / activate + email the gift card.
async function fulfillPayment(payment: Payment) {
  if (payment.kind === "BOOKING" && payment.appointmentId) {
    // A multi-service visit shares one payment — confirm every appointment in the group.
    const appt = await prisma.appointment.findUnique({ where: { id: payment.appointmentId } }).catch(() => null);
    if (appt) {
      const where = appt.groupId ? { groupId: appt.groupId } : { id: appt.id };
      await prisma.appointment.updateMany({ where, data: { status: "CONFIRMED", paymentStatus: "PAID" } });
      const group = appt.groupId ? await prisma.appointment.findMany({ where, orderBy: { time: "asc" } }) : [appt];
      notify("confirmation", {
        email: appt.customerEmail || undefined,
        phone: appt.customerPhone || undefined,
        data: { name: appt.customerName, service: group.map((a) => a.serviceName).join(" + "), date: appt.date, time: group[0]?.time ?? appt.time },
      });
    }
  } else if (payment.kind === "GIFTCARD" && payment.giftCardId) {
    const card = await prisma.giftCard.update({ where: { id: payment.giftCardId }, data: { status: "ACTIVE", paymentStatus: "PAID" } }).catch(() => null);
    if (card?.purchaserEmail) notify("giftcard", { email: card.purchaserEmail, data: { code: card.code, value: `$${card.initialValue}` } });
  }
}

// Move a payment to PAID (idempotent — gateways retry webhooks) and fulfil it.
async function markPaymentPaid(payment: Payment, extra?: { txnId?: string; providerData?: unknown }) {
  if (payment.status === "PAID") return payment;
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      providerTxnId: extra?.txnId ? STR(extra.txnId, 120) : payment.providerTxnId,
      providerData: extra?.providerData !== undefined ? JSON.stringify(extra.providerData).slice(0, 5000) : payment.providerData,
    },
  });
  await fulfillPayment(updated);
  return updated;
}

// Mark a payment FAILED/CANCELLED and reflect it on the linked booking / gift card.
async function voidPayment(payment: Payment, status: "FAILED" | "CANCELLED") {
  const updated = await prisma.payment.update({ where: { id: payment.id }, data: { status } });
  if (payment.appointmentId) {
    // Cancel the whole visit — every appointment sharing the group's payment.
    const appt = await prisma.appointment.findUnique({ where: { id: payment.appointmentId } }).catch(() => null);
    const where = appt?.groupId ? { groupId: appt.groupId } : { id: payment.appointmentId };
    await prisma.appointment.updateMany({ where, data: { paymentStatus: status, status: "CANCELLED" } }).catch(() => {});
  }
  if (payment.giftCardId) await prisma.giftCard.update({ where: { id: payment.giftCardId }, data: { paymentStatus: status, status: "VOID" } }).catch(() => {});
  return updated;
}

// Free the slot of any Whish booking that was never paid within the hold window.
async function releaseStaleWhishHolds() {
  const cutoff = new Date(Date.now() - WHISH_HOLD_MS);
  const stale = await prisma.payment.findMany({ where: { kind: "BOOKING", method: "WHISH", status: "PENDING", createdAt: { lt: cutoff } } });
  for (const p of stale) await voidPayment(p, "CANCELLED");
}

app.get("/api/health", (_req, res) => res.json({ ok: true, salon: SALON.name }));
app.get("/api/info", (_req, res) => res.json({ name: SALON.name, hours: SALON.hours, slotStepMin: SALON.slotStepMin }));
// Public, anonymous site-analytics beacon (no auth, no PII).
const TRACK_TYPES = ["PAGE_VIEW", "SERVICE_VIEW", "BOOKING_STARTED", "BOOKING_COMPLETED", "CLICK", "GALLERY_VIEW"];
app.post("/api/track", async (req, res) => {
  const type = STR(req.body?.type, 24).toUpperCase();
  if (!TRACK_TYPES.includes(type)) return res.status(204).end();
  await prisma.analyticsEvent.create({ data: { type, label: STR(req.body?.label, 120), source: STR(req.body?.source, 80) } }).catch(() => {});
  res.status(204).end();
});

// Public salon status — drives the site-wide banner + booking block during a temporary close.
app.get("/api/status", async (_req, res) => {
  const e = await getSetting("emergencyClose", EMERGENCY_DEFAULT);
  res.json({ closed: !!e.closed, message: STR(e.message, 300) });
});
app.get("/api/staff", async (_req, res) => {
  const staff = await prisma.staff.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, name: true, role: true, avatar: true },
  });
  res.json(staff);
});

// Public catalog: active categories → active services (with their specialists) + add-ons.
app.get("/api/catalog", async (_req, res) => {
  const cats = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      services: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { staff: { where: { isActive: true }, select: { id: true, name: true, role: true }, orderBy: { sortOrder: "asc" } } },
      },
      addOns: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
  });
  // Strip internal-only fields (materialCost) from the public payload.
  res.json(cats.filter((c) => c.services.length > 0).map((c) => ({ ...c, services: c.services.map(({ materialCost, ...s }) => s) })));
});

// Resolve a booking: service, add-ons, totals, and the eligible specialists.
// One or more services booked as a single visit: ordered segments (each service +
// its add-ons), combined totals, and the specialists able to perform ALL of them
// back-to-back. eligible = [] means no single specialist covers every service.
async function resolveServices(serviceIds: number[], addOnIds: number[]) {
  const ids = [...new Set(serviceIds)].filter((n) => n > 0).slice(0, 6);
  if (!ids.length) return null;
  const rows = await prisma.service.findMany({ where: { id: { in: ids }, isActive: true }, include: { staff: true } });
  if (rows.length !== ids.length) return null;
  const services = ids.map((id) => rows.find((s) => s.id === id)!);
  const catIds = [...new Set(services.map((s) => s.categoryId))];
  const addOns = addOnIds.length ? await prisma.addOn.findMany({ where: { id: { in: addOnIds }, categoryId: { in: catIds }, isActive: true } }) : [];
  // Each add-on rides on the first selected service of its category.
  const segments = services.map((service) => {
    const own = addOns.filter((a) => a.categoryId === service.categoryId && services.find((s) => s.categoryId === a.categoryId) === service);
    return {
      service,
      addOns: own,
      durationMin: service.durationMin + own.reduce((s, a) => s + a.durationMin, 0),
      price: round2(service.price + own.reduce((s, a) => s + a.price, 0)),
    };
  });
  const durationMin = segments.reduce((s, g) => s + g.durationMin, 0);
  const price = round2(segments.reduce((s, g) => s + g.price, 0));
  // Staff who can do ALL selected services (a service with no assigned staff = anyone).
  let pool = await prisma.staff.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  for (const s of services) {
    const own = s.staff.filter((x) => x.isActive);
    if (own.length) {
      const okIds = new Set(own.map((x) => x.id));
      pool = pool.filter((x) => okIds.has(x.id));
    }
  }
  const eligible = pool.map((s) => ({
    id: s.id,
    name: s.name,
    commissionPct: s.commissionPct,
    schedule: parseSchedule(s.schedule),
    blockedDates: parseArr(s.blockedDates) as string[],
  }));
  return { services, segments, durationMin, price, eligible };
}
// A package books like a service, but any active specialist can perform it.
async function resolvePackage(id: number) {
  const pkg = await prisma.package.findFirst({ where: { id, isActive: true } });
  if (!pkg) return null;
  const rows = await prisma.staff.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const eligible = rows.map((s) => ({
    id: s.id,
    name: s.name,
    commissionPct: s.commissionPct,
    schedule: parseSchedule(s.schedule),
    blockedDates: parseArr(s.blockedDates) as string[],
  }));
  return { pkg, eligible, durationMin: pkg.durationMin, price: round2(pkg.price) };
}

app.get("/api/availability", async (req, res) => {
  await releaseStaleWhishHolds();
  const q = req.query as Record<string, string>;
  const date = STR(q.date, 10);
  const emg = await getSetting("emergencyClose", EMERGENCY_DEFAULT);
  if (emg.closed) return res.json({ date, durationMin: 0, price: 0, slots: [], closed: true, message: STR(emg.message, 300) });
  const staffId = q.staffId ? Number(q.staffId) : null;
  const addOnIds = STR(q.addOns)
    .split(",")
    .map(Number)
    .filter((n) => n > 0);
  if (!isDate(date)) return res.status(400).json({ error: "Invalid date." });
  const pkgId = q.packageId ? Number(q.packageId) : 0;
  const serviceIds = STR(q.serviceIds, 60)
    .split(",")
    .map(Number)
    .filter((n) => n > 0);
  if (!serviceIds.length && q.serviceId) serviceIds.push(Number(q.serviceId));
  const r = pkgId ? await resolvePackage(pkgId) : await resolveServices(serviceIds, addOnIds);
  if (!r) return res.status(404).json({ error: "Not found." });
  if (!r.eligible.length)
    return res.json({
      date,
      durationMin: r.durationMin,
      price: r.price,
      slots: [],
      conflict: "No single specialist offers all of those services together — please book them separately.",
    });
  const existing = await prisma.appointment.findMany({ where: { date }, select: { time: true, durationMin: true, staffId: true, status: true } });
  const slots = availableSlots({
    date,
    durationMin: r.durationMin,
    staffId,
    staff: r.eligible,
    existing,
    now: new Date(),
    stepMin: SALON.slotStepMin,
    leadMin: SALON.leadMin,
  });
  res.json({ date, durationMin: r.durationMin, price: r.price, slots });
});

// Homepage widget: is there an opening today/tomorrow, and when's the next one?
app.get("/api/next-availability", async (_req, res) => {
  const emg = await getSetting("emergencyClose", EMERGENCY_DEFAULT);
  if (emg.closed) return res.json({ closed: true, today: false, tomorrow: false, next: null });
  const staffRows = await prisma.staff.findMany({ where: { isActive: true } });
  const eligible = staffRows.map((s) => ({
    id: s.id,
    name: s.name,
    commissionPct: s.commissionPct,
    schedule: parseSchedule(s.schedule),
    blockedDates: parseArr(s.blockedDates) as string[],
  }));
  const duration = SALON.slotStepMin || 30; // representative short slot
  const now = new Date();
  let today = false,
    tomorrow = false,
    next: { date: string; time: string } | null = null;
  for (let i = 0; i < 14; i++) {
    const date = beirutDay(i);
    const existing = await prisma.appointment.findMany({ where: { date }, select: { time: true, durationMin: true, staffId: true, status: true } });
    const slots = availableSlots({
      date,
      durationMin: duration,
      staffId: null,
      staff: eligible,
      existing,
      now,
      stepMin: SALON.slotStepMin,
      leadMin: SALON.leadMin,
    });
    if (i === 0) today = slots.length > 0;
    if (i === 1) tomorrow = slots.length > 0;
    if (slots.length > 0 && !next) next = { date, time: slots[0] };
    if (next && i >= 1) break;
  }
  res.json({ closed: false, today, tomorrow, next });
});

app.post("/api/appointments", async (req, res) => {
  const b = req.body ?? {};
  await releaseStaleWhishHolds(); // free any expired unpaid Whish holds before checking availability
  let staffId: number | null = b.staffId ? Number(b.staffId) : null;
  const date = STR(b.date, 10),
    time = STR(b.time, 5);
  const name = STR(b.customerName, 80),
    phone = STR(b.customerPhone, 40);
  const method = STR(b.paymentMethod, 20).toUpperCase() || "CASH";
  const addOnIds = Array.isArray(b.addOnIds) ? b.addOnIds.map(Number).filter((n: number) => n > 0) : [];
  if (!name || !phone) return res.status(400).json({ error: "Your name and phone are required." });
  if (!isDate(date) || !isTime(time)) return res.status(400).json({ error: "Please pick a valid date and time." });
  if (!isPaymentMethod(method)) return res.status(400).json({ error: "Please choose a valid payment method." });
  const emg = await getSetting("emergencyClose", EMERGENCY_DEFAULT);
  if (emg.closed) return res.status(423).json({ error: emg.message || "Online booking is temporarily paused — please contact us to book." });
  const isPkg = !!b.packageId;
  const serviceIds: number[] = Array.isArray(b.serviceIds) ? b.serviceIds.map(Number).filter((n: number) => n > 0) : b.serviceId ? [Number(b.serviceId)] : [];
  const pr = isPkg ? await resolvePackage(Number(b.packageId)) : null;
  const sr = isPkg ? null : await resolveServices(serviceIds, addOnIds);
  const r = pr ?? sr;
  if (!r) return res.status(404).json({ error: "That isn't available." });
  if (!r.eligible.length) return res.status(409).json({ error: "No single specialist offers all of those services together — please book them separately." });
  if (staffId != null && !r.eligible.some((s) => s.id === staffId)) return res.status(400).json({ error: "That specialist isn't available for this." });
  const existing = await prisma.appointment.findMany({ where: { date }, select: { time: true, durationMin: true, staffId: true, status: true } });
  const slots = availableSlots({
    date,
    durationMin: r.durationMin,
    staffId,
    staff: r.eligible,
    existing,
    now: new Date(),
    stepMin: SALON.slotStepMin,
    leadMin: SALON.leadMin,
  });
  if (!slots.includes(time)) return res.status(409).json({ error: "Sorry, that time was just taken — please pick another." });
  if (staffId == null) staffId = pickFreeStaff({ date, time, durationMin: r.durationMin, staff: r.eligible, existing });
  const chosen = r.eligible.find((s) => s.id === staffId);
  const commissionPct = chosen?.commissionPct ?? 0;
  const custId = optionalCustomerId(req);
  let price = r.price;
  if (custId) {
    // auto-apply the member's loyalty tier discount
    const loy = await getSetting("loyalty", LOYALTY_DEFAULT);
    const cust = loy.enabled ? await prisma.customer.findUnique({ where: { id: custId } }) : null;
    const t = cust ? tierFor(cust.lifetimePoints, loy.tiers) : null;
    if (t?.discountPct) price = round2(price * (1 - t.discountPct / 100));
  }
  let promoUsed = "";
  if (STR(b.promoCode)) {
    const pr2 = await validatePromo(STR(b.promoCode), price, custId);
    if (pr2.ok) {
      price = Math.max(0, round2(price - pr2.discount));
      promoUsed = pr2.code;
      await prisma.promoCode.update({ where: { code: pr2.code }, data: { usedCount: { increment: 1 } } }).catch(() => {});
    }
  }
  const isWhish = method === "WHISH";
  // Build the visit: one appointment per service, chained back-to-back with the
  // same specialist. Multiple services share a groupId and ONE payment (total).
  const segs = pr
    ? [
        {
          serviceId: null as number | null,
          packageId: pr.pkg.id as number | null,
          name: pr.pkg.title,
          durationMin: pr.durationMin,
          addOns: [] as { name: string; price: number }[],
          price: r.price,
        },
      ]
    : sr!.segments.map((g) => ({
        serviceId: g.service.id as number | null,
        packageId: null as number | null,
        name: g.service.name,
        durationMin: g.durationMin,
        addOns: g.addOns.map((a) => ({ name: a.name, price: a.price })),
        price: g.price,
      }));
  const groupId = segs.length > 1 ? crypto.randomUUID() : "";
  const branchId = await defaultBranchId();
  // Spread any loyalty/promo discount across the segments proportionally.
  const factor = r.price > 0 ? price / r.price : 0;
  const appts = [];
  let offset = 0,
    allocated = 0;
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    const segPrice = i === segs.length - 1 ? round2(price - allocated) : round2(g.price * factor);
    allocated = round2(allocated + segPrice);
    appts.push(
      await prisma.appointment.create({
        data: {
          groupId,
          serviceId: g.serviceId,
          packageId: g.packageId,
          staffId,
          customerId: custId,
          customerName: name,
          customerPhone: phone,
          customerEmail: STR(b.customerEmail, 120),
          date,
          time: toHHMM(toMin(time) + offset),
          durationMin: g.durationMin,
          serviceName: g.name,
          staffName: chosen?.name ?? "",
          addOns: JSON.stringify(g.addOns),
          price: segPrice,
          commissionPct,
          commissionAmount: round2((segPrice * commissionPct) / 100),
          note: i === 0 ? STR(b.note, 500) : "",
          promoCode: i === 0 ? promoUsed : "",
          branchId,
          // Whish: hold the slot as PENDING until the gateway confirms. Cash: confirmed now, pay on arrival.
          status: isWhish ? "PENDING" : "CONFIRMED",
          paymentMethod: method,
          paymentStatus: "PENDING",
        },
      }),
    );
    offset += g.durationMin;
  }
  const appointment = appts[0];
  const serviceLabel = appts.map((a) => a.serviceName).join(" + ");
  const payment = await createPayment({
    kind: "BOOKING",
    method,
    amount: price,
    appointmentId: appointment.id,
    customerName: name,
    customerEmail: appointment.customerEmail,
    customerPhone: phone,
  });
  await prisma.appointment.update({ where: { id: appointment.id }, data: { paymentId: payment.id } });

  if (!isWhish) {
    // Cash: the slot is held; the salon collects and marks it paid on arrival.
    notify("confirmation", {
      email: appointment.customerEmail || undefined,
      phone: appointment.customerPhone || undefined,
      data: { name: appointment.customerName, service: serviceLabel, date: appointment.date, time: appointment.time },
    });
    return res.status(201).json({ ok: true, method, payment: { reference: payment.reference, status: payment.status }, appointment, appointments: appts });
  }
  // Whish: start the gateway. Do NOT confirm the booking until payment is confirmed.
  const init = await whishInitiate({
    reference: payment.reference,
    amount: price,
    currency: "USD",
    successUrl: `${WEB_URL}/payment/${payment.reference}`,
    failureUrl: `${WEB_URL}/payment/${payment.reference}`,
    callbackUrl: `${req.protocol}://${req.get("host")}/api/webhooks/whish`,
    customer: { name, phone, email: appointment.customerEmail },
  });
  if (init.ok && init.redirectUrl) {
    if (init.providerRef) await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: init.providerRef } });
    return res.status(201).json({ ok: true, method, paymentPending: true, redirectUrl: init.redirectUrl, reference: payment.reference });
  }
  // Whish not connected yet — the booking stays a pending hold; the customer is told it's awaiting payment.
  return res.status(201).json({ ok: true, method, paymentPending: true, redirectUrl: null, whishNotReady: !whishConfigured(), reference: payment.reference });
});

// Public approved reviews + rating summary (for the site).
app.get("/api/reviews", async (_req, res) => {
  const [items, agg] = await Promise.all([
    prisma.review.findMany({
      where: { status: "APPROVED" },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: 30,
      select: { id: true, authorName: true, rating: true, comment: true, featured: true, reply: true, createdAt: true },
    }),
    prisma.review.aggregate({ where: { status: "APPROVED" }, _avg: { rating: true }, _count: true }),
  ]);
  res.json({ avg: Math.round((agg._avg.rating ?? 0) * 10) / 10, count: agg._count, items });
});

// ---- Gift cards (public) ----
app.get("/api/gift-cards/config", async (_req, res) => {
  const cfg = await getSetting("giftcard", GC_DEFAULT);
  res.json({ amounts: cfg.amounts, min: cfg.min, max: cfg.max });
});
app.post("/api/gift-cards/buy", async (req, res) => {
  const cfg = await getSetting("giftcard", GC_DEFAULT);
  const amount = round2(NUM(req.body?.amount, 0));
  const method = STR(req.body?.paymentMethod, 20).toUpperCase() || "CASH";
  const purchaserName = STR(req.body?.purchaserName, 80),
    purchaserPhone = STR(req.body?.purchaserPhone, 40);
  if (!(amount >= cfg.min) || amount > cfg.max) return res.status(400).json({ error: `Amount must be between $${cfg.min} and $${cfg.max}.` });
  if (!isPaymentMethod(method)) return res.status(400).json({ error: "Please choose a valid payment method." });
  if (!purchaserName || !purchaserPhone) return res.status(400).json({ error: "Your name and phone are required." });
  let code = gcCode();
  for (let i = 0; i < 5 && (await prisma.giftCard.findUnique({ where: { code } })); i++) code = gcCode();
  const expiresAt = cfg.expiryMonths ? new Date(Date.now() + cfg.expiryMonths * 30 * 86400000) : null;
  // Created PENDING — the code is NOT delivered until payment is confirmed (cash marked paid, or Whish webhook).
  const card = await prisma.giftCard.create({
    data: {
      code,
      initialValue: amount,
      balance: amount,
      status: "PENDING",
      paymentMethod: method,
      paymentStatus: "PENDING",
      purchaserName,
      purchaserEmail: STR(req.body?.purchaserEmail, 120),
      recipientName: STR(req.body?.recipientName, 80),
      message: STR(req.body?.message, 500),
      customerId: optionalCustomerId(req),
      expiresAt,
    },
  });
  const payment = await createPayment({
    kind: "GIFTCARD",
    method,
    amount,
    giftCardId: card.id,
    customerName: purchaserName,
    customerEmail: card.purchaserEmail,
    customerPhone: purchaserPhone,
  });
  await prisma.giftCard.update({ where: { id: card.id }, data: { paymentId: payment.id } });

  if (method === "CASH") {
    // Pay in salon; staff marks the payment paid and the code is then issued/emailed.
    return res.status(201).json({ pending: true, method, reference: payment.reference, amount });
  }
  const init = await whishInitiate({
    reference: payment.reference,
    amount,
    currency: "USD",
    successUrl: `${WEB_URL}/payment/${payment.reference}`,
    failureUrl: `${WEB_URL}/payment/${payment.reference}`,
    callbackUrl: `${req.protocol}://${req.get("host")}/api/webhooks/whish`,
    customer: { name: card.purchaserName, phone: "", email: card.purchaserEmail },
  });
  if (init.ok && init.redirectUrl) {
    if (init.providerRef) await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: init.providerRef } });
    return res.status(201).json({ paymentPending: true, method, redirectUrl: init.redirectUrl, reference: payment.reference, amount });
  }
  return res.status(201).json({ paymentPending: true, method, redirectUrl: null, whishNotReady: !whishConfigured(), reference: payment.reference, amount });
});
app.get("/api/gift-cards/:code", async (req, res) => {
  const card = await prisma.giftCard.findUnique({ where: { code: STR(req.params.code, 40).toUpperCase() } });
  if (!card) return res.status(404).json({ error: "Gift card not found." });
  const expired = !!(card.expiresAt && card.expiresAt.getTime() < Date.now());
  res.json({
    code: card.code,
    balance: card.balance,
    initialValue: card.initialValue,
    status: card.status === "ACTIVE" && expired ? "EXPIRED" : card.status,
    expiresAt: card.expiresAt,
    recipientName: card.recipientName,
  });
});

// ---- Payments (public status + gateway webhook) ----
// The checkout return page polls this to reflect Pending → Paid and reveal the code.
app.get("/api/payments/:reference", async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { reference: STR(req.params.reference, 40).toUpperCase() } });
  if (!p) return res.status(404).json({ error: "Payment not found." });
  const out: Record<string, unknown> = {
    reference: p.reference,
    kind: p.kind,
    method: p.method,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    createdAt: p.createdAt,
  };
  if (p.status === "PAID" && p.kind === "GIFTCARD" && p.giftCardId) {
    const c = await prisma.giftCard.findUnique({ where: { id: p.giftCardId } });
    if (c) out.giftCard = { code: c.code, balance: c.balance, expiresAt: c.expiresAt };
  }
  if (p.status === "PAID" && p.kind === "BOOKING" && p.appointmentId) {
    const a = await prisma.appointment.findUnique({ where: { id: p.appointmentId } });
    if (a) {
      const group = a.groupId ? await prisma.appointment.findMany({ where: { groupId: a.groupId }, orderBy: { time: "asc" } }) : [a];
      out.booking = { serviceName: group.map((x) => x.serviceName).join(" + "), date: a.date, time: group[0]?.time ?? a.time, staffName: a.staffName };
    }
  }
  res.json(out);
});

// Public receipt data for a payment reference (drives the printable receipt page).
app.get("/api/receipts/:reference", async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { reference: STR(req.params.reference, 40).toUpperCase() } });
  if (!p) return res.status(404).json({ error: "Receipt not found." });
  const sc = { ...SITE_CONTENT_DEFAULT, ...(await getSetting("siteContent", {} as Record<string, unknown>)) } as unknown as Record<string, string>;
  const out: Record<string, unknown> = {
    reference: p.reference,
    kind: p.kind,
    method: p.method,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
    customerName: p.customerName,
    salon: { name: sc.name, address: sc.address, phone: sc.phone, logo: sc.logo, instagram: sc.instagram, whatsapp: sc.whatsapp },
  };
  if (p.kind === "BOOKING" && p.appointmentId) {
    const a = await prisma.appointment.findUnique({ where: { id: p.appointmentId } });
    if (a) {
      const group = a.groupId ? await prisma.appointment.findMany({ where: { groupId: a.groupId }, orderBy: { time: "asc" } }) : [a];
      out.booking = {
        serviceName: group.map((x) => x.serviceName).join(" + "),
        date: a.date,
        time: group[0]?.time ?? a.time,
        staffName: a.staffName,
        addOns: group.flatMap((x) => parseArr(x.addOns)),
        price: round2(group.reduce((s, x) => s + x.price, 0)),
        services: group.map((x) => ({ name: x.serviceName, time: x.time, durationMin: x.durationMin, price: x.price })),
      };
    }
  }
  if (p.kind === "GIFTCARD" && p.giftCardId) {
    const c = await prisma.giftCard.findUnique({ where: { id: p.giftCardId } });
    if (c) out.giftCard = { code: c.code, initialValue: c.initialValue };
  }
  res.json(out);
});

// Whish calls this to confirm a payment. We only fulfil (confirm booking / issue
// gift card) here — never before the gateway confirms. Idempotent for retries.
app.post("/api/webhooks/whish", async (req, res) => {
  if (!whishVerifyWebhook(req.headers as Record<string, unknown>, JSON.stringify(req.body ?? {}))) return res.status(401).json({ error: "Invalid signature." });
  const evt = whishParseWebhook(req.body);
  if (!evt.reference) return res.status(400).json({ error: "Missing reference." });
  const p = await prisma.payment.findUnique({ where: { reference: evt.reference.toUpperCase() } });
  if (!p) return res.status(404).json({ error: "Unknown payment." });
  if (p.status === "PAID" || p.status === "CANCELLED" || p.status === "REFUNDED") return res.json({ ok: true }); // already settled
  if (evt.success) await markPaymentPaid(p, { txnId: evt.txnId, providerData: req.body });
  else await voidPayment(p, "FAILED");
  res.json({ ok: true });
});

// ---- Admin ----
const ADMIN_KEY = process.env.ADMIN_KEY || "riwa-admin";
// Admin sections (permission keys). Owner has all; other roles get a subset.
const ALL_PERMS = [
  "bookings",
  "waitlist",
  "calendar",
  "finances",
  "inventory",
  "payouts",
  "services",
  "team",
  "academy",
  "packages",
  "loyalty",
  "marketing",
  "notifications",
  "branches",
  "website",
  "giftcards",
  "reviews",
  "reports",
  "activity",
];
// Which permission a given admin API path requires (path-based enforcement).
function permForPath(p: string): string {
  if (p.endsWith("/admin/me") || p.endsWith("/alerts") || p.endsWith("/search") || p.includes("/admin/messages")) return ""; // any authenticated principal
  if (p.includes("/analytics/customers")) return "bookings"; // customer insights live on the Customers tab
  if (p.includes("/analytics/marketing")) return "marketing"; // marketing dashboard lives on the Marketing tab
  if (p.includes("/analytics/branches")) return "branches";
  if (p.includes("/analytics/duration")) return "calendar";
  if (p.includes("/analytics/web")) return "marketing";
  if (p.includes("/dashboard") || p.includes("/analytics") || p.includes("/expenses") || p.includes("/daily-closing") || p.includes("/cash-drawer"))
    return "finances";
  if (p.includes("/payouts")) return "payouts";
  if (
    p.includes("/recipe") ||
    p.includes("/products") ||
    p.includes("/inventory") ||
    p.includes("/movements") ||
    p.includes("/suppliers") ||
    p.includes("/purchase-orders")
  )
    return "inventory";
  if (p.includes("/settings/loyalty") || p.includes("/redemptions")) return "loyalty";
  if (p.includes("/promos")) return "marketing";
  if (p.includes("/notifications")) return "notifications";
  if (p.includes("/branches")) return "branches";
  if (p.includes("/site-content") || p.includes("/admin/images") || p.includes("/gallery") || p.includes("/emergency")) return "website";
  if (p.includes("/staff")) return "team";
  if (p.includes("/gift-cards") || p.includes("/settings/giftcard")) return "giftcards";
  if (p.includes("/reviews")) return "reviews";
  if (p.includes("/courses")) return "academy";
  if (p.includes("/packages")) return "packages";
  if (p.includes("/waitlist")) return "waitlist";
  if (p.includes("/categories") || p.includes("/services") || p.includes("/addons") || p.includes("/catalog") || p.includes("/reorder")) return "services";
  if (p.includes("/appointments") || p.includes("/commissions") || p.includes("/customers") || p.includes("/payments")) return "bookings";
  if (p.includes("/activity")) return "activity";
  return "settings"; // owner-only fallback (only the master key / OWNER passes)
}
// Turn a mutating request into a human-readable audit line.
function describeAction(method: string, path: string): string {
  const seg = path.replace("/api/admin/", "");
  const verb = method === "POST" ? "Created" : method === "DELETE" ? "Deleted" : "Updated";
  if (/emergency/.test(seg)) return "Toggled emergency close";
  if (/gift-cards/.test(seg)) return `${verb} a gift card`;
  if (/services/.test(seg)) return `${verb} a service`;
  if (/categories/.test(seg)) return `${verb} a category`;
  if (/addons/.test(seg)) return `${verb} an add-on`;
  if (/appointments/.test(seg)) return method === "POST" ? "Created a booking" : method === "DELETE" ? "Deleted a booking" : "Updated a booking";
  if (/payments/.test(seg)) return "Updated a payment";
  if (/products|inventory|stock|recipe|movements/.test(seg)) return `${verb} inventory`;
  if (/reviews/.test(seg)) return "Moderated a review";
  if (/staff/.test(seg)) return `${verb} a staff member`;
  if (/payouts/.test(seg)) return `${verb} a payout`;
  if (/customers/.test(seg)) return "Updated a customer";
  if (/promos/.test(seg)) return `${verb} a promo`;
  if (/courses/.test(seg)) return `${verb} a course`;
  if (/packages/.test(seg)) return `${verb} a package`;
  if (/branches/.test(seg)) return `${verb} a branch`;
  if (/waitlist/.test(seg)) return "Updated the waitlist";
  if (/gallery/.test(seg)) return `${verb} a gallery item`;
  if (/site-content|settings/.test(seg)) return "Updated settings";
  return `${verb}: ${seg}`;
}
function logActivity(data: { actor: string; staffId: number | null; action: string; detail: string; ip: string }) {
  prisma.activityLog
    .create({ data: { actor: STR(data.actor, 80), staffId: data.staffId, action: STR(data.action, 160), detail: STR(data.detail, 300), ip: STR(data.ip, 60) } })
    .catch(() => {});
}
// Resolves the caller (master admin key OR a staff token) and enforces the path's permission.
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const key = String(req.headers["x-admin-key"] ?? "");
  let perms: string[] | "*" | null = null,
    staffId: number | null = null,
    actorName = "Owner";
  if (key === ADMIN_KEY) perms = "*";
  else {
    const sid = verifyStaff(key);
    if (sid) {
      const st = await prisma.staff.findUnique({ where: { id: sid } }).catch(() => null);
      if (st && st.isActive) {
        staffId = sid;
        actorName = st.name;
        perms = st.accessRole === "OWNER" ? "*" : (parseArr(st.permissions) as string[]);
      }
    }
  }
  if (!perms) return res.status(401).json({ error: "Unauthorized" });
  const need = permForPath(req.path);
  if (need && perms !== "*" && !perms.includes(need)) return res.status(403).json({ error: "You don't have access to this section." });
  (req as Request & { principal?: unknown }).principal = { perms, staffId, actorName };
  // Audit trail: record successful admin mutations (not logins or reads).
  if (
    ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
    !req.path.endsWith("/login") &&
    !req.path.includes("/activity") &&
    !req.path.includes("/messages")
  ) {
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "")
      .split(",")[0]
      .trim();
    res.on("finish", () => {
      if (res.statusCode < 400)
        logActivity({ actor: actorName, staffId, action: describeAction(req.method, req.path), detail: `${req.method} ${req.path}`, ip });
    });
  }
  next();
}
app.post("/api/admin/login", (req, res) => {
  if (STR(req.body?.key) === ADMIN_KEY) return res.json({ ok: true });
  res.status(401).json({ error: "Wrong password." });
});
app.get("/api/admin/me", requireAdmin, async (req, res) => {
  const pr = (req as Request & { principal?: { perms: string[] | "*"; staffId: number | null } }).principal!;
  if (pr.perms === "*") return res.json({ role: "OWNER", name: "Owner", permissions: ALL_PERMS });
  const st = pr.staffId ? await prisma.staff.findUnique({ where: { id: pr.staffId } }) : null;
  res.json({ role: st?.accessRole ?? "STAFF", name: st?.name ?? "Staff", permissions: pr.perms });
});

// End-of-day closing report: everything that happened on a given date.
app.get("/api/admin/reports/daily-closing", requireAdmin, async (req, res) => {
  const date = STR((req.query as Record<string, string>).date, 10) || beirutToday();
  if (!isDate(date)) return res.status(400).json({ error: "Invalid date." });
  const dayStart = new Date(date + "T00:00:00"),
    dayEnd = new Date(date + "T23:59:59.999");
  const [appts, payments, expenses, movements] = await Promise.all([
    prisma.appointment.findMany({ where: { date }, include: { service: { select: { materialCost: true } } } }),
    prisma.payment.findMany({ where: { status: "PAID", paidAt: { gte: dayStart, lte: dayEnd } } }),
    prisma.expense.findMany({ where: { date } }),
    prisma.stockMovement.findMany({
      where: { type: "USE", createdAt: { gte: dayStart, lte: dayEnd } },
      include: { product: { select: { name: true, costPrice: true } } },
    }),
  ]);
  const completed = appts.filter((a) => a.status === "COMPLETED");
  const revenue = round2(completed.reduce((s, a) => s + a.price, 0));
  const material = round2(completed.reduce((s, a) => s + (a.service?.materialCost ?? 0), 0));
  const commission = round2(completed.reduce((s, a) => s + a.commissionAmount, 0));
  const expenseTotal = round2(expenses.reduce((s, e) => s + e.amount, 0));
  const cashReceived = round2(payments.filter((p) => p.method === "CASH").reduce((s, p) => s + p.amount, 0));
  const whishReceived = round2(payments.filter((p) => p.method === "WHISH").reduce((s, p) => s + p.amount, 0));
  const byStaff: Record<string, number> = {};
  for (const a of completed) if (a.staffName) byStaff[a.staffName] = round2((byStaff[a.staffName] ?? 0) + a.commissionAmount);
  res.json({
    date,
    revenue,
    profit: round2(revenue - material - commission - expenseTotal),
    material,
    commission,
    expenses: expenseTotal,
    cashReceived,
    whishReceived,
    totalReceived: round2(cashReceived + whishReceived),
    giftCardsSold: round2(payments.filter((p) => p.kind === "GIFTCARD").reduce((s, p) => s + p.amount, 0)),
    appointmentsCompleted: completed.length,
    cancelled: appts.filter((a) => a.status === "CANCELLED").length,
    noShows: appts.filter((a) => a.status === "NO_SHOW").length,
    booked: appts.filter((a) => a.status === "CONFIRMED").length,
    inventoryConsumed: {
      count: movements.length,
      value: round2(movements.reduce((s, m) => s + Math.abs(m.quantity) * (m.product?.costPrice ?? 0), 0)),
      items: movements.slice(0, 30).map((m) => ({ name: m.product?.name ?? "", qty: Math.abs(m.quantity) })),
    },
    staffCommissions: Object.entries(byStaff).map(([name, amount]) => ({ name, amount })),
  });
});

// Cash drawer — reconcile physical cash for a day. cashSales is derived from the
// paid CASH payments; the rest (opening, expenses, refunds, counted) is entered.
async function cashSalesFor(date: string) {
  const payments = await prisma.payment.findMany({
    where: { status: "PAID", method: "CASH", paidAt: { gte: new Date(date + "T00:00:00"), lte: new Date(date + "T23:59:59.999") } },
    select: { amount: true },
  });
  return round2(payments.reduce((s, p) => s + p.amount, 0));
}
function drawerView(d: { openingBalance: number; cashExpenses: number; refunds: number; actualCash: number }, cashSales: number) {
  const expectedCash = round2(d.openingBalance + cashSales - d.cashExpenses - d.refunds);
  return { cashSales, expectedCash, difference: round2(d.actualCash - expectedCash) };
}
app.get("/api/admin/cash-drawer", requireAdmin, async (req, res) => {
  const date = STR((req.query as Record<string, string>).date, 10) || beirutToday();
  if (!isDate(date)) return res.status(400).json({ error: "Invalid date." });
  const d = (await prisma.cashDrawer.findUnique({ where: { date } })) ?? {
    date,
    openingBalance: 0,
    cashExpenses: 0,
    refunds: 0,
    actualCash: 0,
    note: "",
    closedAt: null,
  };
  res.json({ ...d, ...drawerView(d, await cashSalesFor(date)) });
});
app.post("/api/admin/cash-drawer", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const date = STR(b.date, 10);
  if (!isDate(date)) return res.status(400).json({ error: "Invalid date." });
  const data = {
    openingBalance: round2(NUM(b.openingBalance, 0)),
    cashExpenses: round2(NUM(b.cashExpenses, 0)),
    refunds: round2(NUM(b.refunds, 0)),
    actualCash: round2(NUM(b.actualCash, 0)),
    note: STR(b.note, 300),
    closedAt: b.close ? new Date() : null,
  };
  const d = await prisma.cashDrawer.upsert({ where: { date }, create: { date, ...data }, update: data });
  res.json({ ...d, ...drawerView(d, await cashSalesFor(date)) });
});

// Admin audit trail (owner/managers with the "activity" permission).
app.get("/api/admin/activity", requireAdmin, async (_req, res) => {
  res.json(await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 300 }));
});

// Duration analytics: scheduled vs actual service time, to improve scheduling.
app.get("/api/admin/analytics/duration", requireAdmin, async (_req, res) => {
  const appts = await prisma.appointment.findMany({
    where: { status: "COMPLETED", actualMinutes: { gt: 0 } },
    select: { serviceName: true, durationMin: true, actualMinutes: true },
  });
  const byService: Record<string, { count: number; expected: number; actual: number }> = {};
  for (const a of appts) {
    const k = a.serviceName || "—";
    byService[k] ??= { count: 0, expected: 0, actual: 0 };
    byService[k].count++;
    byService[k].expected += a.durationMin;
    byService[k].actual += a.actualMinutes;
  }
  const rows = Object.entries(byService)
    .map(([name, v]) => ({
      name,
      count: v.count,
      avgExpected: Math.round(v.expected / v.count),
      avgActual: Math.round(v.actual / v.count),
      diff: Math.round((v.actual - v.expected) / v.count),
    }))
    .sort((a, b) => b.count - a.count);
  const n = appts.length;
  res.json({
    rows,
    sampleSize: n,
    avgExpected: n ? Math.round(appts.reduce((s, a) => s + a.durationMin, 0) / n) : 0,
    avgActual: n ? Math.round(appts.reduce((s, a) => s + a.actualMinutes, 0) / n) : 0,
  });
});

// Multi-branch comparison: bookings, revenue and profit per branch.
app.get("/api/admin/analytics/branches", requireAdmin, async (_req, res) => {
  const [branches, staff, appts] = await Promise.all([
    prisma.branch.findMany({ orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] }),
    prisma.staff.findMany({ where: { isActive: true }, select: { branchId: true } }),
    prisma.appointment.findMany({ where: { status: "COMPLETED" }, include: { service: { select: { materialCost: true } } } }),
  ]);
  const rowFor = (id: number | null, name: string, isDefault: boolean) => {
    const mine = appts.filter((a) => a.branchId === id);
    const revenue = round2(mine.reduce((s, a) => s + a.price, 0));
    const commission = round2(mine.reduce((s, a) => s + a.commissionAmount, 0));
    const material = round2(mine.reduce((s, a) => s + (a.service?.materialCost ?? 0), 0));
    return {
      id,
      name,
      isDefault,
      staffCount: staff.filter((s) => s.branchId === id).length,
      bookings: mine.length,
      revenue,
      profit: round2(revenue - commission - material),
    };
  };
  const rows = branches.map((b) => rowFor(b.id, b.name, b.isDefault));
  const unassigned = appts.filter((a) => a.branchId == null).length;
  if (unassigned > 0) rows.push(rowFor(null, "Unassigned", false));
  res.json(rows);
});

// In-house website analytics: traffic, top pages/services, booking funnel, sources.
app.get("/api/admin/analytics/web", requireAdmin, async (req, res) => {
  const days = Math.min(365, Math.max(1, Number((req.query as Record<string, string>).days) || 30));
  const since = new Date(Date.now() - days * 86400000);
  const events = await prisma.analyticsEvent.findMany({ where: { createdAt: { gte: since } }, select: { type: true, label: true, source: true } });
  const count = (t: string) => events.filter((e) => e.type === t).length;
  const topBy = (t: string, pick: (e: { label: string; source: string }) => string, n = 8) => {
    const m: Record<string, number> = {};
    for (const e of events)
      if (e.type === t) {
        const k = pick(e) || "";
        if (k) m[k] = (m[k] ?? 0) + 1;
      }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([label, c]) => ({ label, count: c }));
  };
  const started = count("BOOKING_STARTED"),
    completed = count("BOOKING_COMPLETED");
  res.json({
    days,
    pageViews: count("PAGE_VIEW"),
    topPages: topBy("PAGE_VIEW", (e) => e.label),
    topServices: topBy("SERVICE_VIEW", (e) => e.label),
    sources: topBy("PAGE_VIEW", (e) => e.source || "direct"),
    clicks: topBy("CLICK", (e) => e.label),
    bookingsStarted: started,
    bookingsCompleted: completed,
    conversionRate: started ? Math.round((completed / started) * 100) : 0,
  });
});

// Marketing dashboard: promo/campaign performance + customer acquisition.
app.get("/api/admin/analytics/marketing", requireAdmin, async (_req, res) => {
  const [promos, appts, customers] = await Promise.all([
    prisma.promoCode.findMany({ orderBy: { usedCount: "desc" } }),
    prisma.appointment.findMany({ where: { status: "COMPLETED", NOT: { promoCode: "" } }, select: { promoCode: true, price: true } }),
    prisma.customer.findMany({ select: { createdAt: true } }),
  ]);
  const byCode: Record<string, { revenue: number; bookings: number }> = {};
  for (const a of appts) {
    const c = a.promoCode;
    byCode[c] ??= { revenue: 0, bookings: 0 };
    byCode[c].revenue = round2(byCode[c].revenue + a.price);
    byCode[c].bookings++;
  }
  const acq: Record<string, number> = {};
  for (const c of customers) {
    const m = beirutMonth(c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt));
    acq[m] = (acq[m] ?? 0) + 1;
  }
  res.json({
    promos: promos.map((p) => ({
      code: p.code,
      description: p.description,
      type: p.type,
      value: p.value,
      uses: p.usedCount,
      maxUses: p.maxUses,
      active: p.isActive,
      revenue: byCode[p.code]?.revenue ?? 0,
      bookings: byCode[p.code]?.bookings ?? 0,
    })),
    acquisition: Object.entries(acq)
      .sort()
      .slice(-6)
      .map(([month, count]) => ({ month, count })),
    totalPromoRevenue: round2(Object.values(byCode).reduce((s, v) => s + v.revenue, 0)),
    totalRedemptions: promos.reduce((s, p) => s + p.usedCount, 0),
  });
});

// ---- Staff monthly goals + progress ----
app.get("/api/admin/staff-goals", requireAdmin, async (req, res) => {
  const month = STR((req.query as Record<string, string>).month, 7) || beirutMonth();
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Invalid month." });
  const [staff, goals, appts] = await Promise.all([
    prisma.staff.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.staffGoal.findMany({ where: { month } }),
    prisma.appointment.findMany({
      where: { status: "COMPLETED", date: { startsWith: month } },
      select: { staffId: true, price: true, commissionAmount: true },
    }),
  ]);
  res.json({
    month,
    staff: staff.map((s) => {
      const g = goals.find((x) => x.staffId === s.id);
      const mine = appts.filter((a) => a.staffId === s.id);
      return {
        staffId: s.id,
        name: s.name,
        revenueTarget: g?.revenueTarget ?? 0,
        appointmentsTarget: g?.appointmentsTarget ?? 0,
        revenue: round2(mine.reduce((sum, a) => sum + a.price, 0)),
        appointments: mine.length,
        commission: round2(mine.reduce((sum, a) => sum + a.commissionAmount, 0)),
      };
    }),
  });
});
app.post("/api/admin/staff-goals", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const staffId = Number(b.staffId),
    month = STR(b.month, 7);
  if (!staffId || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Invalid goal." });
  const data = { revenueTarget: Math.max(0, NUM(b.revenueTarget, 0)), appointmentsTarget: Math.max(0, Math.round(NUM(b.appointmentsTarget, 0))) };
  res.json(await prisma.staffGoal.upsert({ where: { staffId_month: { staffId, month } }, create: { staffId, month, ...data }, update: data }));
});

// ---- Suppliers ----
app.get("/api/admin/suppliers", requireAdmin, async (_req, res) => {
  const [suppliers, pos] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.purchaseOrder.findMany({ where: { status: "RECEIVED" }, select: { supplierId: true, total: true, receivedAt: true } }),
  ]);
  res.json(
    suppliers.map((s) => {
      const theirs = pos.filter((p) => p.supplierId === s.id);
      return {
        ...s,
        lastPurchase:
          theirs
            .map((p) => p.receivedAt)
            .filter(Boolean)
            .sort()
            .pop() ?? null,
        totalSpent: round2(theirs.reduce((sum, p) => sum + p.total, 0)),
        orderCount: theirs.length,
      };
    }),
  );
});
app.post("/api/admin/suppliers", requireAdmin, async (req, res) => {
  const name = STR(req.body?.name, 100);
  if (!name) return res.status(400).json({ error: "Supplier name is required." });
  res
    .status(201)
    .json(
      await prisma.supplier.create({
        data: { name, phone: STR(req.body?.phone, 40), email: STR(req.body?.email, 120), website: STR(req.body?.website, 200), note: STR(req.body?.note, 300) },
      }),
    );
});
app.patch("/api/admin/suppliers/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = STR(b.name, 100);
  if (b.phone !== undefined) data.phone = STR(b.phone, 40);
  if (b.email !== undefined) data.email = STR(b.email, 120);
  if (b.website !== undefined) data.website = STR(b.website, 200);
  if (b.note !== undefined) data.note = STR(b.note, 300);
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  res.json(await prisma.supplier.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/suppliers/:id", requireAdmin, async (req, res) => {
  await prisma.supplier.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// ---- Purchase orders (receiving restocks products) ----
app.get("/api/admin/purchase-orders", requireAdmin, async (_req, res) => {
  res.json((await prisma.purchaseOrder.findMany({ orderBy: { createdAt: "desc" }, take: 200 })).map((o) => ({ ...o, items: parseArr(o.items) })));
});
app.post("/api/admin/purchase-orders", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const items = (Array.isArray(b.items) ? b.items : [])
    .map((i: Record<string, unknown>) => ({
      productId: Number(i.productId) || 0,
      name: STR(i.name, 120),
      qty: Math.max(0, NUM(i.qty, 0)),
      price: Math.max(0, NUM(i.price, 0)),
    }))
    .filter((i: { name: string; qty: number }) => i.name && i.qty > 0);
  if (!items.length) return res.status(400).json({ error: "Add at least one item." });
  const total = round2(items.reduce((s: number, i: { qty: number; price: number }) => s + i.qty * i.price, 0));
  const supplierId = b.supplierId ? Number(b.supplierId) : null;
  const supplier = supplierId ? await prisma.supplier.findUnique({ where: { id: supplierId } }) : null;
  const ordered = STR(b.status, 12).toUpperCase() === "ORDERED";
  res
    .status(201)
    .json(
      await prisma.purchaseOrder.create({
        data: {
          supplierId,
          supplierName: supplier?.name ?? STR(b.supplierName, 100),
          status: ordered ? "ORDERED" : "DRAFT",
          items: JSON.stringify(items),
          total,
          note: STR(b.note, 300),
          orderedAt: ordered ? new Date() : null,
        },
      }),
    );
});
app.post("/api/admin/purchase-orders/:id/receive", requireAdmin, async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: Number(req.params.id) } });
  if (!po) return res.status(404).json({ error: "Not found." });
  if (po.status === "RECEIVED") return res.json({ ...po, items: parseArr(po.items) });
  const items = parseArr(po.items) as { productId: number; name: string; qty: number; price: number }[];
  for (const it of items) {
    if (!it.productId) continue;
    await prisma.product
      .update({ where: { id: it.productId }, data: { quantity: { increment: it.qty }, ...(it.price > 0 ? { costPrice: it.price } : {}) } })
      .catch(() => {});
    await prisma.stockMovement
      .create({ data: { productId: it.productId, type: "RECEIVE", quantity: it.qty, note: `PO #${po.id}${po.supplierName ? ` · ${po.supplierName}` : ""}` } })
      .catch(() => {});
  }
  const updated = await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: "RECEIVED", receivedAt: new Date() } });
  res.json({ ...updated, items: parseArr(updated.items) });
});
app.post("/api/admin/purchase-orders/:id/status", requireAdmin, async (req, res) => {
  const status = STR(req.body?.status, 12).toUpperCase();
  if (!["DRAFT", "ORDERED", "CANCELLED"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  res.json(
    await prisma.purchaseOrder.update({ where: { id: Number(req.params.id) }, data: { status, ...(status === "ORDERED" ? { orderedAt: new Date() } : {}) } }),
  );
});
app.delete("/api/admin/purchase-orders/:id", requireAdmin, async (req, res) => {
  await prisma.purchaseOrder.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// Customer analytics: lifetime value, repeat rate, retention, acquisition, top spenders.
app.get("/api/admin/analytics/customers", requireAdmin, async (_req, res) => {
  const customers = await prisma.customer.findMany({ include: { appointments: { select: { price: true, status: true, date: true } } } });
  const now = Date.now();
  let repeat = 0,
    withVisit = 0,
    totalSpent = 0,
    active90 = 0;
  const clv: { name: string; spent: number; visits: number }[] = [];
  const acq: Record<string, number> = {};
  for (const c of customers) {
    const done = c.appointments.filter((a) => a.status === "COMPLETED");
    const spent = round2(done.reduce((s, a) => s + a.price, 0));
    totalSpent += spent;
    if (done.length >= 1) withVisit++;
    if (done.length >= 2) repeat++;
    const lastVisit = done
      .map((a) => a.date)
      .sort()
      .pop();
    if (lastVisit && now - new Date(lastVisit + "T00:00:00").getTime() <= 90 * 86400000) active90++;
    clv.push({ name: c.name, spent, visits: done.length });
    const m = beirutMonth(c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt));
    acq[m] = (acq[m] ?? 0) + 1;
  }
  const total = customers.length;
  clv.sort((a, b) => b.spent - a.spent);
  res.json({
    totalCustomers: total,
    repeatCustomers: repeat,
    repeatRate: withVisit ? Math.round((repeat / withVisit) * 100) : 0,
    avgLifetimeValue: total ? round2(totalSpent / total) : 0,
    active90,
    retentionRate: withVisit ? Math.round((active90 / withVisit) * 100) : 0,
    topCustomers: clv.filter((c) => c.spent > 0).slice(0, 8),
    acquisition: Object.entries(acq)
      .sort()
      .slice(-6)
      .map(([month, count]) => ({ month, count })),
  });
});

// Global search across the whole system (customers, bookings, gift cards, …).
app.get("/api/admin/search", requireAdmin, async (req, res) => {
  const q = STR((req.query as Record<string, string>).q, 60);
  if (q.length < 2) return res.json({ results: [] });
  const like = { contains: q, mode: "insensitive" as const };
  const upper = q.toUpperCase();
  const [customers, services, staff, packages, courses, giftcards, payments] = await Promise.all([
    prisma.customer.findMany({
      where: { OR: [{ name: like }, { phone: { contains: q } }, { email: like }] },
      take: 6,
      select: { id: true, name: true, phone: true },
    }),
    prisma.service.findMany({ where: { name: like }, take: 5, select: { id: true, name: true } }),
    prisma.staff.findMany({ where: { name: like }, take: 5, select: { id: true, name: true, role: true } }),
    prisma.package.findMany({ where: { title: like }, take: 5, select: { id: true, title: true } }),
    prisma.course.findMany({ where: { title: like }, take: 5, select: { id: true, title: true } }),
    prisma.giftCard.findMany({ where: { code: { contains: upper } }, take: 5, select: { code: true, balance: true } }),
    prisma.payment.findMany({
      where: { OR: [{ reference: { contains: upper } }, { customerName: like }] },
      take: 5,
      select: { reference: true, amount: true, method: true },
    }),
  ]);
  res.json({
    results: [
      ...customers.map((c) => ({ type: "Customer", label: c.name, detail: c.phone, tab: "customers" })),
      ...services.map((s) => ({ type: "Service", label: s.name, detail: "", tab: "services" })),
      ...staff.map((s) => ({ type: "Staff", label: s.name, detail: s.role, tab: "staff" })),
      ...packages.map((p) => ({ type: "Package", label: p.title, detail: "", tab: "packages" })),
      ...courses.map((c) => ({ type: "Course", label: c.title, detail: "", tab: "academy" })),
      ...giftcards.map((g) => ({ type: "Gift card", label: g.code, detail: `$${g.balance}`, tab: "giftcards" })),
      ...payments.map((p) => ({ type: "Payment", label: p.reference, detail: `$${p.amount} · ${p.method}`, tab: "payments" })),
    ],
  });
});

// Owner data export (JSON) — a downloadable manual backup of the key tables.
// (The database itself is continuously backed up at the host; in-app restore is
// intentionally not exposed — that belongs to the host's point-in-time recovery.)
app.get("/api/admin/export", requireAdmin, async (_req, res) => {
  const [
    customers,
    appointments,
    payments,
    giftCards,
    products,
    stockMovements,
    expenses,
    reviews,
    suppliers,
    purchaseOrders,
    courses,
    packages,
    promoCodes,
    staffGoals,
  ] = await Promise.all([
    prisma.customer.findMany(),
    prisma.appointment.findMany(),
    prisma.payment.findMany(),
    prisma.giftCard.findMany(),
    prisma.product.findMany(),
    prisma.stockMovement.findMany(),
    prisma.expense.findMany(),
    prisma.review.findMany(),
    prisma.supplier.findMany(),
    prisma.purchaseOrder.findMany(),
    prisma.course.findMany(),
    prisma.package.findMany(),
    prisma.promoCode.findMany(),
    prisma.staffGoal.findMany(),
  ]);
  res.json({
    exportedAt: new Date().toISOString(),
    customers,
    appointments,
    payments,
    giftCards,
    products,
    stockMovements,
    expenses,
    reviews,
    suppliers,
    purchaseOrders,
    courses,
    packages,
    promoCodes,
    staffGoals,
  });
});

// Emergency close — pause online booking + show a site-wide notice.
app.get("/api/admin/settings/emergency", requireAdmin, async (_req, res) => res.json(await getSetting("emergencyClose", EMERGENCY_DEFAULT)));
app.post("/api/admin/settings/emergency", requireAdmin, async (req, res) => {
  const closed = !!req.body?.closed,
    message = STR(req.body?.message, 300);
  await setSetting("emergencyClose", { closed, message });
  res.json({ closed, message });
});

// Internal team message board (shared; any authenticated staff can read/post).
app.get("/api/admin/messages", requireAdmin, async (_req, res) => {
  res.json(await prisma.internalMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 }));
});
app.post("/api/admin/messages", requireAdmin, async (req, res) => {
  const body = STR(req.body?.body, 1000);
  if (!body) return res.status(400).json({ error: "Empty message." });
  const author = STR((req as Request & { principal?: { actorName?: string } }).principal?.actorName, 80) || "Staff";
  res.status(201).json(await prisma.internalMessage.create({ data: { author, body } }));
});
app.delete("/api/admin/messages/:id", requireAdmin, async (req, res) => {
  await prisma.internalMessage.delete({ where: { id: STR(req.params.id, 40) } }).catch(() => {});
  res.json({ ok: true });
});

// Unified alert center — everything that needs the owner's attention, in one place.
app.get("/api/admin/alerts", requireAdmin, async (_req, res) => {
  const today = beirutToday();
  const tomorrow = beirutDay(1);
  const monthMM = today.slice(5, 7);
  const [products, pendingReviews, expiringCards, pendingPayments, tmrwAppts, waiting, customers] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, select: { name: true, quantity: true, minQuantity: true } }),
    prisma.review.count({ where: { status: "PENDING" } }),
    prisma.giftCard.findMany({
      where: { status: "ACTIVE", expiresAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400000) } },
      select: { code: true },
    }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.appointment.count({ where: { date: tomorrow, status: "CONFIRMED" } }),
    prisma.waitlistEntry.count({ where: { status: "WAITING" } }),
    prisma.customer.findMany({ where: { NOT: { birthday: "" } }, select: { name: true, birthday: true } }),
  ]);
  const lowStock = products.filter((p) => p.minQuantity > 0 && p.quantity <= p.minQuantity);
  const birthdays = customers.filter((c) => (c.birthday.length >= 7 ? c.birthday.slice(5, 7) : c.birthday.slice(0, 2)) === monthMM);
  const plural = (n: number) => (n === 1 ? "" : "s");
  const alerts: { type: string; severity: string; title: string; detail?: string; tab: string }[] = [];
  if (lowStock.length)
    alerts.push({
      type: "lowstock",
      severity: "high",
      title: `${lowStock.length} product${plural(lowStock.length)} low on stock`,
      detail: lowStock
        .slice(0, 3)
        .map((p) => p.name)
        .join(", "),
      tab: "inventory",
    });
  if (pendingPayments)
    alerts.push({
      type: "payments",
      severity: "high",
      title: `${pendingPayments} pending payment${plural(pendingPayments)}`,
      detail: "Awaiting cash or Whish confirmation",
      tab: "payments",
    });
  if (pendingReviews)
    alerts.push({ type: "reviews", severity: "medium", title: `${pendingReviews} review${plural(pendingReviews)} awaiting approval`, tab: "reviews" });
  if (expiringCards.length)
    alerts.push({
      type: "giftcards",
      severity: "medium",
      title: `${expiringCards.length} gift card${plural(expiringCards.length)} expiring soon`,
      detail: "Within 30 days",
      tab: "giftcards",
    });
  if (tmrwAppts)
    alerts.push({
      type: "reminders",
      severity: "info",
      title: `${tmrwAppts} appointment${plural(tmrwAppts)} tomorrow`,
      detail: "Send reminders",
      tab: "bookings",
    });
  if (birthdays.length)
    alerts.push({
      type: "birthdays",
      severity: "info",
      title: `${birthdays.length} birthday${plural(birthdays.length)} this month`,
      detail: birthdays
        .slice(0, 3)
        .map((c) => c.name)
        .join(", "),
      tab: "customers",
    });
  if (waiting) alerts.push({ type: "waitlist", severity: "info", title: `${waiting} on the waitlist`, tab: "waitlist" });
  res.json({ count: alerts.length, alerts });
});

app.get("/api/admin/appointments", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;
  const date = STR(q.date, 10),
    from = STR(q.from, 10),
    to = STR(q.to, 10);
  const where = date ? { date } : isDate(from) && isDate(to) ? { date: { gte: from, lte: to } } : {};
  const items = await prisma.appointment.findMany({ where, orderBy: [{ date: "asc" }, { time: "asc" }], take: 1000 });
  res.json(items.map((a) => ({ ...a, addOns: parseArr(a.addOns) })));
});
app.patch("/api/admin/appointments/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  if (b.actualMinutes !== undefined)
    await prisma.appointment.update({ where: { id }, data: { actualMinutes: Math.max(0, Math.round(NUM(b.actualMinutes, 0))) } }).catch(() => {});
  // Discount / "paid less": set the final price. Revenue + commission derive from
  // appointment.price, so we recompute the commission and sync the linked payment.
  if (b.price !== undefined) {
    const appt = await prisma.appointment.findUnique({ where: { id } });
    if (!appt) return res.status(404).json({ error: "Not found." });
    const price = Math.max(0, round2(NUM(b.price, appt.price)));
    const commissionAmount = round2((price * appt.commissionPct) / 100);
    await prisma.appointment.update({ where: { id }, data: { price, commissionAmount } });
    // The payment covers the whole visit — resync it to the group's new total.
    const gAppts = await prisma.appointment.findMany({ where: appt.groupId ? { groupId: appt.groupId } : { id } });
    const total = round2(gAppts.reduce((s, a) => s + a.price, 0));
    const payId = appt.paymentId ?? gAppts.find((a) => a.paymentId)?.paymentId;
    if (payId) await prisma.payment.update({ where: { id: payId }, data: { amount: total } }).catch(() => {});
    return res.json(await prisma.appointment.findUnique({ where: { id } }));
  }
  if (b.status !== undefined) {
    const status = STR(b.status, 20).toUpperCase();
    if (!["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"].includes(status)) return res.status(400).json({ error: "Invalid status." });
    const updated = await setAppointmentStatus(id, status);
    if (!updated) return res.status(404).json({ error: "Not found." });
    return res.json(updated);
  }
  res.json(await prisma.appointment.findUnique({ where: { id } }));
});
// Permanently delete a booking (e.g. cleaning up a cancelled/test entry). Also
// removes its linked money record unless that payment was actually PAID (keep
// real revenue history). paymentId/appointmentId are loose links, so no cascade.
app.delete("/api/admin/appointments/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) return res.status(404).json({ error: "Not found." });
  if (appt.paymentId) {
    const pay = await prisma.payment.findUnique({ where: { id: appt.paymentId } }).catch(() => null);
    if (pay && pay.status !== "PAID") await prisma.payment.delete({ where: { id: pay.id } }).catch(() => {});
  }
  await prisma.appointment.delete({ where: { id } });
  res.json({ ok: true });
});
// Front-desk booking (staff enters a phone-in appointment). More lenient than the
// public flow — trusts staff on timing; links an existing customer by phone/email.
app.post("/api/admin/appointments/new", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const date = STR(b.date, 10),
    time = STR(b.time, 5);
  const name = STR(b.customerName, 80),
    phone = STR(b.customerPhone, 40),
    email = STR(b.customerEmail, 120);
  if (!name || !phone) return res.status(400).json({ error: "Customer name and phone are required." });
  if (!isDate(date) || !isTime(time)) return res.status(400).json({ error: "Please pick a valid date and time." });
  const serviceIds: number[] = Array.isArray(b.serviceIds) ? b.serviceIds.map(Number).filter((n: number) => n > 0) : b.serviceId ? [Number(b.serviceId)] : [];
  const pr = b.packageId ? await resolvePackage(Number(b.packageId)) : null;
  const sr = pr ? null : await resolveServices(serviceIds, []);
  const r = pr ?? sr;
  if (!r) return res.status(404).json({ error: "That service or package isn't available." });
  if (!r.eligible.length) return res.status(409).json({ error: "No single specialist offers all of those services — book them separately." });
  let staffId = b.staffId ? Number(b.staffId) : null;
  if (staffId != null && !r.eligible.some((s) => s.id === staffId)) staffId = null;
  if (staffId == null) {
    const existing = await prisma.appointment.findMany({ where: { date }, select: { time: true, durationMin: true, staffId: true, status: true } });
    staffId = pickFreeStaff({ date, time, durationMin: r.durationMin, staff: r.eligible, existing }) ?? r.eligible[0]?.id ?? null;
  }
  const chosen = r.eligible.find((s) => s.id === staffId);
  const commissionPct = chosen?.commissionPct ?? 0;
  const cust = await prisma.customer.findFirst({ where: { OR: [...(email ? [{ email: email.toLowerCase() }] : []), { phone }] } }).catch(() => null);
  // One appointment per service, chained back-to-back (same pattern as the public flow).
  const segs = pr
    ? [{ serviceId: null as number | null, packageId: pr.pkg.id as number | null, name: pr.pkg.title, durationMin: pr.durationMin, price: r.price }]
    : sr!.segments.map((g) => ({
        serviceId: g.service.id as number | null,
        packageId: null as number | null,
        name: g.service.name,
        durationMin: g.durationMin,
        price: g.price,
      }));
  const groupId = segs.length > 1 ? crypto.randomUUID() : "";
  const branchId = await defaultBranchId();
  const appts = [];
  let offset = 0;
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    appts.push(
      await prisma.appointment.create({
        data: {
          groupId,
          serviceId: g.serviceId,
          packageId: g.packageId,
          staffId,
          customerId: cust?.id ?? null,
          customerName: name,
          customerPhone: phone,
          customerEmail: email,
          date,
          time: toHHMM(toMin(time) + offset),
          durationMin: g.durationMin,
          serviceName: g.name,
          staffName: chosen?.name ?? "",
          addOns: "[]",
          price: g.price,
          commissionPct,
          commissionAmount: round2((g.price * commissionPct) / 100),
          note: i === 0 ? STR(b.note, 500) : "",
          branchId,
          status: "CONFIRMED",
          paymentMethod: "CASH",
          paymentStatus: "PENDING",
        },
      }),
    );
    offset += g.durationMin;
  }
  const appointment = appts[0];
  const payment = await createPayment({
    kind: "BOOKING",
    method: "CASH",
    amount: r.price,
    appointmentId: appointment.id,
    customerName: name,
    customerEmail: email,
    customerPhone: phone,
  });
  await prisma.appointment.update({ where: { id: appointment.id }, data: { paymentId: payment.id } });
  notify("confirmation", { email: email || undefined, phone, data: { name, service: appts.map((a) => a.serviceName).join(" + "), date, time } });
  res.status(201).json({ ok: true, appointment, appointments: appts, payment: { reference: payment.reference, status: payment.status } });
});

// ---- Admin: payments ----
app.get("/api/admin/payments", requireAdmin, async (req, res) => {
  await releaseStaleWhishHolds();
  const status = STR((req.query as Record<string, string>).status, 20).toUpperCase();
  const method = STR((req.query as Record<string, string>).method, 20).toUpperCase();
  const where: Record<string, unknown> = {};
  if (["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED"].includes(status)) where.status = status;
  if (isPaymentMethod(method)) where.method = method;
  const items = await prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  res.json(items);
});
// Manual confirmation for CASH only. Online methods are confirmed by the gateway webhook.
app.post("/api/admin/payments/:id/mark-paid", requireAdmin, async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: STR(req.params.id, 40) } });
  if (!p) return res.status(404).json({ error: "Payment not found." });
  if (p.method !== "CASH")
    return res.status(400).json({ error: "Only cash payments are marked paid manually — online payments are confirmed automatically by the gateway." });
  if (p.status === "PAID") return res.json(p);
  res.json(await markPaymentPaid(p));
});
// Pay a booking with a gift card: deducts the card balance, marks the booking paid,
// and reports any cash remainder to collect. (Path enforces the "bookings" permission.)
app.post("/api/admin/appointments/:id/pay-giftcard", requireAdmin, async (req, res) => {
  const apptId = Number(req.params.id);
  const code = STR(req.body?.code, 40).toUpperCase();
  if (!code) return res.status(400).json({ error: "Enter a gift card code." });
  const appt = await prisma.appointment.findUnique({ where: { id: apptId } });
  if (!appt) return res.status(404).json({ error: "Booking not found." });
  if (appt.status === "CANCELLED") return res.status(400).json({ error: "This booking is cancelled." });
  if (appt.paymentStatus === "PAID") return res.status(400).json({ error: "This booking is already paid." });
  const card = await prisma.giftCard.findUnique({ where: { code } });
  if (!card) return res.status(404).json({ error: "No gift card with that code." });
  if (card.status !== "ACTIVE" && card.status !== "REDEEMED") return res.status(400).json({ error: "This gift card isn't active." });
  if (card.expiresAt && card.expiresAt.getTime() < Date.now()) return res.status(400).json({ error: "This gift card has expired." });
  if (card.balance <= 0) return res.status(400).json({ error: "This gift card has no balance left." });

  // A multi-service visit is paid as one: total the group and settle its single payment.
  const groupWhere = appt.groupId ? { groupId: appt.groupId } : { id: appt.id };
  const groupAppts = await prisma.appointment.findMany({ where: groupWhere });
  const price = round2(groupAppts.reduce((s, a) => s + a.price, 0));
  const gift = round2(Math.min(card.balance, price));
  const cashRemainder = round2(price - gift);
  const newBalance = round2(card.balance - gift);

  await prisma.giftCard.update({ where: { id: card.id }, data: { balance: newBalance, status: newBalance <= 0 ? "REDEEMED" : "ACTIVE" } });

  // Attach to the visit's payment (create one if it never had a payment record), then mark paid.
  let payment = await prisma.payment.findFirst({ where: { appointmentId: { in: groupAppts.map((a) => a.id) } }, orderBy: { createdAt: "desc" } });
  if (!payment)
    payment = await createPayment({
      kind: "BOOKING",
      method: "GIFTCARD",
      amount: price,
      appointmentId: apptId,
      customerName: appt.customerName,
      customerEmail: appt.customerEmail,
      customerPhone: appt.customerPhone,
    });
  await prisma.payment.update({ where: { id: payment.id }, data: { method: "GIFTCARD", provider: "giftcard", providerRef: card.code } });
  await prisma.appointment.updateMany({ where: groupWhere, data: { paymentMethod: "GIFTCARD" } }).catch(() => {});
  const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
  if (fresh) await markPaymentPaid(fresh, { providerData: { giftCard: card.code, giftApplied: gift, cashRemainder } });

  res.json({ ok: true, giftApplied: gift, cashRemainder, cardBalance: newBalance, cardCode: card.code, service: appt.serviceName });
});
// Cancel an unpaid payment (releases the booking hold / voids the pending gift card).
app.post("/api/admin/payments/:id/cancel", requireAdmin, async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: STR(req.params.id, 40) } });
  if (!p) return res.status(404).json({ error: "Payment not found." });
  if (p.status === "PAID") return res.status(400).json({ error: "This payment is already paid — issue a refund instead." });
  res.json(await voidPayment(p, "CANCELLED"));
});

// ---- Admin: catalog ----
app.get("/api/admin/catalog", requireAdmin, async (_req, res) => {
  res.json(
    await prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { services: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, addOns: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    }),
  );
});
app.post("/api/admin/categories", requireAdmin, async (req, res) => {
  const name = STR(req.body?.name, 60);
  if (!name) return res.status(400).json({ error: "Category name is required." });
  const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
  res.status(201).json(await prisma.category.create({ data: { name, emoji: STR(req.body?.emoji, 8), sortOrder: (max._max.sortOrder ?? 0) + 1 } }));
});
app.patch("/api/admin/categories/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = STR(b.name, 60);
  if (b.emoji !== undefined) data.emoji = STR(b.emoji, 8);
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  res.json(await prisma.category.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/categories/:id", requireAdmin, async (req, res) => {
  await prisma.category.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

app.post("/api/admin/services", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const categoryId = Number(b.categoryId),
    name = STR(b.name, 80);
  if (!categoryId || !name) return res.status(400).json({ error: "Category and service name are required." });
  const max = await prisma.service.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
  res
    .status(201)
    .json(
      await prisma.service.create({
        data: {
          categoryId,
          name,
          description: STR(b.description, 600),
          durationMin: Math.max(5, NUM(b.durationMin, 30)),
          price: Math.max(0, NUM(b.price, 0)),
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      }),
    );
});
app.patch("/api/admin/services/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = STR(b.name, 80);
  if (b.description !== undefined) data.description = STR(b.description, 600);
  if (b.durationMin !== undefined) data.durationMin = Math.max(5, NUM(b.durationMin, 30));
  if (b.price !== undefined) data.price = Math.max(0, NUM(b.price, 0));
  if (b.materialCost !== undefined) data.materialCost = Math.max(0, NUM(b.materialCost, 0));
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  if (b.categoryId !== undefined) data.categoryId = Number(b.categoryId);
  res.json(await prisma.service.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/services/:id", requireAdmin, async (req, res) => {
  await prisma.service.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

app.post("/api/admin/addons", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const categoryId = Number(b.categoryId),
    name = STR(b.name, 80);
  if (!categoryId || !name) return res.status(400).json({ error: "Category and add-on name are required." });
  const max = await prisma.addOn.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
  res
    .status(201)
    .json(
      await prisma.addOn.create({
        data: {
          categoryId,
          name,
          durationMin: Math.max(0, NUM(b.durationMin, 0)),
          price: Math.max(0, NUM(b.price, 0)),
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      }),
    );
});
app.patch("/api/admin/addons/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = STR(b.name, 80);
  if (b.durationMin !== undefined) data.durationMin = Math.max(0, NUM(b.durationMin, 0));
  if (b.price !== undefined) data.price = Math.max(0, NUM(b.price, 0));
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  res.json(await prisma.addOn.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/addons/:id", requireAdmin, async (req, res) => {
  await prisma.addOn.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

app.post("/api/admin/reorder", requireAdmin, async (req, res) => {
  const type = STR(req.body?.type, 10),
    id = Number(req.body?.id),
    up = STR(req.body?.direction, 4) === "up";
  type Row = { id: number; sortOrder: number };
  const pick = (list: Row[]): [Row, Row] | null => {
    const i = list.findIndex((x) => x.id === id);
    const o = list[i + (up ? -1 : 1)];
    return i >= 0 && o ? [list[i], o] : null;
  };
  if (type === "category") {
    const p = pick(await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }));
    if (p) {
      await prisma.category.update({ where: { id: p[0].id }, data: { sortOrder: p[1].sortOrder } });
      await prisma.category.update({ where: { id: p[1].id }, data: { sortOrder: p[0].sortOrder } });
    }
  } else if (type === "service") {
    const s = await prisma.service.findUnique({ where: { id } });
    const p = s ? pick(await prisma.service.findMany({ where: { categoryId: s.categoryId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })) : null;
    if (p) {
      await prisma.service.update({ where: { id: p[0].id }, data: { sortOrder: p[1].sortOrder } });
      await prisma.service.update({ where: { id: p[1].id }, data: { sortOrder: p[0].sortOrder } });
    }
  } else if (type === "addon") {
    const a = await prisma.addOn.findUnique({ where: { id } });
    const p = a ? pick(await prisma.addOn.findMany({ where: { categoryId: a.categoryId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })) : null;
    if (p) {
      await prisma.addOn.update({ where: { id: p[0].id }, data: { sortOrder: p[1].sortOrder } });
      await prisma.addOn.update({ where: { id: p[1].id }, data: { sortOrder: p[0].sortOrder } });
    }
  } else return res.status(400).json({ error: "Bad type." });
  res.json({ ok: true });
});

// ---- Admin: staff / specialists ----
app.get("/api/admin/staff", requireAdmin, async (_req, res) => {
  const staff = await prisma.staff.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { services: { select: { id: true } } } });
  res.json(
    staff.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      avatar: s.avatar,
      isActive: s.isActive,
      commissionPct: s.commissionPct,
      schedule: parseSchedule(s.schedule),
      blockedDates: parseArr(s.blockedDates),
      serviceIds: s.services.map((x) => x.id),
      loginEmail: s.loginEmail,
      hasLogin: !!s.passwordHash,
      accessRole: s.accessRole,
      permissions: parseArr(s.permissions),
    })),
  );
});
app.post("/api/admin/staff", requireAdmin, async (req, res) => {
  const name = STR(req.body?.name, 60);
  if (!name) return res.status(400).json({ error: "Staff name is required." });
  const max = await prisma.staff.aggregate({ _max: { sortOrder: true } });
  res
    .status(201)
    .json(
      await prisma.staff.create({
        data: {
          name,
          role: STR(req.body?.role, 60),
          commissionPct: Math.max(0, Math.min(100, NUM(req.body?.commissionPct, 0))),
          schedule: JSON.stringify(DEFAULT_SCHEDULE),
          blockedDates: "[]",
          sortOrder: (max._max.sortOrder ?? 0) + 1,
          branchId: await defaultBranchId(),
        },
      }),
    );
});
app.patch("/api/admin/staff/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = STR(b.name, 60);
  if (b.role !== undefined) data.role = STR(b.role, 60);
  if (b.avatar !== undefined) data.avatar = b.avatar ? STR(b.avatar, 500) : null;
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  if (b.commissionPct !== undefined) data.commissionPct = Math.max(0, Math.min(100, NUM(b.commissionPct, 0)));
  if (Array.isArray(b.schedule)) data.schedule = JSON.stringify(b.schedule);
  if (Array.isArray(b.blockedDates)) data.blockedDates = JSON.stringify(b.blockedDates.map((d: unknown) => STR(d, 10)));
  if (Array.isArray(b.serviceIds)) data.services = { set: b.serviceIds.map((id: number) => ({ id: Number(id) })) };
  if (b.loginEmail !== undefined) data.loginEmail = STR(b.loginEmail, 120).toLowerCase() || null;
  if (b.password) data.passwordHash = await bcrypt.hash(String(b.password), 10);
  if (b.accessRole !== undefined) {
    const ar = STR(b.accessRole, 20).toUpperCase();
    data.accessRole = ["OWNER", "MANAGER", "RECEPTIONIST", "STAFF"].includes(ar) ? ar : "STAFF";
  }
  if (Array.isArray(b.permissions))
    data.permissions = JSON.stringify(b.permissions.map((x: unknown) => STR(x, 20)).filter((x: string) => ALL_PERMS.includes(x)));
  await prisma.staff.update({ where: { id: Number(req.params.id) }, data });
  res.json({ ok: true });
});
app.delete("/api/admin/staff/:id", requireAdmin, async (req, res) => {
  await prisma.staff.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// ---- Admin: commission report ----
app.get("/api/admin/commissions", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;
  const from = STR(q.from, 10) || "0000-00-00",
    to = STR(q.to, 10) || "9999-99-99";
  const appts = await prisma.appointment.findMany({
    where: { date: { gte: from, lte: to }, status: { not: "CANCELLED" } },
    select: { staffId: true, staffName: true, price: true, commissionAmount: true, status: true },
  });
  const map = new Map<number, { staffId: number; staffName: string; appts: number; revenue: number; commission: number }>();
  for (const a of appts) {
    const key = a.staffId ?? 0;
    const e = map.get(key) ?? { staffId: key, staffName: a.staffName || "Unassigned", appts: 0, revenue: 0, commission: 0 };
    e.appts++;
    e.revenue = round2(e.revenue + a.price);
    e.commission = round2(e.commission + a.commissionAmount);
    map.set(key, e);
  }
  res.json({ from, to, rows: [...map.values()].sort((a, b) => b.commission - a.commission) });
});

// ---- Staff portal: each employee logs in and sees only their own calendar ----
const STAFF_SECRET = process.env.STAFF_SECRET || ADMIN_KEY + "::staff";
const signStaff = (id: number) => `${id}.${crypto.createHmac("sha256", STAFF_SECRET).update(String(id)).digest("hex")}`;
const verifyStaff = (token: string): number | null => {
  const [id, sig] = String(token).split(".");
  if (!id || !sig) return null;
  const good = crypto.createHmac("sha256", STAFF_SECRET).update(id).digest("hex");
  return sig === good ? Number(id) : null;
};
const staffOf = (req: Request) => (req as Request & { staffId?: number }).staffId!;
function requireStaff(req: Request, res: Response, next: NextFunction) {
  const id = verifyStaff(String(req.headers["x-staff-token"] ?? ""));
  if (!id) return res.status(401).json({ error: "Please log in." });
  (req as Request & { staffId?: number }).staffId = id;
  next();
}

app.post("/api/staff/login", async (req, res) => {
  const email = STR(req.body?.email, 120).toLowerCase();
  const password = String(req.body?.password ?? "");
  const staff = await prisma.staff.findUnique({ where: { loginEmail: email } });
  if (!staff || !staff.passwordHash || !staff.isActive || !(await bcrypt.compare(password, staff.passwordHash)))
    return res.status(401).json({ error: "Wrong email or password." });
  res.json({ token: signStaff(staff.id), staff: { id: staff.id, name: staff.name, role: staff.role } });
});
app.get("/api/staff/me", requireStaff, async (req, res) => {
  const s = await prisma.staff.findUnique({ where: { id: staffOf(req) } });
  if (!s) return res.status(404).json({ error: "Not found." });
  res.json({
    id: s.id,
    name: s.name,
    role: s.role,
    commissionPct: s.commissionPct,
    schedule: parseSchedule(s.schedule),
    blockedDates: parseArr(s.blockedDates),
  });
});
app.get("/api/staff/me/appointments", requireStaff, async (req, res) => {
  const date = STR((req.query as Record<string, string>).date, 10);
  const items = await prisma.appointment.findMany({
    where: { staffId: staffOf(req), ...(date ? { date } : {}) },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    take: 300,
  });
  res.json(items.map((a) => ({ ...a, addOns: parseArr(a.addOns) })));
});
app.patch("/api/staff/me/appointments/:id", requireStaff, async (req, res) => {
  const status = STR(req.body?.status, 20).toUpperCase();
  if (!["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  const appt = await prisma.appointment.findUnique({ where: { id: Number(req.params.id) } });
  if (!appt || appt.staffId !== staffOf(req)) return res.status(404).json({ error: "Not found." });
  res.json(await setAppointmentStatus(appt.id, status));
});

// ---- Admin: reviews (moderation) ----
app.get("/api/admin/reviews", requireAdmin, async (_req, res) => {
  res.json(await prisma.review.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));
});
app.patch("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.status !== undefined) {
    const s = STR(b.status, 20).toUpperCase();
    if (!["PENDING", "APPROVED", "HIDDEN"].includes(s)) return res.status(400).json({ error: "Invalid status." });
    data.status = s;
  }
  if (b.featured !== undefined) data.featured = !!b.featured;
  if (b.reply !== undefined) {
    data.reply = STR(b.reply, 1000);
    data.repliedAt = data.reply ? new Date() : null;
  }
  res.json(await prisma.review.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
  await prisma.review.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// ---- Admin: gift cards + settings ----
app.get("/api/admin/gift-cards", requireAdmin, async (_req, res) => {
  const cards = await prisma.giftCard.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  const now = Date.now();
  const sold = cards.filter((c) => c.status === "ACTIVE" || c.status === "REDEEMED"); // paid & issued
  const issued = round2(cards.reduce((s, c) => s + c.initialValue, 0));
  const revenue = round2(sold.reduce((s, c) => s + c.initialValue, 0)); // money actually collected for cards
  const outstanding = round2(cards.filter((c) => c.status === "ACTIVE").reduce((s, c) => s + c.balance, 0));
  const redeemedValue = round2(cards.reduce((s, c) => s + (c.status === "VOID" || c.status === "PENDING" ? 0 : c.initialValue - c.balance), 0));
  res.json({
    items: cards,
    summary: {
      count: cards.length,
      issued,
      outstanding,
      redeemed: redeemedValue,
      soldCount: sold.length,
      revenue,
      redeemedCount: cards.filter((c) => c.status === "REDEEMED").length,
      expiredCount: cards.filter((c) => c.status === "ACTIVE" && c.expiresAt && new Date(c.expiresAt).getTime() < now).length,
      pendingCount: cards.filter((c) => c.status === "PENDING").length,
    },
  });
});
app.post("/api/admin/gift-cards/:id/redeem", requireAdmin, async (req, res) => {
  const card = await prisma.giftCard.findUnique({ where: { id: Number(req.params.id) } });
  if (!card) return res.status(404).json({ error: "Gift card not found." });
  if (card.status !== "ACTIVE") return res.status(400).json({ error: "This card isn't active." });
  const amount = round2(NUM(req.body?.amount, 0));
  if (!(amount > 0) || amount > card.balance) return res.status(400).json({ error: "Invalid amount." });
  const balance = round2(card.balance - amount);
  res.json(await prisma.giftCard.update({ where: { id: card.id }, data: { balance, status: balance <= 0 ? "REDEEMED" : card.status } }));
});
app.post("/api/admin/gift-cards/:id/void", requireAdmin, async (req, res) => {
  res.json(await prisma.giftCard.update({ where: { id: Number(req.params.id) }, data: { status: "VOID" } }));
});
app.get("/api/admin/settings/giftcard", requireAdmin, async (_req, res) => res.json(await getSetting("giftcard", GC_DEFAULT)));
app.patch("/api/admin/settings/giftcard", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const cur = await getSetting("giftcard", GC_DEFAULT);
  const next = {
    amounts: Array.isArray(b.amounts) ? b.amounts.map(Number).filter((n: number) => n > 0) : cur.amounts,
    min: b.min !== undefined ? Math.max(1, NUM(b.min, cur.min)) : cur.min,
    max: b.max !== undefined ? Math.max(1, NUM(b.max, cur.max)) : cur.max,
    expiryMonths: b.expiryMonths !== undefined ? Math.max(0, NUM(b.expiryMonths, cur.expiryMonths)) : cur.expiryMonths,
  };
  await setSetting("giftcard", next);
  res.json(next);
});

// ---- Editable site content (text + photos the manager controls) ----
// Defaults mirror the salon's launch content; admin edits are stored as overrides.
const SITE_CONTENT_DEFAULT = {
  name: "Riwa's Glam",
  logo: "/logo.svg", // header logo — clean traced vector (transparent gold), scales sharp at any size
  tagline: "Makeup · Lashes · Nails · Beauty",
  heroTitle: "Look your best,\nfeel your best.",
  heroSub: "Makeup, lashes, brows, nails, facials & more — by Riwa Imad and her team in Aley, Lebanon. Book your appointment online in under a minute.",
  heroImage: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=1000&q=80&auto=format&fit=crop",
  phone: "+961 78 910 551",
  whatsapp: "96178910551",
  email: "hello@riwasglam.beauty",
  address: "Aley, Lebanon — facing Sam's Double Bus",
  instagram: "riwasglam",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=33.804211,35.606533",
  aboutTitle: "Where beauty meets artistry",
  about:
    "Riwa's Glam is a makeup, lash & beauty studio in Aley, led by artist Riwa Imad. From flawless makeup, lashes and brows to nails, facials and more, our specialists blend skill, quality products and a warm atmosphere to help you leave glowing. We also share our craft through professional makeup & lash courses at our academy.",
  why: [
    { icon: "✨", title: "Expert artists", text: "Makeup, lashes, brows, nails & facials — each by a dedicated specialist." },
    { icon: "🎓", title: "Beauty academy", text: "We teach too — professional makeup & lash courses with certificates." },
    { icon: "💖", title: "Personalised care", text: "Looks tailored to you, from a natural glow to full glam." },
    { icon: "📅", title: "Easy online booking", text: "Book your specialist in seconds — reschedule anytime." },
  ],
  hours: [
    { day: "Sunday", value: "08:00 – 20:00" },
    { day: "Monday", value: "Closed" },
    { day: "Tuesday", value: "08:00 – 20:00" },
    { day: "Wednesday", value: "08:00 – 20:00" },
    { day: "Thursday", value: "08:00 – 20:00" },
    { day: "Friday", value: "08:00 – 20:00" },
    { day: "Saturday", value: "08:00 – 20:00" },
  ],
  categoryImages: {
    Makeup: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=700&q=80&auto=format&fit=crop",
    Lashes: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=700&q=80&auto=format&fit=crop",
    Nails: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=700&q=80&auto=format&fit=crop",
    "Brows & Face": "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=700&q=80&auto=format&fit=crop",
    Skincare: "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=700&q=80&auto=format&fit=crop",
    Aesthetics: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=700&q=80&auto=format&fit=crop",
    Tattoos: "https://images.unsplash.com/photo-1611501275019-9b5cda994e8d?w=700&q=80&auto=format&fit=crop",
  } as Record<string, string>,
  featured: ["Bridal Makeup", "Volume", "Full Set Fiber / Poly", "Deep Facial", "Brow Lamination", "Full Glam"],
  galleryCats: ["All", "Makeup", "Nails", "Lashes", "Brows", "Facials", "Before & After"],
  galleryItems: [
    { src: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=700&q=80&auto=format&fit=crop", cat: "Makeup" },
    { src: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=700&q=80&auto=format&fit=crop", cat: "Makeup" },
    { src: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=700&q=80&auto=format&fit=crop", cat: "Nails" },
    { src: "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=700&q=80&auto=format&fit=crop", cat: "Nails" },
    { src: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=700&q=80&auto=format&fit=crop", cat: "Lashes" },
    { src: "https://images.unsplash.com/photo-1583001931096-959e9a1a6223?w=700&q=80&auto=format&fit=crop", cat: "Lashes" },
    { src: "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=700&q=80&auto=format&fit=crop", cat: "Brows" },
    { src: "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=700&q=80&auto=format&fit=crop", cat: "Facials" },
    { src: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=700&q=80&auto=format&fit=crop", cat: "Before & After" },
    { src: "https://images.unsplash.com/photo-1512257960867-c56cb1b3d9c8?w=700&q=80&auto=format&fit=crop", cat: "Before & After" },
  ],
};
const currentContent = async () => ({ ...SITE_CONTENT_DEFAULT, ...(await getSetting("siteContent", {} as Record<string, unknown>)) });

app.get("/api/site-content", async (_req, res) => res.json(await currentContent()));
app.patch("/api/admin/site-content", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const cur = await currentContent();
  const arrStr = (v: unknown) => (Array.isArray(v) ? v.map((x) => STR(x, 600)).filter(Boolean) : undefined);
  const next = {
    name: b.name !== undefined ? STR(b.name, 80) : cur.name,
    logo: b.logo !== undefined ? STR(b.logo, 600) : cur.logo,
    tagline: b.tagline !== undefined ? STR(b.tagline, 120) : cur.tagline,
    heroTitle: b.heroTitle !== undefined ? STR(b.heroTitle, 140) : cur.heroTitle,
    heroSub: b.heroSub !== undefined ? STR(b.heroSub, 400) : cur.heroSub,
    heroImage: b.heroImage !== undefined ? STR(b.heroImage, 600) : cur.heroImage,
    phone: b.phone !== undefined ? STR(b.phone, 40) : cur.phone,
    whatsapp: b.whatsapp !== undefined ? STR(b.whatsapp, 30) : cur.whatsapp,
    email: b.email !== undefined ? STR(b.email, 120) : cur.email,
    address: b.address !== undefined ? STR(b.address, 200) : cur.address,
    instagram: b.instagram !== undefined ? STR(b.instagram, 60) : cur.instagram,
    mapUrl: b.mapUrl !== undefined ? STR(b.mapUrl, 600) : cur.mapUrl,
    aboutTitle: b.aboutTitle !== undefined ? STR(b.aboutTitle, 120) : cur.aboutTitle,
    about: b.about !== undefined ? STR(b.about, 2000) : cur.about,
    why: Array.isArray(b.why)
      ? b.why.slice(0, 8).map((w: Record<string, unknown>) => ({ icon: STR(w?.icon, 8), title: STR(w?.title, 80), text: STR(w?.text, 300) }))
      : cur.why,
    hours: Array.isArray(b.hours) ? b.hours.slice(0, 7).map((h: Record<string, unknown>) => ({ day: STR(h?.day, 20), value: STR(h?.value, 40) })) : cur.hours,
    categoryImages:
      b.categoryImages && typeof b.categoryImages === "object"
        ? Object.fromEntries(Object.entries(b.categoryImages).map(([k, v]) => [STR(k, 60), STR(v, 600)]))
        : cur.categoryImages,
    featured: arrStr(b.featured) ?? cur.featured,
    galleryCats: arrStr(b.galleryCats) ?? cur.galleryCats,
    galleryItems: Array.isArray(b.galleryItems)
      ? b.galleryItems
          .slice(0, 120)
          .map((g: Record<string, unknown>) => ({ src: STR(g?.src, 600), cat: STR(g?.cat, 60) }))
          .filter((g: { src: string }) => g.src)
      : cur.galleryItems,
  };
  await setSetting("siteContent", next);
  res.json(next);
});

// Image upload (base64 data URL in JSON) + public serving.
app.post("/api/admin/images", requireAdmin, async (req, res) => {
  const dataUrl = String(req.body?.dataUrl ?? "");
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl);
  if (!m || !m[1].startsWith("image/")) return res.status(400).json({ error: "Not a valid image." });
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 6_000_000) return res.status(413).json({ error: "Image too large (max ~6MB). Try a smaller photo." });
  const img = await prisma.image.create({ data: { mime: m[1], data: buf } });
  res.json({ id: img.id, url: `${req.protocol}://${req.get("host")}/api/images/${img.id}` });
});
app.get("/api/images/:id", async (req, res) => {
  const img = await prisma.image.findUnique({ where: { id: String(req.params.id) } });
  if (!img) return res.status(404).end();
  res.set("Content-Type", img.mime);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(img.data);
});

// ---- Finances: expenses + revenue/profit analytics ----

// Materialise any due occurrences of the owner's recurring expenses (rent/wifi/electricity)
// up to today. Idempotent — an occurrence is keyed by (recurringId, period) so it's created
// once. Called at the start of the finance read endpoints, so the owner never re-enters them.
const RECUR_STEP: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };
async function ensureRecurringExpenses() {
  const todayStr = beirutToday();
  const pad = (n: number) => String(n).padStart(2, "0");
  const recs = await prisma.recurringExpense.findMany({ where: { active: true } });
  for (const r of recs) {
    if (!isDate(r.startDate)) continue;
    const step = RECUR_STEP[r.frequency] ?? 1;
    const sy = Number(r.startDate.slice(0, 4));
    const sm = Number(r.startDate.slice(5, 7)) - 1; // 0-based month
    for (let k = 0; k < 600; k++) {
      const d = new Date(sy, sm + k * step, 1);
      const oy = d.getFullYear(),
        om = d.getMonth();
      const dim = new Date(oy, om + 1, 0).getDate();
      const day = Math.min(Math.max(1, r.dayOfMonth), dim);
      const dateStr = `${oy}-${pad(om + 1)}-${pad(day)}`;
      if (dateStr > todayStr) break; // not due yet — stop (later occurrences are further out)
      const period = `${oy}-${pad(om + 1)}`;
      const exists = await prisma.expense.findFirst({ where: { recurringId: r.id, period } });
      if (!exists) {
        await prisma.expense.create({
          data: { category: r.category, label: r.label, amount: r.amount, date: dateStr, note: "Recurring", recurringId: r.id, period },
        });
      }
    }
  }
}

app.get("/api/admin/expenses", requireAdmin, async (req, res) => {
  await ensureRecurringExpenses();
  const from = STR(req.query.from),
    to = STR(req.query.to);
  const where = isDate(from) && isDate(to) ? { date: { gte: from, lte: to } } : {};
  res.json(await prisma.expense.findMany({ where, orderBy: [{ date: "desc" }, { id: "desc" }] }));
});

// Recurring expense rules — set up once, auto-posted each period.
app.get("/api/admin/recurring-expenses", requireAdmin, async (_req, res) => {
  res.json(await prisma.recurringExpense.findMany({ orderBy: [{ active: "desc" }, { id: "desc" }] }));
});
app.post("/api/admin/recurring-expenses", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const startDate = STR(b.startDate);
  if (!isDate(startDate)) return res.status(400).json({ error: "A valid start date is required." });
  const frequency = ["MONTHLY", "QUARTERLY", "YEARLY"].includes(STR(b.frequency)) ? STR(b.frequency) : "MONTHLY";
  const rec = await prisma.recurringExpense.create({
    data: {
      category: STR(b.category, 40) || "Other",
      label: STR(b.label, 120),
      amount: Math.max(0, NUM(b.amount, 0)),
      frequency,
      dayOfMonth: Math.min(28, Math.max(1, Math.round(NUM(b.dayOfMonth, 1)))),
      startDate,
      active: true,
    },
  });
  await ensureRecurringExpenses();
  res.json(rec);
});
app.patch("/api/admin/recurring-expenses/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.category !== undefined) data.category = STR(b.category, 40);
  if (b.label !== undefined) data.label = STR(b.label, 120);
  if (b.amount !== undefined) data.amount = Math.max(0, NUM(b.amount, 0));
  if (b.frequency !== undefined && ["MONTHLY", "QUARTERLY", "YEARLY"].includes(STR(b.frequency))) data.frequency = STR(b.frequency);
  if (b.dayOfMonth !== undefined) data.dayOfMonth = Math.min(28, Math.max(1, Math.round(NUM(b.dayOfMonth, 1))));
  if (b.active !== undefined) data.active = !!b.active;
  const rec = await prisma.recurringExpense.update({ where: { id: Number(req.params.id) }, data });
  if (rec.active) await ensureRecurringExpenses();
  res.json(rec);
});
app.delete("/api/admin/recurring-expenses/:id", requireAdmin, async (req, res) => {
  // Remove the rule but keep already-generated expenses as history.
  await prisma.recurringExpense.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});
app.post("/api/admin/expenses", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const date = STR(b.date);
  if (!isDate(date)) return res.status(400).json({ error: "A valid date is required." });
  res.json(
    await prisma.expense.create({
      data: { category: STR(b.category, 40) || "Other", label: STR(b.label, 120), amount: Math.max(0, NUM(b.amount, 0)), date, note: STR(b.note, 300) },
    }),
  );
});
app.patch("/api/admin/expenses/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.category !== undefined) data.category = STR(b.category, 40);
  if (b.label !== undefined) data.label = STR(b.label, 120);
  if (b.amount !== undefined) data.amount = Math.max(0, NUM(b.amount, 0));
  if (b.date !== undefined && isDate(STR(b.date))) data.date = STR(b.date);
  if (b.note !== undefined) data.note = STR(b.note, 300);
  res.json(await prisma.expense.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/expenses/:id", requireAdmin, async (req, res) => {
  await prisma.expense.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// Revenue & profit for a date range. Profit = revenue − materials − commissions − expenses.
app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
  await ensureRecurringExpenses();
  const from = STR(req.query.from),
    to = STR(req.query.to);
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: "from and to (YYYY-MM-DD) are required." });
  const appts = await prisma.appointment.findMany({
    where: { date: { gte: from, lte: to }, status: { in: ["CONFIRMED", "COMPLETED"] } },
    include: { service: { select: { materialCost: true, category: { select: { name: true } } } } },
  });
  const expenses = await prisma.expense.findMany({ where: { date: { gte: from, lte: to } } });

  let revenue = 0,
    material = 0,
    commission = 0;
  const byCat: Record<string, number> = {},
    byStaff: Record<string, number> = {};
  const byService: Record<string, { revenue: number; material: number; commission: number; count: number }> = {};
  const daily: Record<string, number> = {};
  for (const a of appts) {
    const mc = a.service?.materialCost ?? 0;
    revenue += a.price;
    material += mc;
    commission += a.commissionAmount;
    const cat = a.service?.category?.name ?? "Other";
    byCat[cat] = (byCat[cat] ?? 0) + a.price;
    const st = a.staffName || "Unassigned";
    byStaff[st] = (byStaff[st] ?? 0) + a.price;
    const sv = a.serviceName || "Service";
    if (!byService[sv]) byService[sv] = { revenue: 0, material: 0, commission: 0, count: 0 };
    byService[sv].revenue += a.price;
    byService[sv].material += mc;
    byService[sv].commission += a.commissionAmount;
    byService[sv].count++;
    daily[a.date] = (daily[a.date] ?? 0) + a.price;
  }
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const grossProfit = revenue - material - commission;
  const count = appts.length;
  const toArr = (o: Record<string, number>) =>
    Object.entries(o)
      .map(([name, value]) => ({ name, value: round2(value) }))
      .sort((x, y) => y.value - x.value);
  const serviceRows = Object.entries(byService)
    .map(([name, v]) => ({ name, count: v.count, revenue: round2(v.revenue), profit: round2(v.revenue - v.material - v.commission) }))
    .sort((x, y) => y.revenue - x.revenue);
  const daySeries = Object.entries(daily)
    .map(([date, value]) => ({ date, value: round2(value) }))
    .sort((x, y) => (x.date < y.date ? -1 : 1));
  res.json({
    revenue: round2(revenue),
    material: round2(material),
    commission: round2(commission),
    expenses: round2(expensesTotal),
    grossProfit: round2(grossProfit),
    netProfit: round2(grossProfit - expensesTotal),
    appointments: count,
    avgTicket: count ? round2(revenue / count) : 0,
    bestService: serviceRows[0]?.name ?? "—",
    topStaff: toArr(byStaff)[0]?.name ?? "—",
    byCategory: toArr(byCat),
    byStaff: toArr(byStaff),
    byService: serviceRows,
    daily: daySeries,
  });
});

// ---- Admin home dashboard (all widgets + charts in one call) ----
app.get("/api/admin/dashboard", requireAdmin, async (_req, res) => {
  await ensureRecurringExpenses();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = beirutToday();
  const y = Number(todayStr.slice(0, 4)),
    mo = Number(todayStr.slice(5, 7)) - 1;
  const monthStart = `${y}-${pad(mo + 1)}-01`;
  const monthEnd = `${y}-${pad(mo + 1)}-${pad(new Date(y, mo + 1, 0).getDate())}`;
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, mo - i, 1);
    months.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  const sixStart = months[0] + "-01";

  const [apptsMonth, expMonth, appts6, exp6, staff, products, giftCards, pendingReviews, waitlist, customersB] = await Promise.all([
    prisma.appointment.findMany({
      where: { date: { gte: monthStart, lte: monthEnd }, status: { in: ["CONFIRMED", "COMPLETED"] } },
      include: { service: { select: { materialCost: true, category: { select: { name: true } } } } },
    }),
    prisma.expense.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.appointment.findMany({
      where: { date: { gte: sixStart, lte: monthEnd }, status: { in: ["CONFIRMED", "COMPLETED"] } },
      include: { service: { select: { materialCost: true } } },
    }),
    prisma.expense.findMany({ where: { date: { gte: sixStart, lte: monthEnd } } }),
    prisma.staff.findMany({ where: { isActive: true } }),
    prisma.product.findMany({ where: { isActive: true } }),
    prisma.giftCard.findMany({ where: { createdAt: { gte: new Date(monthStart + "T00:00:00") } } }),
    prisma.review.count({ where: { status: "PENDING" } }),
    prisma.waitlistEntry.count({ where: { status: "WAITING" } }),
    prisma.customer.findMany({ where: { NOT: { birthday: "" } }, select: { name: true, birthday: true } }),
  ]);
  const bMonth = pad(mo + 1);
  const bdayThisMonth = customersB.filter((c) => (c.birthday.length > 5 ? c.birthday.slice(5, 7) : c.birthday.slice(0, 2)) === bMonth).map((c) => c.name);

  type A = { price: number; commissionAmount: number; service: { materialCost: number } | null };
  const calc = (arr: A[]) =>
    arr.reduce(
      (o, a) => {
        o.rev += a.price;
        o.mat += a.service?.materialCost ?? 0;
        o.com += a.commissionAmount;
        return o;
      },
      { rev: 0, mat: 0, com: 0 },
    );
  const profit = (arr: A[], exp: { amount: number }[]) => round2(calc(arr).rev - calc(arr).mat - calc(arr).com - exp.reduce((s, e) => s + e.amount, 0));

  const apptsToday = apptsMonth.filter((a) => a.date === todayStr);
  const expToday = expMonth.filter((e) => e.date === todayStr);
  const tC = calc(apptsToday),
    mC = calc(apptsMonth);

  const dow = new Date(todayStr + "T00:00:00Z").getUTCDay();
  const workingToday = staff
    .filter((s) => {
      const d = parseArr(s.schedule)[dow];
      return d && !d.off && !parseArr(s.blockedDates).includes(todayStr);
    })
    .map((s) => ({ name: s.name, role: s.role }));
  const low = products.filter((p) => p.quantity <= p.minQuantity);

  const svc: Record<string, number> = {},
    stf: Record<string, number> = {},
    cat: Record<string, number> = {},
    day: Record<string, number> = {};
  for (const a of apptsMonth) {
    svc[a.serviceName] = (svc[a.serviceName] ?? 0) + 1;
    stf[a.staffName || "Unassigned"] = (stf[a.staffName || "Unassigned"] ?? 0) + 1;
    cat[a.service?.category?.name ?? "Other"] = (cat[a.service?.category?.name ?? "Other"] ?? 0) + a.price;
    day[a.date] = (day[a.date] ?? 0) + a.price;
  }
  const top = (m: Record<string, number>, n = 5) =>
    Object.entries(m)
      .map(([name, value]) => ({ name, value: round2(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, n);

  res.json({
    today: { bookings: apptsToday.length, revenue: round2(tC.rev), profit: round2(tC.rev - tC.mat - tC.com - expToday.reduce((s, e) => s + e.amount, 0)) },
    month: { revenue: round2(mC.rev), profit: round2(mC.rev - mC.mat - mC.com - expMonth.reduce((s, e) => s + e.amount, 0)) },
    workingToday,
    commissionOwed: round2(mC.com),
    pendingReviews,
    waitlist,
    birthdays: bdayThisMonth,
    lowStock: { count: low.length, items: low.slice(0, 6).map((p) => ({ name: p.name, quantity: p.quantity, unit: p.unit })) },
    giftCards: { count: giftCards.length, value: round2(giftCards.reduce((s, c) => s + c.initialValue, 0)) },
    bestServices: top(svc),
    mostBookedStaff: top(stf),
    charts: {
      revenueByDay: Object.entries(day)
        .map(([date, value]) => ({ date, value: round2(value) }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
      revenueByCategory: top(cat, 8),
      bookingsByStaff: top(stf, 8),
      profitByMonth: months.map((m) => ({
        name: m,
        value: profit(
          appts6.filter((x) => x.date.slice(0, 7) === m),
          exp6.filter((x) => x.date.slice(0, 7) === m),
        ),
      })),
    },
  });
});

// ---- Gallery ----
async function galleryWithNames(items: { serviceId: number | null }[]) {
  const svc = await prisma.service.findMany({ select: { id: true, name: true } });
  const map = new Map(svc.map((s) => [s.id, s.name]));
  return items.map((i) => ({ ...i, serviceName: i.serviceId ? (map.get(i.serviceId) ?? "") : "" }));
}
app.get("/api/gallery", async (_req, res) =>
  res.json(await galleryWithNames(await prisma.galleryItem.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "desc" }] }))),
);
app.get("/api/admin/gallery", requireAdmin, async (_req, res) =>
  res.json(await galleryWithNames(await prisma.galleryItem.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "desc" }] }))),
);
app.post("/api/admin/gallery", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const type = ["IMAGE", "VIDEO", "BEFOREAFTER"].includes(STR(b.type, 12).toUpperCase()) ? STR(b.type, 12).toUpperCase() : "IMAGE";
  res.json(
    await prisma.galleryItem.create({
      data: {
        type,
        url: STR(b.url, 600),
        beforeUrl: STR(b.beforeUrl, 600),
        category: STR(b.category, 60),
        caption: STR(b.caption, 160),
        serviceId: b.serviceId ? Number(b.serviceId) : null,
      },
    }),
  );
});
app.patch("/api/admin/gallery/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.type !== undefined) data.type = ["IMAGE", "VIDEO", "BEFOREAFTER"].includes(STR(b.type, 12).toUpperCase()) ? STR(b.type, 12).toUpperCase() : "IMAGE";
  if (b.url !== undefined) data.url = STR(b.url, 600);
  if (b.beforeUrl !== undefined) data.beforeUrl = STR(b.beforeUrl, 600);
  if (b.category !== undefined) data.category = STR(b.category, 60);
  if (b.caption !== undefined) data.caption = STR(b.caption, 160);
  if (b.serviceId !== undefined) data.serviceId = b.serviceId ? Number(b.serviceId) : null;
  if (b.sortOrder !== undefined) data.sortOrder = NUM(b.sortOrder, 0);
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  res.json(await prisma.galleryItem.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/gallery/:id", requireAdmin, async (req, res) => {
  await prisma.galleryItem.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// ---- Academy / courses ----
const courseOut = (c: { includes: string }) => ({ ...c, includes: parseArr(c.includes) });
app.get("/api/courses", async (_req, res) => {
  const courses = await prisma.course.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  res.json(courses.map(courseOut));
});
app.get("/api/admin/courses", requireAdmin, async (_req, res) => {
  const courses = await prisma.course.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  res.json(courses.map(courseOut));
});
app.post("/api/admin/courses", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const title = STR(b.title, 120);
  if (!title) return res.status(400).json({ error: "Course title is required." });
  const max = await prisma.course.aggregate({ _max: { sortOrder: true } });
  const c = await prisma.course.create({
    data: {
      title,
      image: STR(b.image, 600),
      description: STR(b.description, 2000),
      duration: STR(b.duration, 60),
      price: Math.max(0, NUM(b.price, 0)),
      includes: JSON.stringify(Array.isArray(b.includes) ? b.includes.map((x: unknown) => STR(x, 120)).filter(Boolean) : []),
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  res.json(courseOut(c));
});
app.patch("/api/admin/courses/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = STR(b.title, 120);
  if (b.image !== undefined) data.image = STR(b.image, 600);
  if (b.description !== undefined) data.description = STR(b.description, 2000);
  if (b.duration !== undefined) data.duration = STR(b.duration, 60);
  if (b.price !== undefined) data.price = Math.max(0, NUM(b.price, 0));
  if (b.includes !== undefined) data.includes = JSON.stringify(Array.isArray(b.includes) ? b.includes.map((x: unknown) => STR(x, 120)).filter(Boolean) : []);
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  res.json(courseOut(await prisma.course.update({ where: { id: Number(req.params.id) }, data })));
});
app.delete("/api/admin/courses/:id", requireAdmin, async (req, res) => {
  await prisma.course.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// ---- Packages ----
async function packagesWithNames(pkgs: { serviceIds: string }[]) {
  const svc = await prisma.service.findMany({ select: { id: true, name: true } });
  const map = new Map(svc.map((s) => [s.id, s.name]));
  return pkgs.map((p) => {
    const ids = parseArr(p.serviceIds) as number[];
    return { ...p, serviceIds: ids, services: ids.map((id) => map.get(id)).filter(Boolean) };
  });
}
app.get("/api/packages", async (_req, res) =>
  res.json(await packagesWithNames(await prisma.package.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }))),
);
app.get("/api/admin/packages", requireAdmin, async (_req, res) =>
  res.json(await packagesWithNames(await prisma.package.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }))),
);
app.post("/api/admin/packages", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const title = STR(b.title, 120);
  if (!title) return res.status(400).json({ error: "Package title is required." });
  const max = await prisma.package.aggregate({ _max: { sortOrder: true } });
  const p = await prisma.package.create({
    data: {
      title,
      image: STR(b.image, 600),
      description: STR(b.description, 2000),
      price: Math.max(0, NUM(b.price, 0)),
      durationMin: Math.max(5, NUM(b.durationMin, 60)),
      serviceIds: JSON.stringify(Array.isArray(b.serviceIds) ? b.serviceIds.map(Number).filter((n: number) => n > 0) : []),
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  res.json((await packagesWithNames([p]))[0]);
});
app.patch("/api/admin/packages/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = STR(b.title, 120);
  if (b.image !== undefined) data.image = STR(b.image, 600);
  if (b.description !== undefined) data.description = STR(b.description, 2000);
  if (b.price !== undefined) data.price = Math.max(0, NUM(b.price, 0));
  if (b.durationMin !== undefined) data.durationMin = Math.max(5, NUM(b.durationMin, 60));
  if (b.serviceIds !== undefined) data.serviceIds = JSON.stringify(Array.isArray(b.serviceIds) ? b.serviceIds.map(Number).filter((n: number) => n > 0) : []);
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  const p = await prisma.package.update({ where: { id: Number(req.params.id) }, data });
  res.json((await packagesWithNames([p]))[0]);
});
app.delete("/api/admin/packages/:id", requireAdmin, async (req, res) => {
  await prisma.package.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// ---- Waiting list ----
app.post("/api/waitlist", async (req, res) => {
  const b = req.body ?? {};
  const name = STR(b.name, 80),
    phone = STR(b.phone, 40);
  if (!name || !phone) return res.status(400).json({ error: "Your name and phone are required." });
  const entry = await prisma.waitlistEntry.create({
    data: {
      customerId: optionalCustomerId(req) ?? null,
      name,
      phone,
      serviceId: b.serviceId ? Number(b.serviceId) : null,
      serviceName: STR(b.serviceName, 120),
      staffId: b.staffId ? Number(b.staffId) : null,
      staffName: STR(b.staffName, 80),
      preferredDate: isDate(STR(b.preferredDate)) ? STR(b.preferredDate) : "",
      preferredTime: STR(b.preferredTime, 10),
      note: STR(b.note, 300),
    },
  });
  notify("waitlist", { phone: entry.phone, data: { name: entry.name, service: entry.serviceName || "your service" } });
  res.status(201).json({ ok: true, id: entry.id });
});
app.get("/api/admin/waitlist", requireAdmin, async (req, res) => {
  const status = STR(req.query.status, 20).toUpperCase();
  res.json(await prisma.waitlistEntry.findMany({ where: status && status !== "ALL" ? { status } : {}, orderBy: { id: "desc" }, take: 300 }));
});
app.patch("/api/admin/waitlist/:id", requireAdmin, async (req, res) => {
  const status = STR(req.body?.status, 20).toUpperCase();
  if (!["WAITING", "CONTACTED", "BOOKED", "CANCELLED"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  res.json(await prisma.waitlistEntry.update({ where: { id: Number(req.params.id) }, data: { status } }));
});
app.delete("/api/admin/waitlist/:id", requireAdmin, async (req, res) => {
  await prisma.waitlistEntry.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// ---- Marketing / promo codes ----
async function validatePromo(
  codeRaw: string,
  price: number,
  custId: number | null,
): Promise<{ ok: true; code: string; discount: number; label: string } | { ok: false; error: string }> {
  const code = STR(codeRaw, 40).toUpperCase();
  if (!code) return { ok: false, error: "Enter a code." };
  const pc = await prisma.promoCode.findUnique({ where: { code } });
  if (!pc || !pc.isActive) return { ok: false, error: "That code isn't valid." };
  const today = beirutToday();
  if (pc.startsAt && today < pc.startsAt) return { ok: false, error: "This code isn't active yet." };
  if (pc.expiresAt && today > pc.expiresAt) return { ok: false, error: "This code has expired." };
  if (pc.maxUses && pc.usedCount >= pc.maxUses) return { ok: false, error: "This code has reached its limit." };
  if (pc.minSpend && price < pc.minSpend) return { ok: false, error: `Spend at least $${pc.minSpend} to use this code.` };
  if (pc.firstTimeOnly) {
    if (!custId) return { ok: false, error: "This code is for a logged-in customer's first visit." };
    const prior = await prisma.appointment.count({ where: { customerId: custId, status: { not: "CANCELLED" } } });
    if (prior > 0) return { ok: false, error: "This code is for first-time customers only." };
  }
  if (pc.birthdayOnly) {
    if (!custId) return { ok: false, error: "Log in to use your birthday reward." };
    const c = await prisma.customer.findUnique({ where: { id: custId } });
    const mm = beirutToday().slice(5, 7);
    const bmm = c?.birthday ? (c.birthday.length > 5 ? c.birthday.slice(5, 7) : c.birthday.slice(0, 2)) : "";
    if (bmm !== mm) return { ok: false, error: "This code is only valid in your birthday month." };
  }
  const discount = pc.type === "PERCENT" ? round2((price * pc.value) / 100) : Math.min(price, pc.value);
  return { ok: true, code: pc.code, discount, label: pc.type === "PERCENT" ? `${pc.value}% off` : `$${pc.value} off` };
}
app.post("/api/promo/validate", async (req, res) => {
  const r = await validatePromo(STR(req.body?.code), round2(NUM(req.body?.amount, 0)), optionalCustomerId(req));
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r);
});
app.get("/api/admin/promos", requireAdmin, async (_req, res) => res.json(await prisma.promoCode.findMany({ orderBy: { id: "desc" } })));
app.post("/api/admin/promos", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const code = STR(b.code, 40).toUpperCase();
  if (!code) return res.status(400).json({ error: "A code is required." });
  if (await prisma.promoCode.findUnique({ where: { code } })) return res.status(409).json({ error: "That code already exists." });
  res.json(
    await prisma.promoCode.create({
      data: {
        code,
        type: STR(b.type, 10).toUpperCase() === "FIXED" ? "FIXED" : "PERCENT",
        value: Math.max(0, NUM(b.value, 0)),
        minSpend: Math.max(0, NUM(b.minSpend, 0)),
        maxUses: Math.max(0, NUM(b.maxUses, 0)),
        firstTimeOnly: !!b.firstTimeOnly,
        birthdayOnly: !!b.birthdayOnly,
        startsAt: isDate(STR(b.startsAt)) ? STR(b.startsAt) : "",
        expiresAt: isDate(STR(b.expiresAt)) ? STR(b.expiresAt) : "",
        description: STR(b.description, 200),
      },
    }),
  );
});
app.patch("/api/admin/promos/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.type !== undefined) data.type = STR(b.type, 10).toUpperCase() === "FIXED" ? "FIXED" : "PERCENT";
  if (b.value !== undefined) data.value = Math.max(0, NUM(b.value, 0));
  if (b.minSpend !== undefined) data.minSpend = Math.max(0, NUM(b.minSpend, 0));
  if (b.maxUses !== undefined) data.maxUses = Math.max(0, NUM(b.maxUses, 0));
  if (b.firstTimeOnly !== undefined) data.firstTimeOnly = !!b.firstTimeOnly;
  if (b.birthdayOnly !== undefined) data.birthdayOnly = !!b.birthdayOnly;
  if (b.startsAt !== undefined) data.startsAt = isDate(STR(b.startsAt)) ? STR(b.startsAt) : "";
  if (b.expiresAt !== undefined) data.expiresAt = isDate(STR(b.expiresAt)) ? STR(b.expiresAt) : "";
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  if (b.description !== undefined) data.description = STR(b.description, 200);
  res.json(await prisma.promoCode.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/promos/:id", requireAdmin, async (req, res) => {
  await prisma.promoCode.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// ---- Loyalty & memberships ----
app.get("/api/loyalty/config", async (_req, res) => {
  const l = await getSetting("loyalty", LOYALTY_DEFAULT);
  res.json({ enabled: l.enabled, pointsPerDollar: l.pointsPerDollar, tiers: l.tiers, rewards: l.rewards });
});
app.get("/api/customer/me/loyalty", requireCustomer, async (req, res) => {
  const id = custOf(req);
  const [cust, loy] = await Promise.all([prisma.customer.findUnique({ where: { id } }), getSetting("loyalty", LOYALTY_DEFAULT)]);
  if (!cust) return res.status(404).json({ error: "Not found." });
  const tier = tierFor(cust.lifetimePoints, loy.tiers);
  const next = [...loy.tiers].sort((a, b) => a.minPoints - b.minPoints).find((t) => t.minPoints > cust.lifetimePoints) ?? null;
  const redemptions = await prisma.rewardRedemption.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 20 });
  res.json({
    enabled: loy.enabled,
    points: cust.points,
    lifetimePoints: cust.lifetimePoints,
    pointsPerDollar: loy.pointsPerDollar,
    tier: tier?.name ?? "—",
    discountPct: tier?.discountPct ?? 0,
    nextTier: next ? { name: next.name, pointsNeeded: next.minPoints - cust.lifetimePoints } : null,
    rewards: loy.rewards.map((r) => ({ ...r, affordable: cust.points >= r.cost })),
    redemptions,
  });
});
app.post("/api/customer/me/loyalty/redeem", requireCustomer, async (req, res) => {
  const id = custOf(req);
  const rewardId = Number(req.body?.rewardId);
  const loy = await getSetting("loyalty", LOYALTY_DEFAULT);
  if (!loy.enabled) return res.status(400).json({ error: "Rewards aren't active right now." });
  const reward = loy.rewards.find((r) => r.id === rewardId);
  if (!reward) return res.status(404).json({ error: "Reward not found." });
  const cust = await prisma.customer.findUnique({ where: { id } });
  if (!cust || cust.points < reward.cost) return res.status(400).json({ error: "You don't have enough points yet." });
  await prisma.customer.update({ where: { id }, data: { points: { decrement: reward.cost } } });
  const redemption = await prisma.rewardRedemption.create({ data: { customerId: id, rewardName: reward.name, cost: reward.cost } });
  res.json({ ok: true, redemption, points: cust.points - reward.cost });
});
app.get("/api/admin/settings/loyalty", requireAdmin, async (_req, res) => res.json(await getSetting("loyalty", LOYALTY_DEFAULT)));
app.patch("/api/admin/settings/loyalty", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const cur = await getSetting("loyalty", LOYALTY_DEFAULT);
  const next = {
    enabled: b.enabled !== undefined ? !!b.enabled : cur.enabled,
    pointsPerDollar: b.pointsPerDollar !== undefined ? Math.max(0, NUM(b.pointsPerDollar, cur.pointsPerDollar)) : cur.pointsPerDollar,
    tiers: Array.isArray(b.tiers)
      ? b.tiers
          .map((t: Record<string, unknown>) => ({
            name: STR(t.name, 30),
            minPoints: Math.max(0, NUM(t.minPoints, 0)),
            discountPct: Math.max(0, Math.min(100, NUM(t.discountPct, 0))),
          }))
          .sort((a: Tier, z: Tier) => a.minPoints - z.minPoints)
      : cur.tiers,
    rewards: Array.isArray(b.rewards)
      ? b.rewards.map((r: Record<string, unknown>, i: number) => ({
          id: NUM(r.id, i + 1),
          name: STR(r.name, 80),
          cost: Math.max(1, NUM(r.cost, 1)),
          description: STR(r.description, 200),
        }))
      : cur.rewards,
  };
  await setSetting("loyalty", next);
  res.json(next);
});
app.get("/api/admin/redemptions", requireAdmin, async (_req, res) =>
  res.json(
    await prisma.rewardRedemption.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { customer: { select: { name: true, phone: true } } } }),
  ),
);
app.patch("/api/admin/redemptions/:id", requireAdmin, async (req, res) =>
  res.json(
    await prisma.rewardRedemption.update({
      where: { id: String(req.params.id) },
      data: { status: STR(req.body?.status, 10).toUpperCase() === "USED" ? "USED" : "ISSUED" },
    }),
  ),
);

// ---- Branches (multi-location, future-proofing) ----
let _defaultBranch: number | null = null;
async function defaultBranchId(): Promise<number | null> {
  if (_defaultBranch) return _defaultBranch;
  const b = await prisma.branch.findFirst({ where: { isDefault: true } }).catch(() => null);
  if (b) _defaultBranch = b.id;
  return b?.id ?? null;
}
app.get("/api/branches", async (_req, res) =>
  res.json(await prisma.branch.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })),
);
app.get("/api/admin/branches", requireAdmin, async (_req, res) => res.json(await prisma.branch.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })));
app.post("/api/admin/branches", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const name = STR(b.name, 80);
  if (!name) return res.status(400).json({ error: "Branch name is required." });
  const max = await prisma.branch.aggregate({ _max: { sortOrder: true } });
  const count = await prisma.branch.count();
  res.json(
    await prisma.branch.create({
      data: { name, address: STR(b.address, 200), phone: STR(b.phone, 40), isDefault: count === 0, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    }),
  );
});
app.patch("/api/admin/branches/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const id = Number(req.params.id);
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = STR(b.name, 80);
  if (b.address !== undefined) data.address = STR(b.address, 200);
  if (b.phone !== undefined) data.phone = STR(b.phone, 40);
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  if (b.isDefault === true) await prisma.branch.updateMany({ data: { isDefault: false } }); // only one default
  if (b.isDefault !== undefined) data.isDefault = !!b.isDefault;
  res.json(await prisma.branch.update({ where: { id }, data }));
});
app.delete("/api/admin/branches/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const br = await prisma.branch.findUnique({ where: { id } });
  if (br?.isDefault) return res.status(400).json({ error: "Can't delete the default branch." });
  await prisma.branch.delete({ where: { id } }).catch(() => {});
  res.json({ ok: true });
});

// ---- Notifications ----
const NOTIF_DEFAULT = {
  events: { confirmation: true, cancelled: true, review: true, giftcard: true, waitlist: true, lowstock: true, reminder: true } as Record<string, boolean>,
  channels: { email: true, whatsapp: false },
  emailFrom: `${SALON.name} <onboarding@resend.dev>`,
};
const providerStatus = () => ({
  email: !!process.env.RESEND_API_KEY,
  whatsapp: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM),
});
type NotifData = Record<string, string | number>;
const fill = (tpl: string, d: NotifData) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(d[k] ?? ""));
const TEMPLATES: Record<string, { en: { s: string; b: string }; ar: { s: string; b: string } }> = {
  confirmation: {
    en: { s: "Booking confirmed — {salon}", b: "Hi {name}, your {service} appointment on {date} at {time} is confirmed. See you soon! — {salon}" },
    ar: { s: "تم تأكيد الحجز — {salon}", b: "مرحباً {name}، تم تأكيد موعدك لـ {service} بتاريخ {date} الساعة {time}. بانتظارك! — {salon}" },
  },
  cancelled: {
    en: { s: "Booking cancelled — {salon}", b: "Hi {name}, your {service} appointment on {date} has been cancelled. — {salon}" },
    ar: { s: "تم إلغاء الحجز — {salon}", b: "مرحباً {name}، تم إلغاء موعدك لـ {service} بتاريخ {date}. — {salon}" },
  },
  reminder: {
    en: {
      s: "Reminder: your appointment tomorrow — {salon}",
      b: "Hi {name}, a reminder for your {service} appointment tomorrow ({date}) at {time}. — {salon}",
    },
    ar: { s: "تذكير: موعدك غداً — {salon}", b: "مرحباً {name}، تذكير بموعدك لـ {service} غداً ({date}) الساعة {time}. — {salon}" },
  },
  review: {
    en: { s: "How was your visit? — {salon}", b: "Hi {name}, thank you for visiting {salon}! We'd love your review of your {service}." },
    ar: { s: "كيف كانت زيارتك؟ — {salon}", b: "مرحباً {name}، شكراً لزيارتك {salon}! يسعدنا تقييمك لخدمة {service}." },
  },
  giftcard: {
    en: { s: "Your gift card — {salon}", b: "Your {salon} gift card is ready! Code: {code}, value {value}." },
    ar: { s: "بطاقة هديتك — {salon}", b: "بطاقة هدية {salon} جاهزة! الرمز: {code}، القيمة {value}." },
  },
  waitlist: {
    en: { s: "You're on the waiting list — {salon}", b: "Hi {name}, you're on the waiting list for {service}. We'll contact you if a spot opens." },
    ar: { s: "أنتِ على قائمة الانتظار — {salon}", b: "مرحباً {name}، أنتِ على قائمة الانتظار لـ {service}. سنتواصل معك عند توفّر موعد." },
  },
  lowstock: {
    en: { s: "Low stock alert — {salon}", b: "Low stock: {product} is down to {quantity}. Time to reorder." },
    ar: { s: "تنبيه مخزون منخفض — {salon}", b: "مخزون منخفض: {product} أصبح {quantity}. حان وقت إعادة الطلب." },
  },
};
async function sendEmail(to: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "no-provider" };
  const from = (await getSetting("notifications", NOTIF_DEFAULT)).emailFrom || NOTIF_DEFAULT.emailFrom;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: body }),
    });
    return r.ok ? { ok: true } : { ok: false, error: `resend ${r.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
async function sendWhatsApp(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID,
    token = process.env.TWILIO_AUTH_TOKEN,
    from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) return { ok: false, error: "no-provider" };
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: `whatsapp:${to}`, From: `whatsapp:${from}`, Body: body }),
    });
    return r.ok ? { ok: true } : { ok: false, error: `twilio ${r.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
async function logNotif(channel: string, to: string, event: string, subject: string, body: string, r: { ok: boolean; error?: string }) {
  await prisma.notificationLog
    .create({
      data: {
        channel,
        to,
        event,
        subject,
        body,
        status: r.ok ? "SENT" : r.error === "no-provider" ? "SKIPPED" : "FAILED",
        error: r.error === "no-provider" ? "" : (r.error ?? ""),
      },
    })
    .catch(() => {});
}
// Fire a notification across enabled channels. Never throws (must not break the main flow).
async function notify(event: string, opts: { email?: string; phone?: string; lang?: "en" | "ar"; data: NotifData }) {
  try {
    const cfg = await getSetting("notifications", NOTIF_DEFAULT);
    if (!cfg.events[event]) return;
    const tpl = TEMPLATES[event];
    if (!tpl) return;
    const lang = opts.lang === "ar" ? "ar" : "en";
    const data = { salon: SALON.name, ...opts.data };
    const subject = fill(tpl[lang].s, data),
      body = fill(tpl[lang].b, data);
    if (cfg.channels.email && opts.email) await logNotif("EMAIL", opts.email, event, subject, body, await sendEmail(opts.email, subject, body));
    if (cfg.channels.whatsapp && opts.phone) await logNotif("WHATSAPP", opts.phone, event, subject, body, await sendWhatsApp(opts.phone, body));
  } catch {
    /* swallow */
  }
}
app.get("/api/admin/notifications", requireAdmin, async (_req, res) =>
  res.json({ settings: await getSetting("notifications", NOTIF_DEFAULT), providers: providerStatus() }),
);
app.patch("/api/admin/settings/notifications", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const cur = await getSetting("notifications", NOTIF_DEFAULT);
  const next = {
    events: { ...cur.events, ...(b.events && typeof b.events === "object" ? b.events : {}) },
    channels: {
      email: b.channels?.email !== undefined ? !!b.channels.email : cur.channels.email,
      whatsapp: b.channels?.whatsapp !== undefined ? !!b.channels.whatsapp : cur.channels.whatsapp,
    },
    emailFrom: b.emailFrom !== undefined ? STR(b.emailFrom, 160) : cur.emailFrom,
  };
  await setSetting("notifications", next);
  res.json(next);
});
app.get("/api/admin/notifications/log", requireAdmin, async (_req, res) =>
  res.json(await prisma.notificationLog.findMany({ orderBy: { id: "desc" }, take: 100 })),
);
app.post("/api/admin/notifications/test", requireAdmin, async (req, res) => {
  await notify("confirmation", {
    email: STR(req.body?.email, 120) || undefined,
    phone: STR(req.body?.phone, 40) || undefined,
    lang: req.body?.lang === "ar" ? "ar" : "en",
    data: { name: "Test", service: "Test Service", date: "2026-01-01", time: "12:00" },
  });
  res.json({ ok: true });
});
app.post("/api/admin/notifications/run-reminders", requireAdmin, async (_req, res) => {
  const d = beirutDay(1);
  const appts = await prisma.appointment.findMany({ where: { date: d, status: "CONFIRMED" } });
  for (const a of appts)
    await notify("reminder", {
      email: a.customerEmail || undefined,
      phone: a.customerPhone || undefined,
      data: { name: a.customerName, service: a.serviceName, date: a.date, time: a.time },
    });
  res.json({ ok: true, sent: appts.length });
});

// ---- Inventory ----
// Recompute a service's material cost from its recipe (sum of qty × product cost).
async function recomputeMaterialCost(serviceId: number) {
  const items = await prisma.serviceProduct.findMany({ where: { serviceId }, include: { product: { select: { costPrice: true } } } });
  const cost = round2(items.reduce((s, i) => s + i.quantity * (i.product?.costPrice ?? 0), 0));
  await prisma.service.update({ where: { id: serviceId }, data: { materialCost: cost } }).catch(() => {});
  return cost;
}
// Change an appointment's status and keep inventory in sync (deduct on completion,
// restore if un-completed). Guarded by stockDeducted so it never double-counts.
async function setAppointmentStatus(id: number, status: string) {
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) return null;
  const data: Record<string, unknown> = { status };
  // Inventory: deduct recipe on completion, restore if un-completed.
  const recipe = appt.serviceId ? await prisma.serviceProduct.findMany({ where: { serviceId: appt.serviceId } }) : [];
  if (status === "COMPLETED" && !appt.stockDeducted && recipe.length) {
    for (const r of recipe) {
      await prisma.product.update({ where: { id: r.productId }, data: { quantity: { decrement: r.quantity } } }).catch(() => {});
      await prisma.stockMovement.create({
        data: { productId: r.productId, type: "USE", quantity: -r.quantity, note: `${appt.serviceName} · appt #${appt.id}` },
      });
    }
    data.stockDeducted = true;
  } else if (status !== "COMPLETED" && appt.stockDeducted && recipe.length) {
    for (const r of recipe) {
      await prisma.product.update({ where: { id: r.productId }, data: { quantity: { increment: r.quantity } } }).catch(() => {});
      await prisma.stockMovement.create({ data: { productId: r.productId, type: "ADJUST", quantity: r.quantity, note: `Reversed appt #${appt.id}` } });
    }
    data.stockDeducted = false;
  }
  // Loyalty: award points on completion, reverse if un-completed.
  if (appt.customerId) {
    const loy = await getSetting("loyalty", LOYALTY_DEFAULT);
    const pts = Math.round(appt.price * (loy.pointsPerDollar || 0));
    if (loy.enabled && pts > 0 && status === "COMPLETED" && !appt.pointsAwarded) {
      await prisma.customer
        .update({ where: { id: appt.customerId }, data: { points: { increment: pts }, lifetimePoints: { increment: pts } } })
        .catch(() => {});
      data.pointsAwarded = true;
    } else if (pts > 0 && status !== "COMPLETED" && appt.pointsAwarded) {
      await prisma.customer
        .update({ where: { id: appt.customerId }, data: { points: { decrement: pts }, lifetimePoints: { decrement: pts } } })
        .catch(() => {});
      data.pointsAwarded = false;
    }
  }
  const updated = await prisma.appointment.update({ where: { id }, data });
  if (status === "CANCELLED")
    notify("cancelled", {
      email: appt.customerEmail || undefined,
      phone: appt.customerPhone || undefined,
      data: { name: appt.customerName, service: appt.serviceName, date: appt.date, time: appt.time },
    });
  if (status === "COMPLETED" && !appt.pointsAwarded)
    notify("review", {
      email: appt.customerEmail || undefined,
      phone: appt.customerPhone || undefined,
      data: { name: appt.customerName, service: appt.serviceName },
    });
  return updated;
}

app.get("/api/admin/products", requireAdmin, async (_req, res) => res.json(await prisma.product.findMany({ orderBy: [{ name: "asc" }] })));
app.post("/api/admin/products", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const name = STR(b.name, 120);
  if (!name) return res.status(400).json({ error: "Product name is required." });
  const p = await prisma.product.create({
    data: {
      name,
      brand: STR(b.brand, 80),
      category: STR(b.category, 60),
      supplier: STR(b.supplier, 80),
      barcode: STR(b.barcode, 60),
      unit: STR(b.unit, 20) || "unit",
      costPrice: Math.max(0, NUM(b.costPrice, 0)),
      sellingPrice: Math.max(0, NUM(b.sellingPrice, 0)),
      quantity: Math.max(0, NUM(b.quantity, 0)),
      minQuantity: Math.max(0, NUM(b.minQuantity, 0)),
      expiryDate: isDate(STR(b.expiryDate)) ? STR(b.expiryDate) : "",
      location: STR(b.location, 80),
    },
  });
  if (p.quantity > 0) await prisma.stockMovement.create({ data: { productId: p.id, type: "RECEIVE", quantity: p.quantity, note: "Initial stock" } });
  res.json(p);
});
app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  for (const f of ["name", "brand", "category", "supplier", "barcode", "unit", "location"])
    if (b[f] !== undefined) data[f] = STR(b[f], f === "name" ? 120 : 80);
  if (b.costPrice !== undefined) data.costPrice = Math.max(0, NUM(b.costPrice, 0));
  if (b.sellingPrice !== undefined) data.sellingPrice = Math.max(0, NUM(b.sellingPrice, 0));
  if (b.minQuantity !== undefined) data.minQuantity = Math.max(0, NUM(b.minQuantity, 0));
  if (b.expiryDate !== undefined) data.expiryDate = isDate(STR(b.expiryDate)) ? STR(b.expiryDate) : "";
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  const p = await prisma.product.update({ where: { id: Number(req.params.id) }, data });
  if (b.costPrice !== undefined) {
    // material costs of services using this product need updating
    const svc = await prisma.serviceProduct.findMany({ where: { productId: p.id }, select: { serviceId: true } });
    for (const sid of [...new Set(svc.map((x) => x.serviceId))]) await recomputeMaterialCost(sid);
  }
  res.json(p);
});
app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
  await prisma.product.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// Receive (+), use (−), or adjust (set absolute) stock; logs a movement.
app.post("/api/admin/products/:id/stock", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const type = STR(b.type, 10).toUpperCase();
  const qty = NUM(b.quantity, 0);
  const note = STR(b.note, 200);
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) return res.status(404).json({ error: "Not found." });
  let newQty = p.quantity,
    delta = 0;
  if (type === "RECEIVE") {
    delta = Math.abs(qty);
    newQty = p.quantity + delta;
  } else if (type === "USE") {
    delta = -Math.abs(qty);
    newQty = Math.max(0, p.quantity - Math.abs(qty));
  } else if (type === "ADJUST") {
    newQty = Math.max(0, qty);
    delta = round2(newQty - p.quantity);
  } else return res.status(400).json({ error: "Invalid movement type." });
  await prisma.product.update({ where: { id }, data: { quantity: newQty } });
  await prisma.stockMovement.create({ data: { productId: id, type, quantity: delta, note } });
  res.json(await prisma.product.findUnique({ where: { id } }));
});
app.get("/api/admin/movements", requireAdmin, async (req, res) => {
  const productId = Number(req.query.productId);
  res.json(
    await prisma.stockMovement.findMany({
      where: productId ? { productId } : {},
      orderBy: { id: "desc" },
      take: 200,
      include: { product: { select: { name: true, unit: true } } },
    }),
  );
});
app.get("/api/admin/inventory/summary", requireAdmin, async (_req, res) => {
  const products = await prisma.product.findMany({ where: { isActive: true } });
  const start = new Date();
  start.setHours(0, 0, 0, 0); // Beirut midnight (server runs in Beirut TZ)
  const usage = await prisma.stockMovement.aggregate({ _sum: { quantity: true }, where: { type: "USE", createdAt: { gte: start } } });
  const todayStr = beirutToday();
  const soonStr = beirutDay(30);
  const low = products.filter((p) => p.quantity <= p.minQuantity);
  const expiring = products.filter((p) => p.expiryDate && p.expiryDate >= todayStr && p.expiryDate <= soonStr);
  res.json({
    total: products.length,
    inStock: products.filter((p) => p.quantity > p.minQuantity).length,
    low: products.filter((p) => p.quantity > 0 && p.quantity <= p.minQuantity).length,
    out: products.filter((p) => p.quantity <= 0).length,
    value: round2(products.reduce((s, p) => s + p.quantity * p.costPrice, 0)),
    todayUsage: Math.abs(usage._sum.quantity ?? 0),
    expiringSoon: expiring.length,
    lowItems: low.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity, minQuantity: p.minQuantity, unit: p.unit })),
    expiringItems: expiring.map((p) => ({ id: p.id, name: p.name, expiryDate: p.expiryDate })),
  });
});

// Service recipe (which products a service consumes) — also refreshes material cost.
app.get("/api/admin/services/:id/recipe", requireAdmin, async (req, res) => {
  res.json(
    await prisma.serviceProduct.findMany({
      where: { serviceId: Number(req.params.id) },
      include: { product: { select: { name: true, unit: true, costPrice: true } } },
    }),
  );
});
app.put("/api/admin/services/:id/recipe", requireAdmin, async (req, res) => {
  const serviceId = Number(req.params.id);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await prisma.serviceProduct.deleteMany({ where: { serviceId } });
  for (const it of items) {
    const productId = Number(it?.productId),
      quantity = Math.max(0, NUM(it?.quantity, 0));
    if (productId && quantity > 0) await prisma.serviceProduct.create({ data: { serviceId, productId, quantity } }).catch(() => {});
  }
  const materialCost = await recomputeMaterialCost(serviceId);
  res.json({ ok: true, materialCost });
});

// Customer list with spend/visit aggregates (for the customers report).
app.get("/api/admin/customers", requireAdmin, async (_req, res) => {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: { appointments: { select: { price: true, status: true, date: true } } },
  });
  res.json(
    customers.map((c) => {
      const done = c.appointments.filter((a) => a.status !== "CANCELLED");
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        birthday: c.birthday,
        tags: parseArr(c.tags),
        createdAt: c.createdAt,
        visits: done.length,
        spent: round2(done.reduce((s, a) => s + a.price, 0)),
        lastVisit:
          done
            .map((a) => a.date)
            .sort()
            .pop() ?? "",
      };
    }),
  );
});
// Full customer profile for the admin.
app.get("/api/admin/customers/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      appointments: { orderBy: [{ date: "desc" }, { time: "desc" }], take: 200 },
      favorites: { select: { id: true, name: true } },
      redemptions: { orderBy: { createdAt: "desc" } },
      photos: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) return res.status(404).json({ error: "Not found." });
  const done = c.appointments.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW");
  const staffCount: Record<string, number> = {};
  for (const a of done) if (a.staffName) staffCount[a.staffName] = (staffCount[a.staffName] ?? 0) + 1;
  const preferredStaff = Object.entries(staffCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const loy = await getSetting("loyalty", LOYALTY_DEFAULT);
  const giftCards = await prisma.giftCard.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" } });
  res.json({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    birthday: c.birthday,
    notes: c.notes,
    tags: parseArr(c.tags),
    createdAt: c.createdAt,
    points: c.points,
    lifetimePoints: c.lifetimePoints,
    tier: tierFor(c.lifetimePoints, loy.tiers)?.name ?? "—",
    visits: done.length,
    spent: round2(done.reduce((s, a) => s + a.price, 0)),
    noShows: c.appointments.filter((a) => a.status === "NO_SHOW").length,
    cancellations: c.appointments.filter((a) => a.status === "CANCELLED").length,
    preferredStaff,
    favorites: c.favorites,
    appointments: c.appointments.map((a) => ({
      id: a.id,
      date: a.date,
      time: a.time,
      serviceName: a.serviceName,
      staffName: a.staffName,
      price: a.price,
      status: a.status,
    })),
    giftCards: giftCards.map((g) => ({ code: g.code, initialValue: g.initialValue, balance: g.balance, status: g.status })),
    redemptions: c.redemptions,
    photos: c.photos,
  });
});
// Full chronological timeline of a customer's relationship with the salon.
app.get("/api/admin/customers/:id/timeline", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c) return res.status(404).json({ error: "Not found." });
  const loy = await getSetting("loyalty", LOYALTY_DEFAULT);
  const ppd = loy.pointsPerDollar || 0;
  const [appts, redemptions, giftCards, reviews, photos] = await Promise.all([
    prisma.appointment.findMany({ where: { customerId: id } }),
    prisma.rewardRedemption.findMany({ where: { customerId: id } }),
    prisma.giftCard.findMany({ where: { customerId: id } }),
    prisma.review.findMany({ where: { customerId: id } }),
    prisma.customerPhoto.findMany({ where: { customerId: id } }),
  ]);
  const paymentIds = [...appts.map((a) => a.paymentId), ...giftCards.map((g) => g.paymentId)].filter(Boolean) as string[];
  const payments = paymentIds.length ? await prisma.payment.findMany({ where: { id: { in: paymentIds } } }) : [];

  type Ev = { at: string; type: string; icon: string; title: string; detail?: string };
  const ev: Ev[] = [{ at: c.createdAt.toISOString(), type: "account", icon: "👤", title: "Account created" }];
  for (const a of appts) {
    ev.push({
      at: a.createdAt.toISOString(),
      type: "booked",
      icon: "📅",
      title: `Booked ${a.serviceName}`,
      detail: `${a.date} at ${a.time}${a.staffName ? ` · ${a.staffName}` : ""}`,
    });
    const when = `${a.date}T${a.time || "00:00"}:00`;
    if (a.status === "COMPLETED") {
      ev.push({ at: when, type: "completed", icon: "✅", title: `Completed ${a.serviceName}`, detail: `$${a.price}${a.staffName ? ` · ${a.staffName}` : ""}` });
      const pts = Math.floor(a.price * ppd);
      if (a.pointsAwarded && pts > 0) ev.push({ at: when, type: "points", icon: "⭐", title: `Earned ${pts} points`, detail: a.serviceName });
    } else if (a.status === "CANCELLED") ev.push({ at: when, type: "cancelled", icon: "✖️", title: `Cancelled ${a.serviceName}` });
    else if (a.status === "NO_SHOW") ev.push({ at: when, type: "noshow", icon: "⚠️", title: `No-show · ${a.serviceName}` });
  }
  for (const r of redemptions)
    ev.push({ at: r.createdAt.toISOString(), type: "redeem", icon: "🎁", title: `Redeemed: ${r.rewardName}`, detail: r.cost ? `−${r.cost} pts` : undefined });
  for (const g of giftCards)
    ev.push({ at: g.createdAt.toISOString(), type: "giftcard", icon: "💳", title: "Purchased gift card", detail: `${g.code} · $${g.initialValue}` });
  for (const r of reviews)
    ev.push({ at: r.createdAt.toISOString(), type: "review", icon: "⭐", title: `Left a ${r.rating}★ review`, detail: r.status.toLowerCase() });
  for (const ph of photos) ev.push({ at: ph.createdAt.toISOString(), type: "photo", icon: "📷", title: "Photo added", detail: ph.label || undefined });
  for (const p of payments)
    ev.push({
      at: (p.paidAt ?? p.createdAt).toISOString(),
      type: "payment",
      icon: "💵",
      title: `Payment ${p.status.toLowerCase()} · $${p.amount}`,
      detail: `${p.method === "WHISH" ? "Whish" : "Cash"} · ${p.kind === "GIFTCARD" ? "gift card" : "booking"}`,
    });
  ev.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)); // newest first
  res.json({ notes: c.notes, events: ev });
});
app.patch("/api/admin/customers/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.notes !== undefined) data.notes = STR(b.notes, 2000);
  if (b.birthday !== undefined) data.birthday = /^\d{4}-\d{2}-\d{2}$|^\d{2}-\d{2}$/.test(STR(b.birthday)) ? STR(b.birthday) : "";
  if (b.phone !== undefined) data.phone = STR(b.phone, 40);
  if (b.tags !== undefined)
    data.tags = JSON.stringify(Array.isArray(b.tags) ? [...new Set(b.tags.map((t: unknown) => STR(t, 30)).filter(Boolean))].slice(0, 20) : []);
  await prisma.customer.update({ where: { id: Number(req.params.id) }, data });
  res.json({ ok: true });
});
// Authored, timestamped notes thread on a customer (allergies, preferences…).
app.get("/api/admin/customers/:id/notes", requireAdmin, async (req, res) => {
  res.json(await prisma.customerNote.findMany({ where: { customerId: Number(req.params.id) }, orderBy: { createdAt: "desc" } }));
});
app.post("/api/admin/customers/:id/notes", requireAdmin, async (req, res) => {
  const body = STR(req.body?.body, 1000);
  if (!body) return res.status(400).json({ error: "Note is empty." });
  const author = STR((req as Request & { principal?: { actorName?: string } }).principal?.actorName, 80) || "Staff";
  res.json(await prisma.customerNote.create({ data: { customerId: Number(req.params.id), author, body } }));
});
app.delete("/api/admin/customers/:id/notes/:noteId", requireAdmin, async (req, res) => {
  await prisma.customerNote.delete({ where: { id: STR(req.params.noteId, 40) } }).catch(() => {});
  res.json({ ok: true });
});
// Signed consent forms on a customer.
app.get("/api/admin/customers/:id/consents", requireAdmin, async (req, res) => {
  res.json(await prisma.consentForm.findMany({ where: { customerId: Number(req.params.id) }, orderBy: { signedAt: "desc" } }));
});
app.post("/api/admin/customers/:id/consents", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const sig = String(b.signatureUrl ?? "");
  if (!sig.startsWith("data:image/") || sig.length > 500000) return res.status(400).json({ error: "A signature is required." });
  res
    .status(201)
    .json(
      await prisma.consentForm.create({
        data: {
          customerId: Number(req.params.id),
          formType: STR(b.formType, 40),
          customerName: STR(b.customerName, 80),
          body: STR(b.body, 4000),
          signatureUrl: sig,
        },
      }),
    );
});
app.delete("/api/admin/customers/:id/consents/:cid", requireAdmin, async (req, res) => {
  await prisma.consentForm.delete({ where: { id: STR(req.params.cid, 40) } }).catch(() => {});
  res.json({ ok: true });
});
app.post("/api/admin/customers/:id/photos", requireAdmin, async (req, res) => {
  const url = STR(req.body?.url, 600);
  if (!url) return res.status(400).json({ error: "No image." });
  const kind = STR(req.body?.kind, 12).toUpperCase();
  res.json(
    await prisma.customerPhoto.create({
      data: {
        customerId: Number(req.params.id),
        url,
        label: STR(req.body?.label, 60),
        kind: ["PHOTO", "BEFORE", "AFTER", "DOCUMENT"].includes(kind) ? kind : "PHOTO",
      },
    }),
  );
});
app.delete("/api/admin/customers/:id/photos/:photoId", requireAdmin, async (req, res) => {
  await prisma.customerPhoto.delete({ where: { id: String(req.params.photoId) } }).catch(() => {});
  res.json({ ok: true });
});

// ---- Staff payouts ----
// Computed earnings per staff for a period (from COMPLETED appointments' snapshots).
app.get("/api/admin/payouts", requireAdmin, async (req, res) => {
  const from = STR(req.query.from),
    to = STR(req.query.to);
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: "from and to (YYYY-MM-DD) are required." });
  const staff = await prisma.staff.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const appts = await prisma.appointment.findMany({ where: { date: { gte: from, lte: to }, status: "COMPLETED", staffId: { not: null } } });
  const map: Record<number, { appointments: number; revenue: number; commission: number }> = {};
  for (const a of appts) {
    const k = a.staffId as number;
    if (!map[k]) map[k] = { appointments: 0, revenue: 0, commission: 0 };
    map[k].appointments++;
    map[k].revenue += a.price;
    map[k].commission += a.commissionAmount;
  }
  res.json(
    staff.map((s) => ({
      staffId: s.id,
      name: s.name,
      role: s.role,
      commissionPct: s.commissionPct,
      appointments: map[s.id]?.appointments ?? 0,
      revenue: round2(map[s.id]?.revenue ?? 0),
      commissionEarned: round2(map[s.id]?.commission ?? 0),
    })),
  );
});
// Record a payout (recomputes money server-side; client only supplies bonus/tips/deduction).
app.post("/api/admin/payouts", requireAdmin, async (req, res) => {
  const b = req.body ?? {};
  const staffId = Number(b.staffId);
  const from = STR(b.from),
    to = STR(b.to);
  if (!staffId || !isDate(from) || !isDate(to)) return res.status(400).json({ error: "staffId, from and to are required." });
  const appts = await prisma.appointment.findMany({ where: { staffId, date: { gte: from, lte: to }, status: "COMPLETED" } });
  const revenue = round2(appts.reduce((s, a) => s + a.price, 0));
  const commissionEarned = round2(appts.reduce((s, a) => s + a.commissionAmount, 0));
  const bonus = Math.max(0, NUM(b.bonus, 0)),
    tips = Math.max(0, NUM(b.tips, 0)),
    deduction = Math.max(0, NUM(b.deduction, 0));
  const total = round2(commissionEarned + bonus + tips - deduction);
  res.json(
    await prisma.payout.create({
      data: {
        staffId,
        periodFrom: from,
        periodTo: to,
        appointments: appts.length,
        revenue,
        commissionEarned,
        bonus,
        tips,
        deduction,
        total,
        note: STR(b.note, 300),
      },
    }),
  );
});
app.get("/api/admin/payouts/history", requireAdmin, async (req, res) => {
  const staffId = Number(req.query.staffId);
  res.json(
    await prisma.payout.findMany({ where: staffId ? { staffId } : {}, orderBy: { id: "desc" }, take: 200, include: { staff: { select: { name: true } } } }),
  );
});
app.delete("/api/admin/payouts/:id", requireAdmin, async (req, res) => {
  await prisma.payout.delete({ where: { id: Number(req.params.id) } }).catch(() => {});
  res.json({ ok: true });
});

// ---- Customer accounts ----
const CUSTOMER_SECRET = process.env.CUSTOMER_SECRET || ADMIN_KEY + "::customer";
const signCustomer = (id: number) => `${id}.${crypto.createHmac("sha256", CUSTOMER_SECRET).update(String(id)).digest("hex")}`;
const verifyCustomer = (token: string): number | null => {
  const [id, sig] = String(token).split(".");
  if (!id || !sig) return null;
  return sig === crypto.createHmac("sha256", CUSTOMER_SECRET).update(id).digest("hex") ? Number(id) : null;
};
const optionalCustomerId = (req: Request) => verifyCustomer(String(req.headers["x-customer-token"] ?? ""));
const custOf = (req: Request) => (req as Request & { customerId?: number }).customerId!;
function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const id = verifyCustomer(String(req.headers["x-customer-token"] ?? ""));
  if (!id) return res.status(401).json({ error: "Please log in." });
  (req as Request & { customerId?: number }).customerId = id;
  next();
}
const custOut = (c: { id: number; name: string; email: string; phone: string; birthday?: string }) => ({
  id: c.id,
  name: c.name,
  email: c.email,
  phone: c.phone,
  birthday: c.birthday ?? "",
});

app.post("/api/customer/register", async (req, res) => {
  const b = req.body ?? {};
  const name = STR(b.name, 80),
    email = STR(b.email, 120).toLowerCase(),
    phone = STR(b.phone, 40),
    password = String(b.password ?? "");
  if (!name || !email || password.length < 6) return res.status(400).json({ error: "Name, email and a password (6+ characters) are required." });
  if (await prisma.customer.findUnique({ where: { email } })) return res.status(409).json({ error: "An account with this email already exists." });
  const c = await prisma.customer.create({ data: { name, email, phone, passwordHash: await bcrypt.hash(password, 10) } });
  res.status(201).json({ token: signCustomer(c.id), customer: custOut(c) });
});
app.post("/api/customer/login", async (req, res) => {
  const email = STR(req.body?.email, 120).toLowerCase(),
    password = String(req.body?.password ?? "");
  const c = await prisma.customer.findUnique({ where: { email } });
  if (!c || !(await bcrypt.compare(password, c.passwordHash))) return res.status(401).json({ error: "Wrong email or password." });
  res.json({ token: signCustomer(c.id), customer: custOut(c) });
});
app.get("/api/customer/me", requireCustomer, async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: custOf(req) } });
  if (!c) return res.status(404).json({ error: "Not found." });
  res.json(custOut(c));
});
app.patch("/api/customer/me", requireCustomer, async (req, res) => {
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = STR(b.name, 80);
  if (b.phone !== undefined) data.phone = STR(b.phone, 40);
  if (b.birthday !== undefined) data.birthday = /^\d{4}-\d{2}-\d{2}$/.test(STR(b.birthday)) ? STR(b.birthday) : "";
  if (b.email !== undefined) {
    const email = STR(b.email, 120).toLowerCase();
    const existing = await prisma.customer.findUnique({ where: { email } });
    if (existing && existing.id !== custOf(req)) return res.status(409).json({ error: "That email is already in use." });
    data.email = email;
  }
  const c = await prisma.customer.update({ where: { id: custOf(req) }, data });
  res.json(custOut(c));
});
app.post("/api/customer/me/password", requireCustomer, async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: custOf(req) } });
  if (!c || !(await bcrypt.compare(String(req.body?.current ?? ""), c.passwordHash)))
    return res.status(400).json({ error: "Your current password is incorrect." });
  const next = String(req.body?.password ?? "");
  if (next.length < 6) return res.status(400).json({ error: "New password must be 6+ characters." });
  await prisma.customer.update({ where: { id: c.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  res.json({ ok: true });
});
app.get("/api/customer/me/appointments", requireCustomer, async (req, res) => {
  const items = await prisma.appointment.findMany({ where: { customerId: custOf(req) }, orderBy: [{ date: "desc" }, { time: "desc" }], take: 100 });
  const today = beirutToday();
  const shaped = items.map((a) => ({ ...a, addOns: parseArr(a.addOns) }));
  res.json({
    upcoming: shaped.filter((a) => a.status === "CONFIRMED" && a.date >= today).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)),
    past: shaped.filter((a) => !(a.status === "CONFIRMED" && a.date >= today)),
  });
});
app.patch("/api/customer/me/appointments/:id/cancel", requireCustomer, async (req, res) => {
  const a = await prisma.appointment.findUnique({ where: { id: Number(req.params.id) } });
  if (!a || a.customerId !== custOf(req)) return res.status(404).json({ error: "Appointment not found." });
  if (a.status !== "CONFIRMED") return res.status(400).json({ error: "This appointment can't be cancelled." });
  if (new Date(`${a.date}T${a.time}:00`).getTime() < Date.now()) return res.status(400).json({ error: "This appointment has already passed." });
  res.json(await prisma.appointment.update({ where: { id: a.id }, data: { status: "CANCELLED" } }));
});
app.patch("/api/customer/me/appointments/:id/reschedule", requireCustomer, async (req, res) => {
  const a = await prisma.appointment.findUnique({ where: { id: Number(req.params.id) } });
  if (!a || a.customerId !== custOf(req)) return res.status(404).json({ error: "Appointment not found." });
  if (a.status !== "CONFIRMED") return res.status(400).json({ error: "This appointment can't be rescheduled." });
  const date = STR(req.body?.date, 10),
    time = STR(req.body?.time, 5);
  if (!isDate(date) || !isTime(time)) return res.status(400).json({ error: "Pick a valid new date and time." });
  const service = a.serviceId == null ? null : await prisma.service.findUnique({ where: { id: a.serviceId }, include: { staff: true } });
  let rows = service?.staff.filter((s) => s.isActive) ?? [];
  if (!rows.length) rows = await prisma.staff.findMany({ where: { isActive: true } });
  const eligible = rows.map((s) => ({
    id: s.id,
    name: s.name,
    commissionPct: s.commissionPct,
    schedule: parseSchedule(s.schedule),
    blockedDates: parseArr(s.blockedDates) as string[],
  }));
  const existing = await prisma.appointment.findMany({
    where: { date, id: { not: a.id } },
    select: { time: true, durationMin: true, staffId: true, status: true },
  });
  const slots = availableSlots({
    date,
    durationMin: a.durationMin,
    staffId: a.staffId,
    staff: eligible,
    existing,
    now: new Date(),
    stepMin: SALON.slotStepMin,
    leadMin: SALON.leadMin,
  });
  if (!slots.includes(time)) return res.status(409).json({ error: "That time isn't available — please pick another." });
  let staffId = a.staffId;
  if (staffId == null) staffId = pickFreeStaff({ date, time, durationMin: a.durationMin, staff: eligible, existing });
  const chosen = eligible.find((s) => s.id === staffId);
  res.json(await prisma.appointment.update({ where: { id: a.id }, data: { date, time, staffId, staffName: chosen?.name ?? a.staffName } }));
});
app.get("/api/customer/me/appointments/:id/slots", requireCustomer, async (req, res) => {
  const a = await prisma.appointment.findUnique({ where: { id: Number(req.params.id) } });
  if (!a || a.customerId !== custOf(req)) return res.status(404).json({ error: "Appointment not found." });
  const date = STR((req.query as Record<string, string>).date, 10);
  if (!isDate(date)) return res.status(400).json({ error: "Invalid date." });
  const service = a.serviceId == null ? null : await prisma.service.findUnique({ where: { id: a.serviceId }, include: { staff: true } });
  let rows = service?.staff.filter((s) => s.isActive) ?? [];
  if (!rows.length) rows = await prisma.staff.findMany({ where: { isActive: true } });
  const eligible = rows.map((s) => ({
    id: s.id,
    name: s.name,
    commissionPct: s.commissionPct,
    schedule: parseSchedule(s.schedule),
    blockedDates: parseArr(s.blockedDates) as string[],
  }));
  const existing = await prisma.appointment.findMany({
    where: { date, id: { not: a.id } },
    select: { time: true, durationMin: true, staffId: true, status: true },
  });
  res.json({
    slots: availableSlots({
      date,
      durationMin: a.durationMin,
      staffId: a.staffId,
      staff: eligible,
      existing,
      now: new Date(),
      stepMin: SALON.slotStepMin,
      leadMin: SALON.leadMin,
    }),
  });
});
app.get("/api/customer/me/favorites", requireCustomer, async (req, res) => {
  const c = await prisma.customer.findUnique({
    where: { id: custOf(req) },
    include: { favorites: { where: { isActive: true }, select: { id: true, name: true, price: true, durationMin: true, categoryId: true } } },
  });
  res.json(c?.favorites ?? []);
});
app.post("/api/customer/me/favorites/:serviceId", requireCustomer, async (req, res) => {
  await prisma.customer.update({ where: { id: custOf(req) }, data: { favorites: { connect: { id: Number(req.params.serviceId) } } } }).catch(() => {});
  res.json({ ok: true });
});
app.delete("/api/customer/me/favorites/:serviceId", requireCustomer, async (req, res) => {
  await prisma.customer.update({ where: { id: custOf(req) }, data: { favorites: { disconnect: { id: Number(req.params.serviceId) } } } }).catch(() => {});
  res.json({ ok: true });
});
// Wishlist for packages & courses (cross-device, per account).
app.get("/api/customer/me/wishlist", requireCustomer, async (req, res) => {
  const favs = await prisma.favorite.findMany({ where: { customerId: custOf(req) } });
  res.json({ PACKAGE: favs.filter((f) => f.kind === "PACKAGE").map((f) => f.itemId), COURSE: favs.filter((f) => f.kind === "COURSE").map((f) => f.itemId) });
});
app.post("/api/customer/me/wishlist", requireCustomer, async (req, res) => {
  const kind = STR(req.body?.kind, 12).toUpperCase(),
    itemId = Number(req.body?.itemId);
  if (!["PACKAGE", "COURSE"].includes(kind) || !itemId) return res.status(400).json({ error: "Invalid item." });
  await prisma.favorite
    .upsert({ where: { customerId_kind_itemId: { customerId: custOf(req), kind, itemId } }, create: { customerId: custOf(req), kind, itemId }, update: {} })
    .catch(() => {});
  res.json({ ok: true });
});
app.delete("/api/customer/me/wishlist/:kind/:itemId", requireCustomer, async (req, res) => {
  await prisma.favorite
    .deleteMany({ where: { customerId: custOf(req), kind: STR(req.params.kind, 12).toUpperCase(), itemId: Number(req.params.itemId) } })
    .catch(() => {});
  res.json({ ok: true });
});
app.post("/api/customer/me/reviews", requireCustomer, async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: custOf(req) } });
  const rating = Math.max(1, Math.min(5, Math.round(NUM(req.body?.rating, 5))));
  const comment = STR(req.body?.comment, 1000);
  const appointmentId = req.body?.appointmentId ? Number(req.body.appointmentId) : null;
  if (appointmentId && (await prisma.review.findFirst({ where: { customerId: custOf(req), appointmentId } })))
    return res.status(409).json({ error: "You've already reviewed this visit." });
  const r = await prisma.review.create({
    data: { customerId: custOf(req), appointmentId, authorName: c?.name ?? "Customer", rating, comment, status: "PENDING" },
  });
  res.status(201).json({ ok: true, id: r.id });
});

const port = Number(process.env.PORT) || 4200;
app.listen(port, () => console.log(`Riwa's Glam API running on http://localhost:${port}`));
