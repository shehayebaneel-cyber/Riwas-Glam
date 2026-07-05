import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SITE } from "../config";
import { api } from "../lib/api";
import { CatalogAdmin } from "../components/CatalogAdmin";
import { StaffAdmin } from "../components/StaffAdmin";
import { CalendarAdmin } from "../components/CalendarAdmin";
import { ReportsCenter } from "../components/ReportsCenter";
import { ReviewsAdmin } from "../components/ReviewsAdmin";
import { GiftCardsAdmin } from "../components/GiftCardsAdmin";
import { SiteContentAdmin } from "../components/SiteContentAdmin";
import { FinancesAdmin } from "../components/FinancesAdmin";
import { InventoryAdmin } from "../components/InventoryAdmin";
import { PayoutsAdmin } from "../components/PayoutsAdmin";
import { AcademyAdmin } from "../components/AcademyAdmin";
import { DashboardHome } from "../components/DashboardHome";
import { PackagesAdmin } from "../components/PackagesAdmin";
import { LoyaltyAdmin } from "../components/LoyaltyAdmin";
import { WaitlistAdmin } from "../components/WaitlistAdmin";
import { CustomersAdmin } from "../components/CustomersAdmin";
import { PromoAdmin } from "../components/PromoAdmin";
import type { Appointment } from "../types";

const KEY = "riwa-admin-key";
const BADGE: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/15 text-emerald-600",
  COMPLETED: "bg-brand-soft text-brand-dark",
  CANCELLED: "bg-red-500/15 text-red-500",
  NO_SHOW: "bg-amber-400/15 text-amber-600",
};

type Tab = "home" | "bookings" | "customers" | "calendar" | "services" | "staff" | "giftcards" | "reviews" | "reports" | "website" | "finances" | "inventory" | "payouts" | "academy" | "packages" | "loyalty" | "waitlist" | "marketing";
const TABS: [Tab, string][] = [["home", "🏠 Home"], ["bookings", "Bookings"], ["waitlist", "Waitlist"], ["customers", "Customers"], ["calendar", "Calendar"], ["finances", "Finances"], ["inventory", "Inventory"], ["payouts", "Payouts"], ["services", "Services"], ["staff", "Team"], ["academy", "Academy"], ["packages", "Packages"], ["loyalty", "Loyalty"], ["marketing", "Marketing"], ["website", "Website"], ["giftcards", "Gift cards"], ["reviews", "Reviews"], ["reports", "Reports"]];
const TAB_PERM: Record<Tab, string> = { home: "finances", bookings: "bookings", customers: "bookings", waitlist: "waitlist", calendar: "calendar", finances: "finances", inventory: "inventory", payouts: "payouts", services: "services", staff: "team", academy: "academy", packages: "packages", loyalty: "loyalty", marketing: "marketing", website: "website", giftcards: "giftcards", reviews: "reviews", reports: "reports" };

export function Admin() {
  const [key, setKey] = useState(() => localStorage.getItem(KEY) ?? "");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [perms, setPerms] = useState<string[]>([]);
  const [me, setMe] = useState<{ role: string; name: string }>({ role: "", name: "" });
  const [mode, setMode] = useState<"owner" | "staff">("owner");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [items, setItems] = useState<Appointment[]>([]);
  const [tab, setTab] = useState<Tab>("home");

  async function applyCred(cred: string): Promise<boolean> {
    try {
      const m = await api.get<{ role: string; name: string; permissions: string[] }>("/api/admin/me", { "x-admin-key": cred });
      if (!m.permissions?.length) { setErr("This account has no admin access — please use the staff portal."); return false; }
      setKey(cred); localStorage.setItem(KEY, cred); setPerms(m.permissions); setMe({ role: m.role, name: m.name }); setAuthed(true);
      return true;
    } catch { return false; }
  }

  useEffect(() => {
    if (!key) { setChecking(false); return; }
    applyCred(key).then((ok) => { if (!ok) { localStorage.removeItem(KEY); setKey(""); } }).finally(() => setChecking(false));
    // eslint-disable-next-line
  }, []);

  const visible = TABS.filter(([t]) => perms.includes(TAB_PERM[t]));
  useEffect(() => { if (authed && visible.length && !perms.includes(TAB_PERM[tab])) setTab(visible[0][0]); /* eslint-disable-next-line */ }, [authed, perms.join()]);

  const load = () => { if (authed && perms.includes("bookings")) api.get<Appointment[]>(`/api/admin/appointments?date=${date}`, { "x-admin-key": key }).then(setItems).catch(() => {}); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [authed, date]);

  async function loginOwner(e: FormEvent) { e.preventDefault(); setErr(""); const ok = await applyCred(pw); if (!ok && !err) setErr("Wrong password."); }
  async function loginStaff(e: FormEvent) {
    e.preventDefault(); setErr("");
    try { const r = await api.post<{ token: string }>("/api/staff/login", { email, password: pw }); const ok = await applyCred(r.token); if (!ok && !err) setErr("No admin access for this account."); }
    catch { setErr("Wrong email or password."); }
  }
  async function setStatus(a: Appointment, status: string) {
    await api.patch(`/api/admin/appointments/${a.id}`, { status }, { "x-admin-key": key }); load();
  }
  function logout() { localStorage.removeItem(KEY); setKey(""); setAuthed(false); setPerms([]); }

  if (checking) return <div className="p-16 text-center text-muted">Loading…</div>;

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24">
        <h1 className="text-center font-display text-2xl font-extrabold text-ink">{SITE.name} · Admin</h1>
        <div className="mt-6 flex gap-1 rounded-full bg-surface-2 p-1">
          {(["owner", "staff"] as const).map((m) => <button key={m} onClick={() => { setMode(m); setErr(""); }} className={`flex-1 rounded-full py-2 text-sm font-semibold ${mode === m ? "bg-brand text-white" : "text-muted"}`}>{m === "owner" ? "Owner" : "Staff"}</button>)}
        </div>
        <form onSubmit={mode === "owner" ? loginOwner : loginStaff} className="card mt-3 space-y-3 p-6">
          {mode === "owner"
            ? <><p className="text-sm text-muted">Enter the owner admin password.</p><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" className="input" autoFocus /></>
            : <><p className="text-sm text-muted">Staff sign in with your work email.</p><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input" autoFocus /><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" className="input" /></>}
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
          <p className="text-sm text-muted">{me.name}{me.role && me.role !== "OWNER" ? ` · ${me.role.charAt(0) + me.role.slice(1).toLowerCase()}` : " · Manager dashboard"}</p>
        </div>
        <button onClick={logout} className="btn btn-ghost px-3 py-2 text-sm">Log out</button>
      </div>

      <div className="no-scrollbar mt-4 flex gap-1 overflow-x-auto rounded-full bg-surface-2 p-1">
        {visible.map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold ${tab === t ? "bg-brand text-white" : "text-muted"}`}>{label}</button>
        ))}
      </div>

      {tab === "home" && <div className="mt-5"><DashboardHome adminKey={key} go={setTab as (t: string) => void} /></div>}
      {tab === "services" && <div className="mt-5"><CatalogAdmin adminKey={key} /></div>}
      {tab === "calendar" && <div className="mt-5"><CalendarAdmin adminKey={key} /></div>}
      {tab === "staff" && <div className="mt-5"><StaffAdmin adminKey={key} /></div>}
      {tab === "website" && <div className="mt-5"><SiteContentAdmin adminKey={key} /></div>}
      {tab === "finances" && <div className="mt-5"><FinancesAdmin adminKey={key} /></div>}
      {tab === "inventory" && <div className="mt-5"><InventoryAdmin adminKey={key} /></div>}
      {tab === "payouts" && <div className="mt-5"><PayoutsAdmin adminKey={key} /></div>}
      {tab === "academy" && <div className="mt-5"><AcademyAdmin adminKey={key} /></div>}
      {tab === "packages" && <div className="mt-5"><PackagesAdmin adminKey={key} /></div>}
      {tab === "loyalty" && <div className="mt-5"><LoyaltyAdmin adminKey={key} /></div>}
      {tab === "marketing" && <div className="mt-5"><PromoAdmin adminKey={key} /></div>}
      {tab === "waitlist" && <div className="mt-5"><WaitlistAdmin adminKey={key} /></div>}
      {tab === "customers" && <div className="mt-5"><CustomersAdmin adminKey={key} /></div>}
      {tab === "giftcards" && <div className="mt-5"><GiftCardsAdmin adminKey={key} /></div>}
      {tab === "reviews" && <div className="mt-5"><ReviewsAdmin adminKey={key} /></div>}
      {tab === "reports" && <div className="mt-5"><ReportsCenter adminKey={key} /></div>}
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
