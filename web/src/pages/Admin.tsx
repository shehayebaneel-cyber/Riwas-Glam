import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SITE } from "../config";
import { api } from "../lib/api";
import { CatalogAdmin } from "../components/CatalogAdmin";
import { StaffAdmin } from "../components/StaffAdmin";
import { CalendarAdmin } from "../components/CalendarAdmin";
import { ReportsAdmin } from "../components/ReportsAdmin";
import { ReviewsAdmin } from "../components/ReviewsAdmin";
import { GiftCardsAdmin } from "../components/GiftCardsAdmin";
import { SiteContentAdmin } from "../components/SiteContentAdmin";
import { FinancesAdmin } from "../components/FinancesAdmin";
import { InventoryAdmin } from "../components/InventoryAdmin";
import { PayoutsAdmin } from "../components/PayoutsAdmin";
import type { Appointment } from "../types";

const KEY = "riwa-admin-key";
const BADGE: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/15 text-emerald-600",
  COMPLETED: "bg-brand-soft text-brand-dark",
  CANCELLED: "bg-red-500/15 text-red-500",
  NO_SHOW: "bg-amber-400/15 text-amber-600",
};

export function Admin() {
  const [key, setKey] = useState(() => localStorage.getItem(KEY) ?? "");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [items, setItems] = useState<Appointment[]>([]);
  const [tab, setTab] = useState<"bookings" | "calendar" | "services" | "staff" | "giftcards" | "reviews" | "reports" | "website" | "finances" | "inventory" | "payouts">("bookings");

  useEffect(() => {
    if (!key) { setChecking(false); return; }
    api.post("/api/admin/login", { key }).then(() => setAuthed(true)).catch(() => { localStorage.removeItem(KEY); setKey(""); }).finally(() => setChecking(false));
    // eslint-disable-next-line
  }, []);

  const load = () => { if (authed) api.get<Appointment[]>(`/api/admin/appointments?date=${date}`, { "x-admin-key": key }).then(setItems).catch(() => {}); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [authed, date]);

  async function login(e: FormEvent) {
    e.preventDefault(); setErr("");
    try { await api.post("/api/admin/login", { key: pw }); setKey(pw); localStorage.setItem(KEY, pw); setAuthed(true); }
    catch { setErr("Wrong password."); }
  }
  async function setStatus(a: Appointment, status: string) {
    await api.patch(`/api/admin/appointments/${a.id}`, { status }, { "x-admin-key": key }); load();
  }
  function logout() { localStorage.removeItem(KEY); setKey(""); setAuthed(false); }

  if (checking) return <div className="p-16 text-center text-muted">Loading…</div>;

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24">
        <h1 className="text-center font-display text-2xl font-extrabold text-ink">{SITE.name} · Admin</h1>
        <form onSubmit={login} className="card mt-6 space-y-3 p-6">
          <p className="text-sm text-muted">Enter your admin password to view bookings.</p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" className="input" autoFocus />
          {err && <p className="text-sm font-medium text-red-600">{err}</p>}
          <button className="btn btn-primary w-full py-2.5">Sign in</button>
        </form>
        <Link to="/" className="mt-4 block text-center text-sm text-muted hover:text-ink">← Back to site</Link>
      </div>
    );
  }

  const active = items.filter((a) => a.status !== "CANCELLED");
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">{SITE.name}</h1>
          <p className="text-sm text-muted">Manager dashboard</p>
        </div>
        <button onClick={logout} className="btn btn-ghost px-3 py-2 text-sm">Log out</button>
      </div>

      <div className="no-scrollbar mt-4 flex gap-1 overflow-x-auto rounded-full bg-surface-2 p-1">
        {([["bookings", "Bookings"], ["calendar", "Calendar"], ["finances", "Finances"], ["inventory", "Inventory"], ["payouts", "Payouts"], ["services", "Services"], ["staff", "Team"], ["website", "Website"], ["giftcards", "Gift cards"], ["reviews", "Reviews"], ["reports", "Reports"]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold ${tab === t ? "bg-brand text-white" : "text-muted"}`}>{label}</button>
        ))}
      </div>

      {tab === "services" && <div className="mt-5"><CatalogAdmin adminKey={key} /></div>}
      {tab === "calendar" && <div className="mt-5"><CalendarAdmin adminKey={key} /></div>}
      {tab === "staff" && <div className="mt-5"><StaffAdmin adminKey={key} /></div>}
      {tab === "website" && <div className="mt-5"><SiteContentAdmin adminKey={key} /></div>}
      {tab === "finances" && <div className="mt-5"><FinancesAdmin adminKey={key} /></div>}
      {tab === "inventory" && <div className="mt-5"><InventoryAdmin adminKey={key} /></div>}
      {tab === "payouts" && <div className="mt-5"><PayoutsAdmin adminKey={key} /></div>}
      {tab === "giftcards" && <div className="mt-5"><GiftCardsAdmin adminKey={key} /></div>}
      {tab === "reviews" && <div className="mt-5"><ReviewsAdmin adminKey={key} /></div>}
      {tab === "reports" && <div className="mt-5"><ReportsAdmin adminKey={key} /></div>}
      {tab === "bookings" && (
        <>
          <div className="mt-4 flex items-center justify-end">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input !w-auto !py-2 text-sm" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Appointments" value={active.length} />
            <Stat label="Completed" value={items.filter((a) => a.status === "COMPLETED").length} />
            <Stat label="Revenue (booked)" value={`$${active.reduce((s, a) => s + a.price, 0)}`} />
          </div>

          <div className="mt-5 space-y-2">
            {items.length === 0 ? (
              <div className="card p-10 text-center text-muted">No appointments on this day.</div>
            ) : (
              items.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-bold text-brand-dark">{a.time}</span>
                <span className="font-semibold text-ink">{a.serviceName}</span>
                {a.staffName && <span className="text-sm text-muted">· {a.staffName}</span>}
                <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold ${BADGE[a.status] ?? "bg-surface-2 text-muted"}`}>{a.status.replace("_", " ").toLowerCase()}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {a.customerName} · <a href={`tel:${a.customerPhone}`} className="text-brand">{a.customerPhone}</a> · ${a.price}
                {a.note ? ` · “${a.note}”` : ""}
              </p>
              {a.status === "CONFIRMED" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => setStatus(a, "COMPLETED")} className="btn btn-ghost px-3 py-1.5 text-xs text-emerald-600">Mark done</button>
                  <button onClick={() => setStatus(a, "NO_SHOW")} className="btn btn-ghost px-3 py-1.5 text-xs text-amber-600">No-show</button>
                  <button onClick={() => setStatus(a, "CANCELLED")} className="btn btn-ghost px-3 py-1.5 text-xs text-red-500">Cancel</button>
                </div>
              )}
            </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="card p-3 text-center"><p className="text-xs text-muted">{label}</p><p className="font-display text-xl font-extrabold text-ink">{value}</p></div>;
}
