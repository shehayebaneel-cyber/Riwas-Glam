# Riwa's Glam

Luxury salon website + booking and management system for **Riwa's Glam**
(Ain Hala Entrance, Aley, Lebanon · [@riwasglam](https://instagram.com/riwasglam)).

Customers browse services, view the gallery, buy gift cards, and book
appointments online. Staff manage their calendars; the owner runs the whole
salon from an admin dashboard.

## Stack

| Part      | Tech                                              | Hosting |
| --------- | ------------------------------------------------- | ------- |
| `web/`    | Vite + React + TypeScript + Tailwind CSS v4       | Vercel  |
| `server/` | Express + Prisma + PostgreSQL, ESM (run via tsx)  | Render  |
| Database  | PostgreSQL                                        | Neon    |

## Local development

```bash
# Backend (http://localhost:4200)
cd server
npm install
cp .env.example .env      # fill in your Neon connection strings
npx prisma db push        # create tables
npm run seed              # load the starter catalog
npm run dev

# Frontend (http://localhost:5300) — in a second terminal
cd web
npm install
npm run dev               # proxies /api -> :4200
```

## Deployment

- **Database** — Neon Postgres. `DATABASE_URL` is the pooled connection;
  `DIRECT_URL` (unpooled) is used by Prisma for `db push` / migrations.
- **Backend** — Render web service from `server/` (see `render.yaml`). Set
  `DATABASE_URL`, `DIRECT_URL`, and `ADMIN_KEY` in the Render dashboard.
- **Frontend** — Vercel from `web/`. Set `VITE_API_URL` to the Render URL.
  SPA routing is handled by `web/vercel.json`.

Payments are mock/manual — gift cards and bookings are recorded, and the owner
settles payment in-salon.
