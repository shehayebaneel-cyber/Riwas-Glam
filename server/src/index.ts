import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { prisma } from "./db.js";
import { SALON } from "./config.js";
import { availableSlots, pickFreeStaff, type DaySchedule } from "./lib/slots.js";

const app = express();
app.use(cors());
app.use(express.json());

const STR = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const NUM = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round2 = (n: number) => Math.round(n * 100) / 100;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: string) => /^\d{2}:\d{2}$/.test(s);
const parseArr = (s: string) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; } };
const parseSchedule = (s: string): DaySchedule[] => { const a = parseArr(s); return a.length === 7 ? a : []; };

const DEFAULT_SCHEDULE: DaySchedule[] = [0, 1, 2, 3, 4, 5, 6].map((d) => d === 1
  ? { off: true, open: "", close: "", breakStart: "", breakEnd: "" }
  : { off: false, open: "10:00", close: "19:00", breakStart: "", breakEnd: "" });

// Key/value settings the manager controls.
async function getSetting<T>(key: string, def: T): Promise<T> {
  const s = await prisma.setting.findUnique({ where: { key } });
  if (!s) return def;
  try { return JSON.parse(s.value) as T; } catch { return def; }
}
const setSetting = (key: string, value: unknown) => prisma.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
const GC_DEFAULT = { amounts: [25, 50, 100], min: 10, max: 500, expiryMonths: 12 };
const GC_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const gcCode = () => { let s = ""; for (let i = 0; i < 12; i++) s += GC_ALPHABET[crypto.randomInt(GC_ALPHABET.length)]; return `GC-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`; };

app.get("/api/health", (_req, res) => res.json({ ok: true, salon: SALON.name }));
app.get("/api/info", (_req, res) => res.json({ name: SALON.name, hours: SALON.hours, slotStepMin: SALON.slotStepMin }));
app.get("/api/staff", async (_req, res) => {
  const staff = await prisma.staff.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, name: true, role: true, avatar: true } });
  res.json(staff);
});

// Public catalog: active categories → active services (with their specialists) + add-ons.
app.get("/api/catalog", async (_req, res) => {
  const cats = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      services: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { staff: { where: { isActive: true }, select: { id: true, name: true, role: true }, orderBy: { sortOrder: "asc" } } } },
      addOns: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
    },
  });
  res.json(cats.filter((c) => c.services.length > 0));
});

// Resolve a booking: service, add-ons, totals, and the eligible specialists.
async function resolveBooking(serviceId: number, addOnIds: number[]) {
  const service = await prisma.service.findUnique({ where: { id: serviceId }, include: { staff: true } });
  if (!service || !service.isActive) return null;
  const addOns = addOnIds.length ? await prisma.addOn.findMany({ where: { id: { in: addOnIds }, categoryId: service.categoryId, isActive: true } }) : [];
  const durationMin = service.durationMin + addOns.reduce((s, a) => s + a.durationMin, 0);
  const price = round2(service.price + addOns.reduce((s, a) => s + a.price, 0));
  let rows = service.staff.filter((s) => s.isActive);
  if (!rows.length) rows = await prisma.staff.findMany({ where: { isActive: true } }); // fallback: anyone
  const eligible = rows.map((s) => ({ id: s.id, name: s.name, commissionPct: s.commissionPct, schedule: parseSchedule(s.schedule), blockedDates: parseArr(s.blockedDates) as string[] }));
  return { service, addOns, durationMin, price, eligible };
}

app.get("/api/availability", async (req, res) => {
  const q = req.query as Record<string, string>;
  const date = STR(q.date, 10);
  const staffId = q.staffId ? Number(q.staffId) : null;
  const addOnIds = STR(q.addOns).split(",").map(Number).filter((n) => n > 0);
  if (!isDate(date)) return res.status(400).json({ error: "Invalid date." });
  const r = await resolveBooking(Number(q.serviceId), addOnIds);
  if (!r) return res.status(404).json({ error: "Service not found." });
  const existing = await prisma.appointment.findMany({ where: { date }, select: { time: true, durationMin: true, staffId: true, status: true } });
  const slots = availableSlots({ date, durationMin: r.durationMin, staffId, staff: r.eligible, existing, now: new Date(), stepMin: SALON.slotStepMin, leadMin: SALON.leadMin });
  res.json({ date, durationMin: r.durationMin, price: r.price, slots });
});

app.post("/api/appointments", async (req, res) => {
  const b = req.body ?? {};
  let staffId: number | null = b.staffId ? Number(b.staffId) : null;
  const date = STR(b.date, 10), time = STR(b.time, 5);
  const name = STR(b.customerName, 80), phone = STR(b.customerPhone, 40);
  const addOnIds = Array.isArray(b.addOnIds) ? b.addOnIds.map(Number).filter((n: number) => n > 0) : [];
  if (!name || !phone) return res.status(400).json({ error: "Your name and phone are required." });
  if (!isDate(date) || !isTime(time)) return res.status(400).json({ error: "Please pick a valid date and time." });
  const r = await resolveBooking(Number(b.serviceId), addOnIds);
  if (!r) return res.status(404).json({ error: "That service isn't available." });
  if (staffId != null && !r.eligible.some((s) => s.id === staffId)) return res.status(400).json({ error: "That specialist doesn't offer this service." });
  const existing = await prisma.appointment.findMany({ where: { date }, select: { time: true, durationMin: true, staffId: true, status: true } });
  const slots = availableSlots({ date, durationMin: r.durationMin, staffId, staff: r.eligible, existing, now: new Date(), stepMin: SALON.slotStepMin, leadMin: SALON.leadMin });
  if (!slots.includes(time)) return res.status(409).json({ error: "Sorry, that time was just taken — please pick another." });
  if (staffId == null) staffId = pickFreeStaff({ date, time, durationMin: r.durationMin, staff: r.eligible, existing });
  const chosen = r.eligible.find((s) => s.id === staffId);
  const commissionPct = chosen?.commissionPct ?? 0;
  const appointment = await prisma.appointment.create({
    data: {
      serviceId: r.service.id, staffId, customerId: optionalCustomerId(req), customerName: name, customerPhone: phone, customerEmail: STR(b.customerEmail, 120),
      date, time, durationMin: r.durationMin, serviceName: r.service.name, staffName: chosen?.name ?? "",
      addOns: JSON.stringify(r.addOns.map((a) => ({ name: a.name, price: a.price }))),
      price: r.price, commissionPct, commissionAmount: round2(r.price * commissionPct / 100),
      note: STR(b.note, 500), status: "CONFIRMED",
    },
  });
  res.status(201).json({ ok: true, appointment });
});

// Public approved reviews + rating summary (for the site).
app.get("/api/reviews", async (_req, res) => {
  const [items, agg] = await Promise.all([
    prisma.review.findMany({ where: { status: "APPROVED" }, orderBy: [{ featured: "desc" }, { createdAt: "desc" }], take: 30, select: { id: true, authorName: true, rating: true, comment: true, featured: true, createdAt: true } }),
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
  if (!(amount >= cfg.min) || amount > cfg.max) return res.status(400).json({ error: `Amount must be between $${cfg.min} and $${cfg.max}.` });
  let code = gcCode();
  for (let i = 0; i < 5 && (await prisma.giftCard.findUnique({ where: { code } })); i++) code = gcCode();
  const expiresAt = cfg.expiryMonths ? new Date(Date.now() + cfg.expiryMonths * 30 * 86400000) : null;
  const card = await prisma.giftCard.create({ data: { code, initialValue: amount, balance: amount, purchaserName: STR(req.body?.purchaserName, 80), purchaserEmail: STR(req.body?.purchaserEmail, 120), recipientName: STR(req.body?.recipientName, 80), message: STR(req.body?.message, 500), customerId: optionalCustomerId(req), expiresAt } });
  res.status(201).json({ code: card.code, balance: card.balance, expiresAt: card.expiresAt });
});
app.get("/api/gift-cards/:code", async (req, res) => {
  const card = await prisma.giftCard.findUnique({ where: { code: STR(req.params.code, 40).toUpperCase() } });
  if (!card) return res.status(404).json({ error: "Gift card not found." });
  const expired = !!(card.expiresAt && card.expiresAt.getTime() < Date.now());
  res.json({ code: card.code, balance: card.balance, initialValue: card.initialValue, status: card.status === "ACTIVE" && expired ? "EXPIRED" : card.status, expiresAt: card.expiresAt, recipientName: card.recipientName });
});

// ---- Admin ----
const ADMIN_KEY = process.env.ADMIN_KEY || "riwa-admin";
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if ((req.headers["x-admin-key"] ?? "") !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}
app.post("/api/admin/login", (req, res) => { if (STR(req.body?.key) === ADMIN_KEY) return res.json({ ok: true }); res.status(401).json({ error: "Wrong password." }); });

app.get("/api/admin/appointments", requireAdmin, async (req, res) => {
  const date = STR((req.query as Record<string, string>).date, 10);
  const items = await prisma.appointment.findMany({ where: date ? { date } : {}, orderBy: [{ date: "asc" }, { time: "asc" }], take: 400 });
  res.json(items.map((a) => ({ ...a, addOns: parseArr(a.addOns) })));
});
app.patch("/api/admin/appointments/:id", requireAdmin, async (req, res) => {
  const status = STR(req.body?.status, 20).toUpperCase();
  if (!["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  res.json(await prisma.appointment.update({ where: { id: Number(req.params.id) }, data: { status } }));
});

// ---- Admin: catalog ----
app.get("/api/admin/catalog", requireAdmin, async (_req, res) => {
  res.json(await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { services: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, addOns: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } } }));
});
app.post("/api/admin/categories", requireAdmin, async (req, res) => {
  const name = STR(req.body?.name, 60); if (!name) return res.status(400).json({ error: "Category name is required." });
  const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
  res.status(201).json(await prisma.category.create({ data: { name, emoji: STR(req.body?.emoji, 8), sortOrder: (max._max.sortOrder ?? 0) + 1 } }));
});
app.patch("/api/admin/categories/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = STR(b.name, 60);
  if (b.emoji !== undefined) data.emoji = STR(b.emoji, 8);
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  res.json(await prisma.category.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/categories/:id", requireAdmin, async (req, res) => { await prisma.category.delete({ where: { id: Number(req.params.id) } }).catch(() => {}); res.json({ ok: true }); });

app.post("/api/admin/services", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const categoryId = Number(b.categoryId), name = STR(b.name, 80);
  if (!categoryId || !name) return res.status(400).json({ error: "Category and service name are required." });
  const max = await prisma.service.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
  res.status(201).json(await prisma.service.create({ data: { categoryId, name, description: STR(b.description, 600), durationMin: Math.max(5, NUM(b.durationMin, 30)), price: Math.max(0, NUM(b.price, 0)), sortOrder: (max._max.sortOrder ?? 0) + 1 } }));
});
app.patch("/api/admin/services/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = STR(b.name, 80);
  if (b.description !== undefined) data.description = STR(b.description, 600);
  if (b.durationMin !== undefined) data.durationMin = Math.max(5, NUM(b.durationMin, 30));
  if (b.price !== undefined) data.price = Math.max(0, NUM(b.price, 0));
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  if (b.categoryId !== undefined) data.categoryId = Number(b.categoryId);
  res.json(await prisma.service.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/services/:id", requireAdmin, async (req, res) => { await prisma.service.delete({ where: { id: Number(req.params.id) } }).catch(() => {}); res.json({ ok: true }); });

app.post("/api/admin/addons", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const categoryId = Number(b.categoryId), name = STR(b.name, 80);
  if (!categoryId || !name) return res.status(400).json({ error: "Category and add-on name are required." });
  const max = await prisma.addOn.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
  res.status(201).json(await prisma.addOn.create({ data: { categoryId, name, durationMin: Math.max(0, NUM(b.durationMin, 0)), price: Math.max(0, NUM(b.price, 0)), sortOrder: (max._max.sortOrder ?? 0) + 1 } }));
});
app.patch("/api/admin/addons/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = STR(b.name, 80);
  if (b.durationMin !== undefined) data.durationMin = Math.max(0, NUM(b.durationMin, 0));
  if (b.price !== undefined) data.price = Math.max(0, NUM(b.price, 0));
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  res.json(await prisma.addOn.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/addons/:id", requireAdmin, async (req, res) => { await prisma.addOn.delete({ where: { id: Number(req.params.id) } }).catch(() => {}); res.json({ ok: true }); });

app.post("/api/admin/reorder", requireAdmin, async (req, res) => {
  const type = STR(req.body?.type, 10), id = Number(req.body?.id), up = STR(req.body?.direction, 4) === "up";
  type Row = { id: number; sortOrder: number };
  const pick = (list: Row[]): [Row, Row] | null => { const i = list.findIndex((x) => x.id === id); const o = list[i + (up ? -1 : 1)]; return i >= 0 && o ? [list[i], o] : null; };
  if (type === "category") { const p = pick(await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })); if (p) { await prisma.category.update({ where: { id: p[0].id }, data: { sortOrder: p[1].sortOrder } }); await prisma.category.update({ where: { id: p[1].id }, data: { sortOrder: p[0].sortOrder } }); } }
  else if (type === "service") { const s = await prisma.service.findUnique({ where: { id } }); const p = s ? pick(await prisma.service.findMany({ where: { categoryId: s.categoryId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })) : null; if (p) { await prisma.service.update({ where: { id: p[0].id }, data: { sortOrder: p[1].sortOrder } }); await prisma.service.update({ where: { id: p[1].id }, data: { sortOrder: p[0].sortOrder } }); } }
  else if (type === "addon") { const a = await prisma.addOn.findUnique({ where: { id } }); const p = a ? pick(await prisma.addOn.findMany({ where: { categoryId: a.categoryId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })) : null; if (p) { await prisma.addOn.update({ where: { id: p[0].id }, data: { sortOrder: p[1].sortOrder } }); await prisma.addOn.update({ where: { id: p[1].id }, data: { sortOrder: p[0].sortOrder } }); } }
  else return res.status(400).json({ error: "Bad type." });
  res.json({ ok: true });
});

// ---- Admin: staff / specialists ----
app.get("/api/admin/staff", requireAdmin, async (_req, res) => {
  const staff = await prisma.staff.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { services: { select: { id: true } } } });
  res.json(staff.map((s) => ({ id: s.id, name: s.name, role: s.role, avatar: s.avatar, isActive: s.isActive, commissionPct: s.commissionPct, schedule: parseSchedule(s.schedule), blockedDates: parseArr(s.blockedDates), serviceIds: s.services.map((x) => x.id), loginEmail: s.loginEmail, hasLogin: !!s.passwordHash })));
});
app.post("/api/admin/staff", requireAdmin, async (req, res) => {
  const name = STR(req.body?.name, 60); if (!name) return res.status(400).json({ error: "Staff name is required." });
  const max = await prisma.staff.aggregate({ _max: { sortOrder: true } });
  res.status(201).json(await prisma.staff.create({ data: { name, role: STR(req.body?.role, 60), commissionPct: Math.max(0, Math.min(100, NUM(req.body?.commissionPct, 0))), schedule: JSON.stringify(DEFAULT_SCHEDULE), blockedDates: "[]", sortOrder: (max._max.sortOrder ?? 0) + 1 } }));
});
app.patch("/api/admin/staff/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const data: Record<string, unknown> = {};
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
  await prisma.staff.update({ where: { id: Number(req.params.id) }, data });
  res.json({ ok: true });
});
app.delete("/api/admin/staff/:id", requireAdmin, async (req, res) => { await prisma.staff.delete({ where: { id: Number(req.params.id) } }).catch(() => {}); res.json({ ok: true }); });

// ---- Admin: commission report ----
app.get("/api/admin/commissions", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;
  const from = STR(q.from, 10) || "0000-00-00", to = STR(q.to, 10) || "9999-99-99";
  const appts = await prisma.appointment.findMany({ where: { date: { gte: from, lte: to }, status: { not: "CANCELLED" } }, select: { staffId: true, staffName: true, price: true, commissionAmount: true, status: true } });
  const map = new Map<number, { staffId: number; staffName: string; appts: number; revenue: number; commission: number }>();
  for (const a of appts) {
    const key = a.staffId ?? 0;
    const e = map.get(key) ?? { staffId: key, staffName: a.staffName || "Unassigned", appts: 0, revenue: 0, commission: 0 };
    e.appts++; e.revenue = round2(e.revenue + a.price); e.commission = round2(e.commission + a.commissionAmount);
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
  if (!staff || !staff.passwordHash || !staff.isActive || !(await bcrypt.compare(password, staff.passwordHash))) return res.status(401).json({ error: "Wrong email or password." });
  res.json({ token: signStaff(staff.id), staff: { id: staff.id, name: staff.name, role: staff.role } });
});
app.get("/api/staff/me", requireStaff, async (req, res) => {
  const s = await prisma.staff.findUnique({ where: { id: staffOf(req) } });
  if (!s) return res.status(404).json({ error: "Not found." });
  res.json({ id: s.id, name: s.name, role: s.role, commissionPct: s.commissionPct, schedule: parseSchedule(s.schedule), blockedDates: parseArr(s.blockedDates) });
});
app.get("/api/staff/me/appointments", requireStaff, async (req, res) => {
  const date = STR((req.query as Record<string, string>).date, 10);
  const items = await prisma.appointment.findMany({ where: { staffId: staffOf(req), ...(date ? { date } : {}) }, orderBy: [{ date: "asc" }, { time: "asc" }], take: 300 });
  res.json(items.map((a) => ({ ...a, addOns: parseArr(a.addOns) })));
});
app.patch("/api/staff/me/appointments/:id", requireStaff, async (req, res) => {
  const status = STR(req.body?.status, 20).toUpperCase();
  if (!["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  const appt = await prisma.appointment.findUnique({ where: { id: Number(req.params.id) } });
  if (!appt || appt.staffId !== staffOf(req)) return res.status(404).json({ error: "Not found." });
  res.json(await prisma.appointment.update({ where: { id: appt.id }, data: { status } }));
});

// ---- Admin: reviews (moderation) ----
app.get("/api/admin/reviews", requireAdmin, async (_req, res) => {
  res.json(await prisma.review.findMany({ orderBy: { createdAt: "desc" }, take: 200 }));
});
app.patch("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const data: Record<string, unknown> = {};
  if (b.status !== undefined) { const s = STR(b.status, 20).toUpperCase(); if (!["PENDING", "APPROVED", "HIDDEN"].includes(s)) return res.status(400).json({ error: "Invalid status." }); data.status = s; }
  if (b.featured !== undefined) data.featured = !!b.featured;
  res.json(await prisma.review.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => { await prisma.review.delete({ where: { id: Number(req.params.id) } }).catch(() => {}); res.json({ ok: true }); });

// ---- Admin: gift cards + settings ----
app.get("/api/admin/gift-cards", requireAdmin, async (_req, res) => {
  const cards = await prisma.giftCard.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  const issued = round2(cards.reduce((s, c) => s + c.initialValue, 0));
  const outstanding = round2(cards.filter((c) => c.status === "ACTIVE").reduce((s, c) => s + c.balance, 0));
  const redeemed = round2(cards.reduce((s, c) => s + (c.status === "VOID" ? 0 : c.initialValue - c.balance), 0));
  res.json({ items: cards, summary: { count: cards.length, issued, outstanding, redeemed } });
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
  const b = req.body ?? {}; const cur = await getSetting("giftcard", GC_DEFAULT);
  const next = {
    amounts: Array.isArray(b.amounts) ? b.amounts.map(Number).filter((n: number) => n > 0) : cur.amounts,
    min: b.min !== undefined ? Math.max(1, NUM(b.min, cur.min)) : cur.min,
    max: b.max !== undefined ? Math.max(1, NUM(b.max, cur.max)) : cur.max,
    expiryMonths: b.expiryMonths !== undefined ? Math.max(0, NUM(b.expiryMonths, cur.expiryMonths)) : cur.expiryMonths,
  };
  await setSetting("giftcard", next);
  res.json(next);
});

// ---- Customer accounts ----
const CUSTOMER_SECRET = process.env.CUSTOMER_SECRET || ADMIN_KEY + "::customer";
const signCustomer = (id: number) => `${id}.${crypto.createHmac("sha256", CUSTOMER_SECRET).update(String(id)).digest("hex")}`;
const verifyCustomer = (token: string): number | null => { const [id, sig] = String(token).split("."); if (!id || !sig) return null; return sig === crypto.createHmac("sha256", CUSTOMER_SECRET).update(id).digest("hex") ? Number(id) : null; };
const optionalCustomerId = (req: Request) => verifyCustomer(String(req.headers["x-customer-token"] ?? ""));
const custOf = (req: Request) => (req as Request & { customerId?: number }).customerId!;
function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const id = verifyCustomer(String(req.headers["x-customer-token"] ?? ""));
  if (!id) return res.status(401).json({ error: "Please log in." });
  (req as Request & { customerId?: number }).customerId = id;
  next();
}
const custOut = (c: { id: number; name: string; email: string; phone: string }) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone });

app.post("/api/customer/register", async (req, res) => {
  const b = req.body ?? {};
  const name = STR(b.name, 80), email = STR(b.email, 120).toLowerCase(), phone = STR(b.phone, 40), password = String(b.password ?? "");
  if (!name || !email || password.length < 6) return res.status(400).json({ error: "Name, email and a password (6+ characters) are required." });
  if (await prisma.customer.findUnique({ where: { email } })) return res.status(409).json({ error: "An account with this email already exists." });
  const c = await prisma.customer.create({ data: { name, email, phone, passwordHash: await bcrypt.hash(password, 10) } });
  res.status(201).json({ token: signCustomer(c.id), customer: custOut(c) });
});
app.post("/api/customer/login", async (req, res) => {
  const email = STR(req.body?.email, 120).toLowerCase(), password = String(req.body?.password ?? "");
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
  const b = req.body ?? {}; const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = STR(b.name, 80);
  if (b.phone !== undefined) data.phone = STR(b.phone, 40);
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
  if (!c || !(await bcrypt.compare(String(req.body?.current ?? ""), c.passwordHash))) return res.status(400).json({ error: "Your current password is incorrect." });
  const next = String(req.body?.password ?? "");
  if (next.length < 6) return res.status(400).json({ error: "New password must be 6+ characters." });
  await prisma.customer.update({ where: { id: c.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  res.json({ ok: true });
});
app.get("/api/customer/me/appointments", requireCustomer, async (req, res) => {
  const items = await prisma.appointment.findMany({ where: { customerId: custOf(req) }, orderBy: [{ date: "desc" }, { time: "desc" }], take: 100 });
  const today = new Date().toLocaleDateString("en-CA");
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
  const date = STR(req.body?.date, 10), time = STR(req.body?.time, 5);
  if (!isDate(date) || !isTime(time)) return res.status(400).json({ error: "Pick a valid new date and time." });
  const service = await prisma.service.findUnique({ where: { id: a.serviceId }, include: { staff: true } });
  let rows = service?.staff.filter((s) => s.isActive) ?? [];
  if (!rows.length) rows = await prisma.staff.findMany({ where: { isActive: true } });
  const eligible = rows.map((s) => ({ id: s.id, name: s.name, commissionPct: s.commissionPct, schedule: parseSchedule(s.schedule), blockedDates: parseArr(s.blockedDates) as string[] }));
  const existing = await prisma.appointment.findMany({ where: { date, id: { not: a.id } }, select: { time: true, durationMin: true, staffId: true, status: true } });
  const slots = availableSlots({ date, durationMin: a.durationMin, staffId: a.staffId, staff: eligible, existing, now: new Date(), stepMin: SALON.slotStepMin, leadMin: SALON.leadMin });
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
  const service = await prisma.service.findUnique({ where: { id: a.serviceId }, include: { staff: true } });
  let rows = service?.staff.filter((s) => s.isActive) ?? [];
  if (!rows.length) rows = await prisma.staff.findMany({ where: { isActive: true } });
  const eligible = rows.map((s) => ({ id: s.id, name: s.name, commissionPct: s.commissionPct, schedule: parseSchedule(s.schedule), blockedDates: parseArr(s.blockedDates) as string[] }));
  const existing = await prisma.appointment.findMany({ where: { date, id: { not: a.id } }, select: { time: true, durationMin: true, staffId: true, status: true } });
  res.json({ slots: availableSlots({ date, durationMin: a.durationMin, staffId: a.staffId, staff: eligible, existing, now: new Date(), stepMin: SALON.slotStepMin, leadMin: SALON.leadMin }) });
});
app.get("/api/customer/me/favorites", requireCustomer, async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: custOf(req) }, include: { favorites: { where: { isActive: true }, select: { id: true, name: true, price: true, durationMin: true, categoryId: true } } } });
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
app.post("/api/customer/me/reviews", requireCustomer, async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: custOf(req) } });
  const rating = Math.max(1, Math.min(5, Math.round(NUM(req.body?.rating, 5))));
  const comment = STR(req.body?.comment, 1000);
  const appointmentId = req.body?.appointmentId ? Number(req.body.appointmentId) : null;
  if (appointmentId && await prisma.review.findFirst({ where: { customerId: custOf(req), appointmentId } })) return res.status(409).json({ error: "You've already reviewed this visit." });
  const r = await prisma.review.create({ data: { customerId: custOf(req), appointmentId, authorName: c?.name ?? "Customer", rating, comment, status: "PENDING" } });
  res.status(201).json({ ok: true, id: r.id });
});

const port = Number(process.env.PORT) || 4200;
app.listen(port, () => console.log(`Riwa's Glam API running on http://localhost:${port}`));
