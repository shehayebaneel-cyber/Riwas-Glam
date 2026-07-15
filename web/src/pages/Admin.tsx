import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SITE } from "../config";
import { api } from "../lib/api";
import { todayIso } from "../lib/time";
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
import { GalleryAdmin } from "../components/GalleryAdmin";
import { NotificationsAdmin } from "../components/NotificationsAdmin";
import { BranchesAdmin } from "../components/BranchesAdmin";
import { NewBookingModal } from "../components/NewBookingModal";
import { GiftCardPayModal } from "../components/GiftCardPayModal";
import { PaymentsAdmin } from "../components/PaymentsAdmin";
import { AlertsBell } from "../components/AlertsBell";
import { MessagesButton } from "../components/MessagesButton";
import { EmergencyControl } from "../components/EmergencyControl";
import { ActivityAdmin } from "../components/ActivityAdmin";
import { DayCloseAdmin } from "../components/DayCloseAdmin";
import { GlobalSearch } from "../components/GlobalSearch";
import { SuppliersAdmin } from "../components/SuppliersAdmin";
import { StaffGoalsAdmin } from "../components/StaffGoalsAdmin";
import { MarketingDashboard } from "../components/MarketingDashboard";
import { WebAnalytics } from "../components/WebAnalytics";
import { BranchAnalytics } from "../components/BranchAnalytics";
import { DurationInsights } from "../components/DurationInsights";
import { WhatsAppBroadcast } from "../components/WhatsAppBroadcast";
import { waLink, waMessages } from "../lib/whatsapp";
import type { Appointment } from "../types";

const KEY = "riwa-admin-key";
const BADGE: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/15 text-emerald-600",
  COMPLETED: "bg-brand-soft text-brand-dark",
  CANCELLED: "bg-red-500/15 text-red-500",
  NO_SHOW: "bg-amber-400/15 text-amber-600",
};

type Tab = "home" | "bookings" | "payments" | "customers" | "calendar" | "services" | "staff" | "giftcards" | "reviews" | "reports" | "website" | "finances" | "inventory" | "payouts" | "academy" | "packages" | "loyalty" | "waitlist" | "marketing" | "gallery" | "notifications" | "branches" | "activity" | "dayclose" | "suppliers" | "goals";
// Sidebar navigation, grouped like a real business console. Each tuple is [tab, label, icon].
// Every tab lives in exactly one group so nothing is ever lost as features grow.
const NAV: { group: string; items: [Tab, string, string][] }[] = [
  { group: "Daily", items: [["home", "Home", "🏠"], ["bookings", "Bookings", "📅"], ["calendar", "Calendar", "🗓️"], ["waitlist", "Waitlist", "⏳"]] },
  { group: "Business", items: [["payments", "Payments", "💳"], ["finances", "Finances", "📊"], ["dayclose", "Day close", "🔐"], ["payouts", "Payouts", "💸"], ["reports", "Reports", "📈"]] },
  { group: "Management", items: [["services", "Services", "✨"], ["packages", "Packages", "🎁"], ["staff", "Team", "👥"], ["goals", "Goals", "🎯"], ["customers", "Customers", "🙋"], ["inventory", "Inventory", "📦"], ["suppliers", "Suppliers", "🚚"]] },
  { group: "Growth", items: [["loyalty", "Loyalty", "💖"], ["marketing", "Marketing", "📣"], ["giftcards", "Gift cards", "🎀"], ["reviews", "Reviews", "⭐"], ["notifications", "Notifications", "🔔"]] },
  { group: "Website", items: [["website", "Website", "🌐"], ["gallery", "Gallery", "🖼️"], ["academy", "Academy", "🎓"], ["branches", "Branches", "🏬"], ["activity", "Activity", "📝"]] },
];
const NAV_ITEMS: [Tab, string][] = NAV.flatMap((g) => g.items.map(([t, l]) => [t, l] as [Tab, string]));
const TAB_LABEL: Record<string, string> = Object.fromEntries(NAV_ITEMS);
const TAB_PERM: Record<Tab, string> = { home: "finances", bookings: "bookings", payments: "bookings", customers: "bookings", waitlist: "waitlist", calendar: "calendar", finances: "finances", dayclose: "finances", inventory: "inventory", suppliers: "inventory", payouts: "payouts", services: "services", staff: "team", goals: "team", academy: "academy", packages: "packages", loyalty: "loyalty", marketing: "marketing", gallery: "website", notifications: "notifications", branches: "branches", website: "website", giftcards: "giftcards", reviews: "reviews", reports: "reports", activity: "activity" };

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
  const [date, setDate] = useState(todayIso());
  const [items, setItems] = useState<Appointment[]>([]);
  const [newBooking, setNewBooking] = useState(false);
  const [giftPayFor, setGiftPayFor] = useState<Appointment | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navigate = useNavigate();

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

  const visible = NAV_ITEMS.filter(([t]) => perms.includes(TAB_PERM[t]));
  useEffect(() => { if (authed && visible.length && !perms.includes(TAB_PERM[tab])) setTab(visible[0][0]); /* eslint-disable-next-line */ }, [authed, perms.join()]);

  const load = () => { if (authed && perms.includes("bookings")) api.get<Appointment[]>(`/api/admin/appointments?date=${date}`, { "x-admin-key": key }).then(setItems).catch(() => {}); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [authed, date]);

  async function loginOwner(e: FormEvent) { e.preventDefault(); setErr(""); const ok = await applyCred(pw); if (!ok && !err) setErr("Wrong password."); }
  async function loginStaff(e: FormEvent) {
    e.preventDefault(); setErr("");
    try {
      const r = await api.post<{ token: string }>("/api/staff/login", { email, password: pw });
      const ok = await applyCred(r.token);
      // Valid staff, but no management access → send them to their own schedule instead of a dead-end.
      if (!ok) { setErr(""); localStorage.setItem("staff-token", r.token); navigate("/staff"); }
    }
    catch { setErr("Wrong email or password."); }
  }
  async function setStatus(a: Appointment, status: string) {
    await api.patch(`/api/admin/appointments/${a.id}`, { status }, { "x-admin-key": key }); load();
  }
  async function markPaid(a: Appointment) {
    if (!a.paymentId) return;
    await api.post(`/api/admin/payments/${a.paymentId}/mark-paid`, {}, { "x-admin-key": key }).catch((e) => alert(e instanceof Error ? e.message : "Couldn't mark paid.")); load();
  }
  async function setActual(a: Appointment, minutes: number) {
    await api.patch(`/api/admin/appointments/${a.id}`, { actualMinutes: minutes }, { "x-admin-key": key }).catch(() => {}); load();
  }
  function logout() { localStorage.removeItem(KEY); setKey(""); setAuthed(false); setPerms([]); }
  async function downloadBackup() {
    try {
      const data = await api.get<unknown>("/api/admin/export", { "x-admin-key": key });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `riwasglam-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Couldn't export data."); }
  }

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
  const pick = (t: Tab) => { setTab(t); setDrawerOpen(false); };
  const searchGo = (t: string) => { if (perms.includes(TAB_PERM[t as Tab] ?? "zzz")) pick(t as Tab); };
  return (
    <div className="min-h-screen bg-surface-2/30 lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-e border-border lg:block">
        <AdminSidebar perms={perms} tab={tab} onPick={pick} adminKey={key} me={me} onLogout={logout} onSearch={searchGo} />
      </aside>

      {/* Mobile / tablet slide-out drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? "" : "pointer-events-none"}`}>
        <div onClick={() => setDrawerOpen(false)} className={`absolute inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-300 ${drawerOpen ? "opacity-100" : "opacity-0"}`} />
        <aside className={`absolute inset-y-0 start-0 w-72 max-w-[85%] border-e border-border shadow-2xl transition-transform duration-300 ease-out ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <AdminSidebar perms={perms} tab={tab} onPick={pick} adminKey={key} me={me} onLogout={logout} onSearch={searchGo} />
        </aside>
      </div>

      {/* Main column */}
      <main className="min-w-0 flex-1">
        {/* Top app bar (hamburger on mobile, page title, quick actions) */}
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/85 px-4 py-3 backdrop-blur-md">
          <button onClick={() => setDrawerOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl text-xl text-ink transition active:scale-95 hover:bg-surface-2 lg:hidden" aria-label="Open menu">☰</button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-extrabold text-ink sm:text-xl">{TAB_LABEL[tab] ?? SITE.name}</h1>
            <p className="hidden truncate text-xs text-muted sm:block">{me.name}{me.role && me.role !== "OWNER" ? ` · ${me.role.charAt(0) + me.role.slice(1).toLowerCase()}` : " · Manager dashboard"}</p>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <MessagesButton adminKey={key} />
            <AlertsBell adminKey={key} onGo={searchGo} />
          </div>
        </div>

        <div className={`mx-auto px-4 py-6 sm:px-6 ${tab === "calendar" ? "max-w-none" : "max-w-3xl"}`}>
      {tab === "home" && perms.includes("website") && <div className="mb-4"><EmergencyControl adminKey={key} /></div>}
      {tab === "home" && me.role === "OWNER" && (
        <div className="mb-4 rounded-2xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm font-bold text-ink">Data backup</p><p className="text-xs text-muted">Your database is continuously backed up by the host. Download a manual JSON copy anytime.</p></div>
            <button onClick={downloadBackup} className="btn btn-ghost shrink-0 px-4 py-2 text-sm">Download</button>
          </div>
        </div>
      )}

      {tab === "home" && <div className="mt-5"><DashboardHome adminKey={key} go={setTab as (t: string) => void} /></div>}
      {tab === "services" && <div className="mt-5"><CatalogAdmin adminKey={key} /></div>}
      {tab === "calendar" && <div className="mt-5"><DurationInsights adminKey={key} /><CalendarAdmin adminKey={key} /></div>}
      {tab === "staff" && <div className="mt-5"><StaffAdmin adminKey={key} /></div>}
      {tab === "website" && <div className="mt-5"><SiteContentAdmin adminKey={key} /></div>}
      {tab === "finances" && <div className="mt-5"><FinancesAdmin adminKey={key} /></div>}
      {tab === "inventory" && <div className="mt-5"><InventoryAdmin adminKey={key} /></div>}
      {tab === "payouts" && <div className="mt-5"><PayoutsAdmin adminKey={key} /></div>}
      {tab === "academy" && <div className="mt-5"><AcademyAdmin adminKey={key} /></div>}
      {tab === "packages" && <div className="mt-5"><PackagesAdmin adminKey={key} /></div>}
      {tab === "loyalty" && <div className="mt-5"><LoyaltyAdmin adminKey={key} /></div>}
      {tab === "marketing" && <div className="mt-5 space-y-5"><WhatsAppBroadcast adminKey={key} /><MarketingDashboard adminKey={key} /><WebAnalytics adminKey={key} /><PromoAdmin adminKey={key} /></div>}
      {tab === "gallery" && <div className="mt-5"><GalleryAdmin adminKey={key} /></div>}
      {tab === "notifications" && <div className="mt-5"><NotificationsAdmin adminKey={key} /></div>}
      {tab === "branches" && <div className="mt-5"><BranchAnalytics adminKey={key} /><BranchesAdmin adminKey={key} /></div>}
      {tab === "waitlist" && <div className="mt-5"><WaitlistAdmin adminKey={key} /></div>}
      {tab === "customers" && <div className="mt-5"><CustomersAdmin adminKey={key} /></div>}
      {tab === "giftcards" && <div className="mt-5"><GiftCardsAdmin adminKey={key} /></div>}
      {tab === "payments" && <div className="mt-5"><PaymentsAdmin adminKey={key} /></div>}
      {tab === "reviews" && <div className="mt-5"><ReviewsAdmin adminKey={key} /></div>}
      {tab === "reports" && <div className="mt-5"><ReportsCenter adminKey={key} /></div>}
      {tab === "activity" && <div className="mt-5"><ActivityAdmin adminKey={key} /></div>}
      {tab === "dayclose" && <div className="mt-5"><DayCloseAdmin adminKey={key} /></div>}
      {tab === "suppliers" && <div className="mt-5"><SuppliersAdmin adminKey={key} /></div>}
      {tab === "goals" && <div className="mt-5"><StaffGoalsAdmin adminKey={key} /></div>}
      {tab === "bookings" && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => setNewBooking(true)} className="btn btn-primary px-4 py-2 text-sm">+ New booking</button>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setDate((d) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() - 1); return x.toLocaleDateString("en-CA"); })} className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink transition hover:bg-surface-2" aria-label="Previous day">‹</button>
              <button onClick={() => setDate(todayIso())} className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand">Today</button>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input !w-auto !py-2 text-sm" />
              <button onClick={() => setDate((d) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + 1); return x.toLocaleDateString("en-CA"); })} className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink transition hover:bg-surface-2" aria-label="Next day">›</button>
            </div>
          </div>
          {newBooking && <NewBookingModal adminKey={key} onClose={() => setNewBooking(false)} onCreated={() => { setNewBooking(false); load(); }} />}
          {giftPayFor && <GiftCardPayModal adminKey={key} appointment={giftPayFor} onClose={() => setGiftPayFor(null)} onPaid={() => { setGiftPayFor(null); load(); }} />}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Appointments" value={active.length} />
            <Stat label="Completed" value={items.filter((a) => a.status === "COMPLETED").length} />
            <Stat label="Revenue (booked)" value={`$${active.reduce((s, a) => s + a.price, 0)}`} />
          </div>

          <div className="mt-5 space-y-3">
            {items.length === 0 ? (
              <div className="card p-12 text-center text-muted">No appointments on this day.</div>
            ) : (
              items.map((a) => {
                const bar = ({ CONFIRMED: "bg-emerald-400", COMPLETED: "bg-brand", CANCELLED: "bg-red-300", NO_SHOW: "bg-amber-400" } as Record<string, string>)[a.status] ?? "bg-surface-2";
                return (
                  <div key={a.id} className="card flex overflow-hidden !p-0">
                    <div className={`w-1.5 shrink-0 ${bar}`} />
                    <div className="flex w-[70px] shrink-0 flex-col items-center justify-center border-e border-border bg-surface-2/40 px-1 py-3 text-center">
                      <span className="font-display text-lg font-extrabold leading-none text-brand-dark">{a.time}</span>
                      <span className="mt-1 text-[10px] text-muted">{a.durationMin}m</span>
                    </div>
                    <div className="min-w-0 flex-1 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{a.serviceName}</p>
                          {a.staffName && <p className="text-xs text-muted">with {a.staffName}</p>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${BADGE[a.status] ?? "bg-surface-2 text-muted"}`}>{a.status.replace("_", " ").toLowerCase()}</span>
                          {a.paymentStatus && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${a.paymentStatus === "PAID" ? "bg-emerald-500/15 text-emerald-600" : a.paymentStatus === "PENDING" ? "bg-amber-400/15 text-amber-600" : "bg-surface-2 text-muted"}`}>{a.paymentMethod === "WHISH" ? "whish" : a.paymentMethod === "GIFTCARD" ? "🎀 gift" : "cash"} · {a.paymentStatus === "PAID" ? "paid" : a.paymentStatus.toLowerCase()}</span>}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-muted"><span className="font-semibold text-ink">{a.customerName}</span> · <a href={`tel:${a.customerPhone}`} className="text-brand">{a.customerPhone}</a> · ${a.price}</p>
                      {a.note && <p className="mt-0.5 text-xs italic text-muted">“{a.note}”</p>}
                      {a.status === "COMPLETED" && (
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span className="text-muted">Actual time:</span>
                          <input type="number" defaultValue={a.actualMinutes || ""} onBlur={(e) => setActual(a, Number(e.target.value))} placeholder={String(a.durationMin)} className="input !w-20 !py-1 text-xs" />
                          <span className="text-muted">min · sched {a.durationMin}m</span>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {a.customerPhone && (
                          <a href={waLink(a.customerPhone, (a.status === "COMPLETED" ? waMessages.thanks : waMessages.confirmation)({ customerName: a.customerName, serviceName: a.serviceName, date: a.date, time: a.time }))} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366]/12 px-3 py-1.5 text-xs font-bold text-[#128C4A] transition hover:bg-[#25D366]/20">💬 WhatsApp</a>
                        )}
                        {a.paymentStatus === "PENDING" && a.paymentMethod === "CASH" && a.paymentId && (
                          <button onClick={() => markPaid(a)} className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-600 transition hover:bg-emerald-500/25">💵 Mark paid</button>
                        )}
                        {a.paymentStatus !== "PAID" && a.status !== "CANCELLED" && (
                          <button onClick={() => setGiftPayFor(a)} className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand-dark transition hover:bg-brand-soft/70">🎀 Gift card</button>
                        )}
                        {a.status === "CONFIRMED" && (
                          <>
                            <button onClick={() => setStatus(a, "COMPLETED")} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-500/15">Mark done</button>
                            <button onClick={() => setStatus(a, "NO_SHOW")} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-amber-600 transition hover:bg-amber-400/15">No-show</button>
                            <button onClick={() => setStatus(a, "CANCELLED")} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/15">Cancel</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
        </div>
      </main>
    </div>
  );
}

function AdminSidebar({ perms, tab, onPick, adminKey, me, onLogout, onSearch }: {
  perms: string[]; tab: Tab; onPick: (t: Tab) => void; adminKey: string;
  me: { role: string; name: string }; onLogout: () => void; onSearch: (t: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const roleLabel = me.role && me.role !== "OWNER" ? me.role.charAt(0) + me.role.slice(1).toLowerCase() : "Owner";
  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-4">
        {SITE.logo
          ? <img src={SITE.logo} alt={SITE.name} className="h-9 w-auto" />
          : <span className="font-display text-lg font-extrabold text-ink">{SITE.name}</span>}
      </div>
      {/* Search */}
      <div className="px-3 pb-3"><GlobalSearch adminKey={adminKey} onGo={onSearch} /></div>
      {/* Grouped nav */}
      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((grp) => {
          const items = grp.items.filter(([t]) => perms.includes(TAB_PERM[t]));
          if (!items.length) return null;
          const isCollapsed = collapsed[grp.group];
          return (
            <div key={grp.group} className="mb-2">
              <button onClick={() => setCollapsed((c) => ({ ...c, [grp.group]: !c[grp.group] }))}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted/70 transition-colors hover:text-ink">
                <span>{grp.group}</span>
                <span className={`text-xs transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}>›</span>
              </button>
              {!isCollapsed && (
                <div className="mt-0.5 space-y-0.5">
                  {items.map(([t, label, icon]) => {
                    const activeTab = tab === t;
                    return (
                      <button key={t} onClick={() => onPick(t)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all duration-200 ${activeTab ? "bg-brand text-white shadow-[0_6px_16px_-8px_rgba(217,124,154,0.9)]" : "text-ink/70 hover:bg-brand-soft/50 hover:text-brand-dark"}`}>
                        <span className="w-5 shrink-0 text-center text-base leading-none">{icon}</span>
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      {/* User + logout */}
      <div className="border-t border-border/70 p-3">
        <div className="mb-1.5 flex items-center gap-2.5 px-2 py-1">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-dark">{me.name ? me.name.charAt(0).toUpperCase() : "A"}</span>
          <div className="min-w-0"><p className="truncate text-sm font-bold text-ink">{me.name || "Admin"}</p><p className="truncate text-xs text-muted">{roleLabel}</p></div>
        </div>
        <button onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-red-500/10 hover:text-red-500">
          <span className="w-5 shrink-0 text-center">⎋</span> Log out
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="card p-3 text-center"><p className="text-xs text-muted">{label}</p><p className="font-display text-xl font-extrabold text-ink">{value}</p></div>;
}
