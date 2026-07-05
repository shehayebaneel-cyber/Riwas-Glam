import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

type Cat = { name: string; services: { name: string; price: number; durationMin: number; description: string }[] };
const catalog: Cat[] = JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url), "utf8"));

const EMOJI: Record<string, string> = { Makeup: "💄", Lashes: "👁️", Nails: "💅", Aesthetics: "💉", "Brows & Face": "✨", Skincare: "🧖", Tattoos: "🖋️" };

// Default weekly schedule (0=Sun..6=Sat). Editable per staff in the admin.
const week = () => [
  { off: false, open: "11:00", close: "18:00", breakStart: "", breakEnd: "" },
  { off: true, open: "", close: "", breakStart: "", breakEnd: "" },
  { off: false, open: "10:00", close: "19:00", breakStart: "", breakEnd: "" },
  { off: false, open: "10:00", close: "19:00", breakStart: "", breakEnd: "" },
  { off: false, open: "10:00", close: "19:00", breakStart: "", breakEnd: "" },
  { off: false, open: "10:00", close: "20:00", breakStart: "", breakEnd: "" },
  { off: false, open: "10:00", close: "20:00", breakStart: "", breakEnd: "" },
];

// Each specialist and the service categories they perform (editable in admin).
const STAFF = [
  { name: "Riwa", role: "Owner & Makeup Artist", commissionPct: 0, cats: ["Makeup", "Lashes", "Brows & Face"] },
  { name: "Sana", role: "Lash & Brow Specialist", commissionPct: 40, cats: ["Lashes", "Brows & Face", "Skincare"] },
  { name: "Aura", role: "Aesthetician", commissionPct: 40, cats: ["Aesthetics", "Skincare"] },
  { name: "Nail Artist", role: "Nail Specialist", commissionPct: 40, cats: ["Nails"] },
];

async function main() {
  await prisma.appointment.deleteMany();
  await prisma.addOn.deleteMany();
  await prisma.service.deleteMany();
  await prisma.category.deleteMany();
  await prisma.staff.deleteMany();

  const svcByCat = new Map<string, number[]>();
  let svcCount = 0;
  for (const [ci, c] of catalog.entries()) {
    const cat = await prisma.category.create({ data: { name: c.name, emoji: EMOJI[c.name] ?? "🌸", sortOrder: ci } });
    const ids: number[] = [];
    for (const [si, s] of c.services.entries()) {
      const svc = await prisma.service.create({ data: { categoryId: cat.id, name: s.name, description: s.description, durationMin: s.durationMin, price: s.price, sortOrder: si } });
      ids.push(svc.id); svcCount++;
    }
    svcByCat.set(c.name, ids);
  }

  const pass = await bcrypt.hash("staff123", 10); // default demo password — change in admin
  for (const [i, s] of STAFF.entries()) {
    const serviceIds = s.cats.flatMap((c) => svcByCat.get(c) ?? []);
    const login = s.name.toLowerCase().split(" ")[0]; // "riwa", "sana", "aura", "nail"
    await prisma.staff.create({
      data: {
        name: s.name, role: s.role, commissionPct: s.commissionPct, sortOrder: i,
        schedule: JSON.stringify(week()), blockedDates: "[]",
        loginEmail: login, passwordHash: pass,
        services: { connect: serviceIds.map((id) => ({ id })) },
      },
    });
  }

  // Sample testimonials (approved) — Riwa can replace these with real ones.
  const REVIEWS = [
    { authorName: "Maya K.", rating: 5, comment: "Riwa did my bridal makeup and I felt like a princess — flawless and long-lasting!", featured: true },
    { authorName: "Lara S.", rating: 5, comment: "Best lash extensions in Aley. So natural and full. Highly recommend!", featured: true },
    { authorName: "Nour A.", rating: 5, comment: "Love my nails every single time. The team is so talented and welcoming.", featured: false },
    { authorName: "Rita M.", rating: 5, comment: "Clean, professional and beautiful results. My go-to salon now.", featured: false },
  ];
  for (const r of REVIEWS) await prisma.review.create({ data: { ...r, status: "APPROVED" } });

  console.log(`Seeded ${catalog.length} categories, ${svcCount} services, ${STAFF.length} staff, and ${REVIEWS.length} sample reviews.`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
