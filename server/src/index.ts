import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { prisma } from "./db.js";
import { SALON } from "./config.js";
import { availableSlots, pickFreeStaff, type DaySchedule } from "./lib/slots.js";

const app = express();
app.set("trust proxy", true); // Render terminates TLS; trust x-forwarded-proto for absolute image URLs
app.use(cors());
app.use(express.json({ limit: "12mb" })); // room for base64 image uploads

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
const tierFor = (lifetimePoints: number, tiers: Tier[]) => [...tiers].sort((a, b) => b.minPoints - a.minPoints).find((t) => lifetimePoints >= t.minPoints) ?? null;
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
  // Strip internal-only fields (materialCost) from the public payload.
  res.json(cats.filter((c) => c.services.length > 0).map((c) => ({ ...c, services: c.services.map(({ materialCost, ...s }) => s) })));
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
// A package books like a service, but any active specialist can perform it.
async function resolvePackage(id: number) {
  const pkg = await prisma.package.findFirst({ where: { id, isActive: true } });
  if (!pkg) return null;
  const rows = await prisma.staff.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const eligible = rows.map((s) => ({ id: s.id, name: s.name, commissionPct: s.commissionPct, schedule: parseSchedule(s.schedule), blockedDates: parseArr(s.blockedDates) as string[] }));
  return { pkg, eligible, durationMin: pkg.durationMin, price: round2(pkg.price) };
}

app.get("/api/availability", async (req, res) => {
  const q = req.query as Record<string, string>;
  const date = STR(q.date, 10);
  const staffId = q.staffId ? Number(q.staffId) : null;
  const addOnIds = STR(q.addOns).split(",").map(Number).filter((n) => n > 0);
  if (!isDate(date)) return res.status(400).json({ error: "Invalid date." });
  const pkgId = q.packageId ? Number(q.packageId) : 0;
  const r = pkgId ? await resolvePackage(pkgId) : await resolveBooking(Number(q.serviceId), addOnIds);
  if (!r) return res.status(404).json({ error: "Not found." });
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
  const isPkg = !!b.packageId;
  const pr = isPkg ? await resolvePackage(Number(b.packageId)) : null;
  const sr = isPkg ? null : await resolveBooking(Number(b.serviceId), addOnIds);
  const r = pr ?? sr;
  if (!r) return res.status(404).json({ error: "That isn't available." });
  if (staffId != null && !r.eligible.some((s) => s.id === staffId)) return res.status(400).json({ error: "That specialist isn't available for this." });
  const existing = await prisma.appointment.findMany({ where: { date }, select: { time: true, durationMin: true, staffId: true, status: true } });
  const slots = availableSlots({ date, durationMin: r.durationMin, staffId, staff: r.eligible, existing, now: new Date(), stepMin: SALON.slotStepMin, leadMin: SALON.leadMin });
  if (!slots.includes(time)) return res.status(409).json({ error: "Sorry, that time was just taken — please pick another." });
  if (staffId == null) staffId = pickFreeStaff({ date, time, durationMin: r.durationMin, staff: r.eligible, existing });
  const chosen = r.eligible.find((s) => s.id === staffId);
  const commissionPct = chosen?.commissionPct ?? 0;
  const custId = optionalCustomerId(req);
  let price = r.price;
  if (custId) { // auto-apply the member's loyalty tier discount
    const loy = await getSetting("loyalty", LOYALTY_DEFAULT);
    const cust = loy.enabled ? await prisma.customer.findUnique({ where: { id: custId } }) : null;
    const t = cust ? tierFor(cust.lifetimePoints, loy.tiers) : null;
    if (t?.discountPct) price = round2(price * (1 - t.discountPct / 100));
  }
  const appointment = await prisma.appointment.create({
    data: {
      serviceId: pr ? null : sr!.service.id, packageId: pr ? pr.pkg.id : null,
      staffId, customerId: custId, customerName: name, customerPhone: phone, customerEmail: STR(b.customerEmail, 120),
      date, time, durationMin: r.durationMin, serviceName: pr ? pr.pkg.title : sr!.service.name, staffName: chosen?.name ?? "",
      addOns: JSON.stringify(pr ? [] : sr!.addOns.map((a) => ({ name: a.name, price: a.price }))),
      price, commissionPct, commissionAmount: round2(price * commissionPct / 100),
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
  const q = req.query as Record<string, string>;
  const date = STR(q.date, 10), from = STR(q.from, 10), to = STR(q.to, 10);
  const where = date ? { date } : (isDate(from) && isDate(to) ? { date: { gte: from, lte: to } } : {});
  const items = await prisma.appointment.findMany({ where, orderBy: [{ date: "asc" }, { time: "asc" }], take: 1000 });
  res.json(items.map((a) => ({ ...a, addOns: parseArr(a.addOns) })));
});
app.patch("/api/admin/appointments/:id", requireAdmin, async (req, res) => {
  const status = STR(req.body?.status, 20).toUpperCase();
  if (!["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"].includes(status)) return res.status(400).json({ error: "Invalid status." });
  const updated = await setAppointmentStatus(Number(req.params.id), status);
  if (!updated) return res.status(404).json({ error: "Not found." });
  res.json(updated);
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
  if (b.materialCost !== undefined) data.materialCost = Math.max(0, NUM(b.materialCost, 0));
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
  res.json(await setAppointmentStatus(appt.id, status));
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

// ---- Editable site content (text + photos the manager controls) ----
// Defaults mirror the salon's launch content; admin edits are stored as overrides.
const SITE_CONTENT_DEFAULT = {
  name: "Riwa's Glam",
  logo: "", // header logo image; falls back to the name text when empty
  tagline: "Hair · Nails · Beauty",
  heroTitle: "Look your best,\nfeel your best.",
  heroSub: "Premium hair, nails and beauty in a calm, welcoming space. Book your appointment online in under a minute.",
  heroImage: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1000&q=80&auto=format&fit=crop",
  phone: "+961 78 910 551",
  whatsapp: "96178910551",
  email: "hello@riwasglam.beauty",
  address: "Ain Hala Entrance, Aley, Lebanon",
  instagram: "riwasglam",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=Ain+Hala+Aley+Lebanon",
  aboutTitle: "Where beauty meets care",
  about: "At Riwa's Glam we believe every visit should feel like a treat. Our team of specialists blends skill, quality products and a warm atmosphere to help you leave glowing — whether it's flawless makeup, stunning lashes, perfect nails or a special-occasion glam.",
  why: [
    { icon: "✨", title: "Expert specialists", text: "A dedicated pro for every service — makeup, lashes, nails, brows & more." },
    { icon: "🧼", title: "Clean & hygienic", text: "Sterilised tools and a spotless, welcoming space." },
    { icon: "💖", title: "Personalised care", text: "Looks tailored to you, from natural glow to full glam." },
    { icon: "📅", title: "Easy online booking", text: "Book your specialist in seconds — reschedule anytime." },
  ],
  hours: [
    { day: "Sunday", value: "11:00 – 18:00" },
    { day: "Monday", value: "Closed" },
    { day: "Tuesday", value: "10:00 – 19:00" },
    { day: "Wednesday", value: "10:00 – 19:00" },
    { day: "Thursday", value: "10:00 – 19:00" },
    { day: "Friday", value: "10:00 – 20:00" },
    { day: "Saturday", value: "10:00 – 20:00" },
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
  galleryCats: ["All", "Makeup", "Nails", "Lashes", "Brows", "Hair", "Before & After"],
  galleryItems: [
    { src: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=700&q=80&auto=format&fit=crop", cat: "Makeup" },
    { src: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=700&q=80&auto=format&fit=crop", cat: "Makeup" },
    { src: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=700&q=80&auto=format&fit=crop", cat: "Nails" },
    { src: "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=700&q=80&auto=format&fit=crop", cat: "Nails" },
    { src: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=700&q=80&auto=format&fit=crop", cat: "Lashes" },
    { src: "https://images.unsplash.com/photo-1583001931096-959e9a1a6223?w=700&q=80&auto=format&fit=crop", cat: "Lashes" },
    { src: "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=700&q=80&auto=format&fit=crop", cat: "Brows" },
    { src: "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=700&q=80&auto=format&fit=crop", cat: "Hair" },
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
    why: Array.isArray(b.why) ? b.why.slice(0, 8).map((w: Record<string, unknown>) => ({ icon: STR(w?.icon, 8), title: STR(w?.title, 80), text: STR(w?.text, 300) })) : cur.why,
    hours: Array.isArray(b.hours) ? b.hours.slice(0, 7).map((h: Record<string, unknown>) => ({ day: STR(h?.day, 20), value: STR(h?.value, 40) })) : cur.hours,
    categoryImages: b.categoryImages && typeof b.categoryImages === "object" ? Object.fromEntries(Object.entries(b.categoryImages).map(([k, v]) => [STR(k, 60), STR(v, 600)])) : cur.categoryImages,
    featured: arrStr(b.featured) ?? cur.featured,
    galleryCats: arrStr(b.galleryCats) ?? cur.galleryCats,
    galleryItems: Array.isArray(b.galleryItems) ? b.galleryItems.slice(0, 120).map((g: Record<string, unknown>) => ({ src: STR(g?.src, 600), cat: STR(g?.cat, 60) })).filter((g: { src: string }) => g.src) : cur.galleryItems,
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
app.get("/api/admin/expenses", requireAdmin, async (req, res) => {
  const from = STR(req.query.from), to = STR(req.query.to);
  const where = isDate(from) && isDate(to) ? { date: { gte: from, lte: to } } : {};
  res.json(await prisma.expense.findMany({ where, orderBy: [{ date: "desc" }, { id: "desc" }] }));
});
app.post("/api/admin/expenses", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const date = STR(b.date);
  if (!isDate(date)) return res.status(400).json({ error: "A valid date is required." });
  res.json(await prisma.expense.create({ data: { category: STR(b.category, 40) || "Other", label: STR(b.label, 120), amount: Math.max(0, NUM(b.amount, 0)), date, note: STR(b.note, 300) } }));
});
app.patch("/api/admin/expenses/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const data: Record<string, unknown> = {};
  if (b.category !== undefined) data.category = STR(b.category, 40);
  if (b.label !== undefined) data.label = STR(b.label, 120);
  if (b.amount !== undefined) data.amount = Math.max(0, NUM(b.amount, 0));
  if (b.date !== undefined && isDate(STR(b.date))) data.date = STR(b.date);
  if (b.note !== undefined) data.note = STR(b.note, 300);
  res.json(await prisma.expense.update({ where: { id: Number(req.params.id) }, data }));
});
app.delete("/api/admin/expenses/:id", requireAdmin, async (req, res) => { await prisma.expense.delete({ where: { id: Number(req.params.id) } }).catch(() => {}); res.json({ ok: true }); });

// Revenue & profit for a date range. Profit = revenue − materials − commissions − expenses.
app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
  const from = STR(req.query.from), to = STR(req.query.to);
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: "from and to (YYYY-MM-DD) are required." });
  const appts = await prisma.appointment.findMany({
    where: { date: { gte: from, lte: to }, status: { in: ["CONFIRMED", "COMPLETED"] } },
    include: { service: { select: { materialCost: true, category: { select: { name: true } } } } },
  });
  const expenses = await prisma.expense.findMany({ where: { date: { gte: from, lte: to } } });

  let revenue = 0, material = 0, commission = 0;
  const byCat: Record<string, number> = {}, byStaff: Record<string, number> = {};
  const byService: Record<string, { revenue: number; material: number; commission: number; count: number }> = {};
  const daily: Record<string, number> = {};
  for (const a of appts) {
    const mc = a.service?.materialCost ?? 0;
    revenue += a.price; material += mc; commission += a.commissionAmount;
    const cat = a.service?.category?.name ?? "Other"; byCat[cat] = (byCat[cat] ?? 0) + a.price;
    const st = a.staffName || "Unassigned"; byStaff[st] = (byStaff[st] ?? 0) + a.price;
    const sv = a.serviceName || "Service";
    if (!byService[sv]) byService[sv] = { revenue: 0, material: 0, commission: 0, count: 0 };
    byService[sv].revenue += a.price; byService[sv].material += mc; byService[sv].commission += a.commissionAmount; byService[sv].count++;
    daily[a.date] = (daily[a.date] ?? 0) + a.price;
  }
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const grossProfit = revenue - material - commission;
  const count = appts.length;
  const toArr = (o: Record<string, number>) => Object.entries(o).map(([name, value]) => ({ name, value: round2(value) })).sort((x, y) => y.value - x.value);
  const serviceRows = Object.entries(byService).map(([name, v]) => ({ name, count: v.count, revenue: round2(v.revenue), profit: round2(v.revenue - v.material - v.commission) })).sort((x, y) => y.revenue - x.revenue);
  const daySeries = Object.entries(daily).map(([date, value]) => ({ date, value: round2(value) })).sort((x, y) => (x.date < y.date ? -1 : 1));
  res.json({
    revenue: round2(revenue), material: round2(material), commission: round2(commission), expenses: round2(expensesTotal),
    grossProfit: round2(grossProfit), netProfit: round2(grossProfit - expensesTotal),
    appointments: count, avgTicket: count ? round2(revenue / count) : 0,
    bestService: serviceRows[0]?.name ?? "—", topStaff: toArr(byStaff)[0]?.name ?? "—",
    byCategory: toArr(byCat), byStaff: toArr(byStaff), byService: serviceRows, daily: daySeries,
  });
});

// ---- Admin home dashboard (all widgets + charts in one call) ----
app.get("/api/admin/dashboard", requireAdmin, async (_req, res) => {
  const now = new Date(); const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getUTCFullYear(), mo = now.getUTCMonth();
  const todayStr = `${y}-${pad(mo + 1)}-${pad(now.getUTCDate())}`;
  const monthStart = `${y}-${pad(mo + 1)}-01`;
  const monthEnd = `${y}-${pad(mo + 1)}-${pad(new Date(Date.UTC(y, mo + 1, 0)).getUTCDate())}`;
  const months: string[] = []; for (let i = 5; i >= 0; i--) { const d = new Date(Date.UTC(y, mo - i, 1)); months.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`); }
  const sixStart = months[0] + "-01";

  const [apptsMonth, expMonth, appts6, exp6, staff, products, giftCards, pendingReviews] = await Promise.all([
    prisma.appointment.findMany({ where: { date: { gte: monthStart, lte: monthEnd }, status: { in: ["CONFIRMED", "COMPLETED"] } }, include: { service: { select: { materialCost: true, category: { select: { name: true } } } } } }),
    prisma.expense.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.appointment.findMany({ where: { date: { gte: sixStart, lte: monthEnd }, status: { in: ["CONFIRMED", "COMPLETED"] } }, include: { service: { select: { materialCost: true } } } }),
    prisma.expense.findMany({ where: { date: { gte: sixStart, lte: monthEnd } } }),
    prisma.staff.findMany({ where: { isActive: true } }),
    prisma.product.findMany({ where: { isActive: true } }),
    prisma.giftCard.findMany({ where: { createdAt: { gte: new Date(monthStart + "T00:00:00Z") } } }),
    prisma.review.count({ where: { status: "PENDING" } }),
  ]);

  type A = { price: number; commissionAmount: number; service: { materialCost: number } | null };
  const calc = (arr: A[]) => arr.reduce((o, a) => { o.rev += a.price; o.mat += a.service?.materialCost ?? 0; o.com += a.commissionAmount; return o; }, { rev: 0, mat: 0, com: 0 });
  const profit = (arr: A[], exp: { amount: number }[]) => round2(calc(arr).rev - calc(arr).mat - calc(arr).com - exp.reduce((s, e) => s + e.amount, 0));

  const apptsToday = apptsMonth.filter((a) => a.date === todayStr);
  const expToday = expMonth.filter((e) => e.date === todayStr);
  const tC = calc(apptsToday), mC = calc(apptsMonth);

  const dow = new Date(todayStr + "T00:00:00Z").getUTCDay();
  const workingToday = staff.filter((s) => { const d = parseArr(s.schedule)[dow]; return d && !d.off && !parseArr(s.blockedDates).includes(todayStr); }).map((s) => ({ name: s.name, role: s.role }));
  const low = products.filter((p) => p.quantity <= p.minQuantity);

  const svc: Record<string, number> = {}, stf: Record<string, number> = {}, cat: Record<string, number> = {}, day: Record<string, number> = {};
  for (const a of apptsMonth) {
    svc[a.serviceName] = (svc[a.serviceName] ?? 0) + 1;
    stf[a.staffName || "Unassigned"] = (stf[a.staffName || "Unassigned"] ?? 0) + 1;
    cat[a.service?.category?.name ?? "Other"] = (cat[a.service?.category?.name ?? "Other"] ?? 0) + a.price;
    day[a.date] = (day[a.date] ?? 0) + a.price;
  }
  const top = (m: Record<string, number>, n = 5) => Object.entries(m).map(([name, value]) => ({ name, value: round2(value) })).sort((a, b) => b.value - a.value).slice(0, n);

  res.json({
    today: { bookings: apptsToday.length, revenue: round2(tC.rev), profit: round2(tC.rev - tC.mat - tC.com - expToday.reduce((s, e) => s + e.amount, 0)) },
    month: { revenue: round2(mC.rev), profit: round2(mC.rev - mC.mat - mC.com - expMonth.reduce((s, e) => s + e.amount, 0)) },
    workingToday, commissionOwed: round2(mC.com), pendingReviews,
    lowStock: { count: low.length, items: low.slice(0, 6).map((p) => ({ name: p.name, quantity: p.quantity, unit: p.unit })) },
    giftCards: { count: giftCards.length, value: round2(giftCards.reduce((s, c) => s + c.initialValue, 0)) },
    bestServices: top(svc), mostBookedStaff: top(stf),
    charts: {
      revenueByDay: Object.entries(day).map(([date, value]) => ({ date, value: round2(value) })).sort((a, b) => (a.date < b.date ? -1 : 1)),
      revenueByCategory: top(cat, 8), bookingsByStaff: top(stf, 8),
      profitByMonth: months.map((m) => ({ name: m, value: profit(appts6.filter((x) => x.date.slice(0, 7) === m), exp6.filter((x) => x.date.slice(0, 7) === m)) })),
    },
  });
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
  const b = req.body ?? {}; const title = STR(b.title, 120);
  if (!title) return res.status(400).json({ error: "Course title is required." });
  const max = await prisma.course.aggregate({ _max: { sortOrder: true } });
  const c = await prisma.course.create({ data: {
    title, image: STR(b.image, 600), description: STR(b.description, 2000), duration: STR(b.duration, 60),
    price: Math.max(0, NUM(b.price, 0)), includes: JSON.stringify(Array.isArray(b.includes) ? b.includes.map((x: unknown) => STR(x, 120)).filter(Boolean) : []),
    sortOrder: (max._max.sortOrder ?? 0) + 1,
  } });
  res.json(courseOut(c));
});
app.patch("/api/admin/courses/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = STR(b.title, 120);
  if (b.image !== undefined) data.image = STR(b.image, 600);
  if (b.description !== undefined) data.description = STR(b.description, 2000);
  if (b.duration !== undefined) data.duration = STR(b.duration, 60);
  if (b.price !== undefined) data.price = Math.max(0, NUM(b.price, 0));
  if (b.includes !== undefined) data.includes = JSON.stringify(Array.isArray(b.includes) ? b.includes.map((x: unknown) => STR(x, 120)).filter(Boolean) : []);
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  res.json(courseOut(await prisma.course.update({ where: { id: Number(req.params.id) }, data })));
});
app.delete("/api/admin/courses/:id", requireAdmin, async (req, res) => { await prisma.course.delete({ where: { id: Number(req.params.id) } }).catch(() => {}); res.json({ ok: true }); });

// ---- Packages ----
async function packagesWithNames(pkgs: { serviceIds: string }[]) {
  const svc = await prisma.service.findMany({ select: { id: true, name: true } });
  const map = new Map(svc.map((s) => [s.id, s.name]));
  return pkgs.map((p) => { const ids = parseArr(p.serviceIds) as number[]; return { ...p, serviceIds: ids, services: ids.map((id) => map.get(id)).filter(Boolean) }; });
}
app.get("/api/packages", async (_req, res) => res.json(await packagesWithNames(await prisma.package.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }))));
app.get("/api/admin/packages", requireAdmin, async (_req, res) => res.json(await packagesWithNames(await prisma.package.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }))));
app.post("/api/admin/packages", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const title = STR(b.title, 120);
  if (!title) return res.status(400).json({ error: "Package title is required." });
  const max = await prisma.package.aggregate({ _max: { sortOrder: true } });
  const p = await prisma.package.create({ data: {
    title, image: STR(b.image, 600), description: STR(b.description, 2000),
    price: Math.max(0, NUM(b.price, 0)), durationMin: Math.max(5, NUM(b.durationMin, 60)),
    serviceIds: JSON.stringify(Array.isArray(b.serviceIds) ? b.serviceIds.map(Number).filter((n: number) => n > 0) : []),
    sortOrder: (max._max.sortOrder ?? 0) + 1,
  } });
  res.json((await packagesWithNames([p]))[0]);
});
app.patch("/api/admin/packages/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const data: Record<string, unknown> = {};
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
app.delete("/api/admin/packages/:id", requireAdmin, async (req, res) => { await prisma.package.delete({ where: { id: Number(req.params.id) } }).catch(() => {}); res.json({ ok: true }); });

// ---- Loyalty & memberships ----
app.get("/api/loyalty/config", async (_req, res) => { const l = await getSetting("loyalty", LOYALTY_DEFAULT); res.json({ enabled: l.enabled, pointsPerDollar: l.pointsPerDollar, tiers: l.tiers, rewards: l.rewards }); });
app.get("/api/customer/me/loyalty", requireCustomer, async (req, res) => {
  const id = custOf(req);
  const [cust, loy] = await Promise.all([prisma.customer.findUnique({ where: { id } }), getSetting("loyalty", LOYALTY_DEFAULT)]);
  if (!cust) return res.status(404).json({ error: "Not found." });
  const tier = tierFor(cust.lifetimePoints, loy.tiers);
  const next = [...loy.tiers].sort((a, b) => a.minPoints - b.minPoints).find((t) => t.minPoints > cust.lifetimePoints) ?? null;
  const redemptions = await prisma.rewardRedemption.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 20 });
  res.json({
    enabled: loy.enabled, points: cust.points, lifetimePoints: cust.lifetimePoints, pointsPerDollar: loy.pointsPerDollar,
    tier: tier?.name ?? "—", discountPct: tier?.discountPct ?? 0,
    nextTier: next ? { name: next.name, pointsNeeded: next.minPoints - cust.lifetimePoints } : null,
    rewards: loy.rewards.map((r) => ({ ...r, affordable: cust.points >= r.cost })), redemptions,
  });
});
app.post("/api/customer/me/loyalty/redeem", requireCustomer, async (req, res) => {
  const id = custOf(req); const rewardId = Number(req.body?.rewardId);
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
  const b = req.body ?? {}; const cur = await getSetting("loyalty", LOYALTY_DEFAULT);
  const next = {
    enabled: b.enabled !== undefined ? !!b.enabled : cur.enabled,
    pointsPerDollar: b.pointsPerDollar !== undefined ? Math.max(0, NUM(b.pointsPerDollar, cur.pointsPerDollar)) : cur.pointsPerDollar,
    tiers: Array.isArray(b.tiers) ? b.tiers.map((t: Record<string, unknown>) => ({ name: STR(t.name, 30), minPoints: Math.max(0, NUM(t.minPoints, 0)), discountPct: Math.max(0, Math.min(100, NUM(t.discountPct, 0))) })).sort((a: Tier, z: Tier) => a.minPoints - z.minPoints) : cur.tiers,
    rewards: Array.isArray(b.rewards) ? b.rewards.map((r: Record<string, unknown>, i: number) => ({ id: NUM(r.id, i + 1), name: STR(r.name, 80), cost: Math.max(1, NUM(r.cost, 1)), description: STR(r.description, 200) })) : cur.rewards,
  };
  await setSetting("loyalty", next); res.json(next);
});
app.get("/api/admin/redemptions", requireAdmin, async (_req, res) => res.json(await prisma.rewardRedemption.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { customer: { select: { name: true, phone: true } } } })));
app.patch("/api/admin/redemptions/:id", requireAdmin, async (req, res) => res.json(await prisma.rewardRedemption.update({ where: { id: String(req.params.id) }, data: { status: STR(req.body?.status, 10).toUpperCase() === "USED" ? "USED" : "ISSUED" } })));

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
      await prisma.stockMovement.create({ data: { productId: r.productId, type: "USE", quantity: -r.quantity, note: `${appt.serviceName} · appt #${appt.id}` } });
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
      await prisma.customer.update({ where: { id: appt.customerId }, data: { points: { increment: pts }, lifetimePoints: { increment: pts } } }).catch(() => {});
      data.pointsAwarded = true;
    } else if (pts > 0 && status !== "COMPLETED" && appt.pointsAwarded) {
      await prisma.customer.update({ where: { id: appt.customerId }, data: { points: { decrement: pts }, lifetimePoints: { decrement: pts } } }).catch(() => {});
      data.pointsAwarded = false;
    }
  }
  return prisma.appointment.update({ where: { id }, data });
}

app.get("/api/admin/products", requireAdmin, async (_req, res) => res.json(await prisma.product.findMany({ orderBy: [{ name: "asc" }] })));
app.post("/api/admin/products", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const name = STR(b.name, 120);
  if (!name) return res.status(400).json({ error: "Product name is required." });
  const p = await prisma.product.create({ data: {
    name, brand: STR(b.brand, 80), category: STR(b.category, 60), supplier: STR(b.supplier, 80), barcode: STR(b.barcode, 60),
    unit: STR(b.unit, 20) || "unit", costPrice: Math.max(0, NUM(b.costPrice, 0)), sellingPrice: Math.max(0, NUM(b.sellingPrice, 0)),
    quantity: Math.max(0, NUM(b.quantity, 0)), minQuantity: Math.max(0, NUM(b.minQuantity, 0)),
    expiryDate: isDate(STR(b.expiryDate)) ? STR(b.expiryDate) : "", location: STR(b.location, 80),
  } });
  if (p.quantity > 0) await prisma.stockMovement.create({ data: { productId: p.id, type: "RECEIVE", quantity: p.quantity, note: "Initial stock" } });
  res.json(p);
});
app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const data: Record<string, unknown> = {};
  for (const f of ["name", "brand", "category", "supplier", "barcode", "unit", "location"]) if (b[f] !== undefined) data[f] = STR(b[f], f === "name" ? 120 : 80);
  if (b.costPrice !== undefined) data.costPrice = Math.max(0, NUM(b.costPrice, 0));
  if (b.sellingPrice !== undefined) data.sellingPrice = Math.max(0, NUM(b.sellingPrice, 0));
  if (b.minQuantity !== undefined) data.minQuantity = Math.max(0, NUM(b.minQuantity, 0));
  if (b.expiryDate !== undefined) data.expiryDate = isDate(STR(b.expiryDate)) ? STR(b.expiryDate) : "";
  if (b.isActive !== undefined) data.isActive = !!b.isActive;
  const p = await prisma.product.update({ where: { id: Number(req.params.id) }, data });
  if (b.costPrice !== undefined) { // material costs of services using this product need updating
    const svc = await prisma.serviceProduct.findMany({ where: { productId: p.id }, select: { serviceId: true } });
    for (const sid of [...new Set(svc.map((x) => x.serviceId))]) await recomputeMaterialCost(sid);
  }
  res.json(p);
});
app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => { await prisma.product.delete({ where: { id: Number(req.params.id) } }).catch(() => {}); res.json({ ok: true }); });

// Receive (+), use (−), or adjust (set absolute) stock; logs a movement.
app.post("/api/admin/products/:id/stock", requireAdmin, async (req, res) => {
  const id = Number(req.params.id); const b = req.body ?? {};
  const type = STR(b.type, 10).toUpperCase(); const qty = NUM(b.quantity, 0); const note = STR(b.note, 200);
  const p = await prisma.product.findUnique({ where: { id } }); if (!p) return res.status(404).json({ error: "Not found." });
  let newQty = p.quantity, delta = 0;
  if (type === "RECEIVE") { delta = Math.abs(qty); newQty = p.quantity + delta; }
  else if (type === "USE") { delta = -Math.abs(qty); newQty = Math.max(0, p.quantity - Math.abs(qty)); }
  else if (type === "ADJUST") { newQty = Math.max(0, qty); delta = round2(newQty - p.quantity); }
  else return res.status(400).json({ error: "Invalid movement type." });
  await prisma.product.update({ where: { id }, data: { quantity: newQty } });
  await prisma.stockMovement.create({ data: { productId: id, type, quantity: delta, note } });
  res.json(await prisma.product.findUnique({ where: { id } }));
});
app.get("/api/admin/movements", requireAdmin, async (req, res) => {
  const productId = Number(req.query.productId);
  res.json(await prisma.stockMovement.findMany({ where: productId ? { productId } : {}, orderBy: { id: "desc" }, take: 200, include: { product: { select: { name: true, unit: true } } } }));
});
app.get("/api/admin/inventory/summary", requireAdmin, async (_req, res) => {
  const products = await prisma.product.findMany({ where: { isActive: true } });
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const usage = await prisma.stockMovement.aggregate({ _sum: { quantity: true }, where: { type: "USE", createdAt: { gte: start } } });
  const todayStr = new Date().toISOString().slice(0, 10);
  const soonDate = new Date(); soonDate.setDate(soonDate.getDate() + 30); const soonStr = soonDate.toISOString().slice(0, 10);
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
  res.json(await prisma.serviceProduct.findMany({ where: { serviceId: Number(req.params.id) }, include: { product: { select: { name: true, unit: true, costPrice: true } } } }));
});
app.put("/api/admin/services/:id/recipe", requireAdmin, async (req, res) => {
  const serviceId = Number(req.params.id);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await prisma.serviceProduct.deleteMany({ where: { serviceId } });
  for (const it of items) {
    const productId = Number(it?.productId), quantity = Math.max(0, NUM(it?.quantity, 0));
    if (productId && quantity > 0) await prisma.serviceProduct.create({ data: { serviceId, productId, quantity } }).catch(() => {});
  }
  const materialCost = await recomputeMaterialCost(serviceId);
  res.json({ ok: true, materialCost });
});

// Customer list with spend/visit aggregates (for the customers report).
app.get("/api/admin/customers", requireAdmin, async (_req, res) => {
  const customers = await prisma.customer.findMany({ orderBy: { createdAt: "desc" }, include: { appointments: { select: { price: true, status: true, date: true } } } });
  res.json(customers.map((c) => {
    const done = c.appointments.filter((a) => a.status !== "CANCELLED");
    return { id: c.id, name: c.name, email: c.email, phone: c.phone, createdAt: c.createdAt, visits: done.length, spent: round2(done.reduce((s, a) => s + a.price, 0)), lastVisit: done.map((a) => a.date).sort().pop() ?? "" };
  }));
});

// ---- Staff payouts ----
// Computed earnings per staff for a period (from COMPLETED appointments' snapshots).
app.get("/api/admin/payouts", requireAdmin, async (req, res) => {
  const from = STR(req.query.from), to = STR(req.query.to);
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: "from and to (YYYY-MM-DD) are required." });
  const staff = await prisma.staff.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const appts = await prisma.appointment.findMany({ where: { date: { gte: from, lte: to }, status: "COMPLETED", staffId: { not: null } } });
  const map: Record<number, { appointments: number; revenue: number; commission: number }> = {};
  for (const a of appts) { const k = a.staffId as number; if (!map[k]) map[k] = { appointments: 0, revenue: 0, commission: 0 }; map[k].appointments++; map[k].revenue += a.price; map[k].commission += a.commissionAmount; }
  res.json(staff.map((s) => ({
    staffId: s.id, name: s.name, role: s.role, commissionPct: s.commissionPct,
    appointments: map[s.id]?.appointments ?? 0, revenue: round2(map[s.id]?.revenue ?? 0), commissionEarned: round2(map[s.id]?.commission ?? 0),
  })));
});
// Record a payout (recomputes money server-side; client only supplies bonus/tips/deduction).
app.post("/api/admin/payouts", requireAdmin, async (req, res) => {
  const b = req.body ?? {}; const staffId = Number(b.staffId); const from = STR(b.from), to = STR(b.to);
  if (!staffId || !isDate(from) || !isDate(to)) return res.status(400).json({ error: "staffId, from and to are required." });
  const appts = await prisma.appointment.findMany({ where: { staffId, date: { gte: from, lte: to }, status: "COMPLETED" } });
  const revenue = round2(appts.reduce((s, a) => s + a.price, 0));
  const commissionEarned = round2(appts.reduce((s, a) => s + a.commissionAmount, 0));
  const bonus = Math.max(0, NUM(b.bonus, 0)), tips = Math.max(0, NUM(b.tips, 0)), deduction = Math.max(0, NUM(b.deduction, 0));
  const total = round2(commissionEarned + bonus + tips - deduction);
  res.json(await prisma.payout.create({ data: { staffId, periodFrom: from, periodTo: to, appointments: appts.length, revenue, commissionEarned, bonus, tips, deduction, total, note: STR(b.note, 300) } }));
});
app.get("/api/admin/payouts/history", requireAdmin, async (req, res) => {
  const staffId = Number(req.query.staffId);
  res.json(await prisma.payout.findMany({ where: staffId ? { staffId } : {}, orderBy: { id: "desc" }, take: 200, include: { staff: { select: { name: true } } } }));
});
app.delete("/api/admin/payouts/:id", requireAdmin, async (req, res) => { await prisma.payout.delete({ where: { id: Number(req.params.id) } }).catch(() => {}); res.json({ ok: true }); });

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
