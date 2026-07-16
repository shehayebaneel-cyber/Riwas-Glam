# Riwa's Glam — CLAUDE.md

## What this is
Single-salon booking + management platform for a friend's beauty salon in
Lebanon (riwasglam.beauty). Customers book services/packages online; the owner
runs the whole salon from /admin (calendar, customers, inventory, payouts,
finances). MOBILE IS PRIMARY — most customers book on phones. Also serves as
the reusable salon template (see Desktop/SALON-TEMPLATE-PLAYBOOK.md).

## Stack & layout
- web/ (Vite + React + Tailwind v4) — port 5300
- server/ (Express + Prisma + Neon Postgres) — port 4200
- Deploy: API on Render (render.yaml, root server/), web on Vercel;
  both auto-deploy on push to main. Domain: riwasglam.beauty
- GitHub: shehayebaneel-cyber/Riwas-Glam

## Commands
- Dev: `cd server && npm run dev` + `cd web && npm run dev`
- Typecheck: `npx tsc --noEmit` (server has ~10 KNOWN pre-existing errors —
  tsx runs anyway; don't "fix" them casually, don't add new ones)
- Format: `npm run format` (root) · Lint: `npm run lint` (oxlint, web)
- DB: `npx prisma db push` — Neon sleeps (P1001 → retry); OneDrive can lock the
  Prisma DLL (EPERM → kill :4200, rm -rf node_modules/.prisma/client, regenerate)

## Brand
- Voice: feminine, warm, premium — pinks/roses, playful serif display
- Salon timezone: Asia/Beirut — ALL slot/date logic uses Beirut wall-clock
- Mobile-first always; the calendar is Fresha-style (staff colors, week view)

## Domain rules (get these right)
- Multi-service visits: appointments booked together share a groupId, run
  back-to-back with ONE specialist and ONE payment; paying/cancelling the
  payment affects the WHOLE group; discounts spread proportionally.
- Payments: unified Payment ledger (kind BOOKING|GIFTCARD, method CASH|WHISH).
  Whish gateway is scaffolded but NOT wired (no credentials yet) — unpaid Whish
  holds auto-release after 20 min. Gift cards pay against the group total.
- Availability honours each staff member's weekly schedule, breaks and blocked
  dates; slots = staff free for the FULL combined duration.
- Loyalty: points per $, tiers (Silver/Gold/VIP) auto-discount at booking.
- Inventory: services have product "recipes" — completing an appointment
  deducts stock once (stockDeducted flag). Commission snapshots on booking.
- FINANCIAL BASELINE: all money records before 2026-07-14 were wiped (go-live).
  Backup: backup-before-july14-reset.json (gitignored — customer data, never commit).

## Current status / next up
- Live and in daily use. Phase 2: 31/35 shipped.
- Pending: Whish API wiring (needs merchant credentials), admin Payments panel,
  deposits (deferred until Whish)
