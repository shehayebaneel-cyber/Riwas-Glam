import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SITE } from "../config";
import { api, durationLabel, money } from "../lib/api";
import { useCustomer } from "../context/CustomerAuth";
import type { Appointment, Customer, FavService } from "../types";

import { ymd, nextDays } from "../lib/time";

const closedOn = (d: Date) => SITE.hours[d.getDay()]?.value === "Closed";
const prettyDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export function Account() {
  const { customer, loading } = useCustomer();
  if (loading) return <div className="p-16 text-center text-muted">Loading…</div>;
  if (!customer) return <AuthPanel />;
  return <Dashboard />;
}

function AuthPanel() {
  const { setSession } = useCustomer();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const path = mode === "login" ? "/api/customer/login" : "/api/customer/register";
      const r = await api.post<{ token: string; customer: Customer }>(path, f);
      setSession(r.token, r.customer);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Something went wrong."); setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-center font-display text-2xl font-extrabold text-ink">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="mt-1 text-center text-sm text-muted">Book faster, manage your appointments and save favourites.</p>
      <form onSubmit={submit} className="card mt-6 space-y-3 p-6">
        {mode === "register" && <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" className="input" required />}
        <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" placeholder="Email" className="input" required />
        {mode === "register" && <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" className="input" />}
        <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} type="password" placeholder="Password" className="input" required />
        {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600">{err}</p>}
        <button disabled={busy} className="btn btn-primary w-full py-2.5 disabled:opacity-60">{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }} className="font-semibold text-brand">{mode === "login" ? "Create an account" : "Log in"}</button>
      </p>
      <Link to="/" className="mt-3 block text-center text-sm text-muted hover:text-ink">← Back to site</Link>
    </div>
  );
}

function Dashboard() {
  const { customer, authHeader, logout } = useCustomer();
  const [tab, setTab] = useState<"bookings" | "rewards" | "favourites" | "profile">("bookings");
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">Hi, {customer!.name} 👋</h1>
          <p className="text-sm text-muted">{customer!.email}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/book" className="btn btn-primary px-4 py-2 text-sm">Book</Link>
          <button onClick={logout} className="btn btn-ghost px-3 py-2 text-sm">Log out</button>
        </div>
      </div>

      <div className="mt-4 flex gap-1 rounded-full bg-surface-2 p-1">
        {([["bookings", "Bookings"], ["rewards", "Rewards"], ["favourites", "Favourites"], ["profile", "Profile"]] as const).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-full py-2 text-sm font-semibold ${tab === t ? "bg-brand text-white" : "text-muted"}`}>{l}</button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "bookings" && <Bookings H={authHeader} />}
        {tab === "rewards" && <Rewards H={authHeader} />}
        {tab === "favourites" && <Favourites H={authHeader} />}
        {tab === "profile" && <Profile H={authHeader} />}
      </div>
    </div>
  );
}

type Loyalty = { enabled: boolean; points: number; lifetimePoints: number; tier: string; discountPct: number; pointsPerDollar: number; nextTier: { name: string; pointsNeeded: number } | null; rewards: { id: number; name: string; cost: number; description: string; affordable: boolean }[]; redemptions: { id: string; rewardName: string; cost: number; status: string; createdAt: string }[] };

function Rewards({ H }: { H: Record<string, string> }) {
  const [d, setD] = useState<Loyalty | null>(null);
  const [msg, setMsg] = useState("");
  const load = () => api.get<Loyalty>("/api/customer/me/loyalty", H).then(setD).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  async function redeem(id: number) {
    setMsg("");
    try { await api.post("/api/customer/me/loyalty/redeem", { rewardId: id }, H); setMsg("🎉 Redeemed! Show this at the salon to claim your reward."); load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't redeem."); }
  }
  if (!d) return <p className="text-center text-muted">Loading…</p>;
  if (!d.enabled) return <div className="card p-6 text-center text-muted">Our rewards program is coming soon 💖</div>;
  const fill = d.nextTier ? Math.round((d.lifetimePoints / (d.lifetimePoints + d.nextTier.pointsNeeded)) * 100) : 100;

  return (
    <div className="space-y-4">
      <div className="rounded-[1.75rem] bg-gradient-to-br from-brand to-brand-dark p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/80">Your tier</p>
            <p className="font-display text-3xl font-extrabold">{d.tier}</p>
            {d.discountPct > 0 && <p className="mt-1 text-sm text-white/90">✨ {d.discountPct}% off every service</p>}
          </div>
          <div className="text-right">
            <p className="text-sm text-white/80">Points</p>
            <p className="font-display text-3xl font-extrabold">{d.points}</p>
          </div>
        </div>
        {d.nextTier && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-white/85"><span>{d.tier}</span><span>{d.nextTier.pointsNeeded} pts to {d.nextTier.name}</span></div>
            <div className="mt-1 h-2 rounded-full bg-white/25"><div className="h-2 rounded-full bg-white" style={{ width: `${fill}%` }} /></div>
          </div>
        )}
        <p className="mt-4 text-xs text-white/75">Earn {d.pointsPerDollar} point{d.pointsPerDollar === 1 ? "" : "s"} per $1 spent on completed visits.</p>
      </div>

      {msg && <p className="rounded-xl bg-brand-soft px-4 py-2 text-center text-sm font-medium text-brand-dark">{msg}</p>}

      <div>
        <p className="mb-2 font-display font-bold text-ink">Rewards</p>
        <div className="space-y-2">
          {d.rewards.map((r) => (
            <div key={r.id} className="card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{r.name}</p>
                <p className="text-xs text-muted">{r.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display font-bold text-brand">{r.cost} pts</p>
                <button onClick={() => redeem(r.id)} disabled={!r.affordable} className="btn btn-primary mt-1 px-3 py-1.5 text-xs disabled:opacity-40">{r.affordable ? "Redeem" : "Locked"}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {d.redemptions.length > 0 && (
        <div>
          <p className="mb-2 font-display font-bold text-ink">Your redemptions</p>
          <div className="card divide-y divide-border p-4">
            {d.redemptions.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
                <span className="text-ink">{r.rewardName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === "USED" ? "bg-surface-2 text-muted" : "bg-emerald-500/15 text-emerald-600"}`}>{r.status === "USED" ? "Used" : "Ready"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Bookings({ H }: { H: Record<string, string> }) {
  const [data, setData] = useState<{ upcoming: Appointment[]; past: Appointment[] } | null>(null);
  const [resched, setResched] = useState<Appointment | null>(null);
  const [reviewFor, setReviewFor] = useState<Appointment | null>(null);
  const load = () => api.get<{ upcoming: Appointment[]; past: Appointment[] }>("/api/customer/me/appointments", H).then(setData).catch(() => setData({ upcoming: [], past: [] }));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  if (!data) return <div className="py-8 text-center text-muted">Loading…</div>;

  async function cancel(a: Appointment) { if (confirm("Cancel this appointment?")) { await api.patch(`/api/customer/me/appointments/${a.id}/cancel`, {}, H).catch((e) => alert(e instanceof Error ? e.message : "Failed")); load(); } }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display font-bold text-ink">Upcoming</h3>
        <div className="mt-2 space-y-2">
          {data.upcoming.length === 0 ? <p className="card p-6 text-center text-sm text-muted">No upcoming appointments. <Link to="/book" className="font-semibold text-brand">Book one →</Link></p> : data.upcoming.map((a) => (
            <div key={a.id} className="card p-4">
              <p className="font-semibold text-ink">{a.serviceName}{a.addOns?.length ? ` + ${a.addOns.map((x) => x.name).join(", ")}` : ""}</p>
              <p className="text-sm text-muted">{prettyDate(a.date)} at {a.time} · {money(a.price)}{a.staffName ? ` · with ${a.staffName}` : ""}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setResched(a)} className="btn btn-ghost px-3 py-1.5 text-xs">Reschedule</button>
                <button onClick={() => cancel(a)} className="btn btn-ghost px-3 py-1.5 text-xs text-red-500">Cancel</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-display font-bold text-ink">History</h3>
        <div className="mt-2 space-y-2">
          {data.past.length === 0 ? <p className="text-sm text-muted">No past appointments yet.</p> : data.past.map((a) => (
            <div key={a.id} className="card p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span><span className="font-semibold text-ink">{a.serviceName}</span> <span className="text-muted">· {prettyDate(a.date)}</span></span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted">{a.status.replace("_", " ").toLowerCase()}</span>
              </div>
              {a.status === "COMPLETED" && <button onClick={() => setReviewFor(a)} className="mt-2 text-xs font-semibold text-brand">★ Leave a review</button>}
            </div>
          ))}
        </div>
      </div>
      {resched && <RescheduleModal appt={resched} H={H} onClose={() => setResched(null)} onDone={() => { setResched(null); load(); }} />}
      {reviewFor && <ReviewModal appt={reviewFor} H={H} onClose={() => setReviewFor(null)} />}
    </div>
  );
}

function RescheduleModal({ appt, H, onClose, onDone }: { appt: Appointment; H: Record<string, string>; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!date) return; setSlots(null);
    api.get<{ slots: string[] }>(`/api/customer/me/appointments/${appt.id}/slots?date=${date}`, H).then((d) => setSlots(d.slots)).catch(() => setSlots([]));
  }, [date, appt.id, H]);
  async function pick(time: string) {
    setBusy(true); setErr("");
    try { await api.patch(`/api/customer/me/appointments/${appt.id}/reschedule`, { date, time }, H); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't reschedule."); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="card w-full max-w-lg rounded-b-none p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-ink">Reschedule {appt.serviceName}</h3>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {nextDays(21).map((d) => { const v = ymd(d); const c = closedOn(d); return (
            <button key={v} disabled={c} onClick={() => setDate(v)} className={`flex shrink-0 flex-col items-center rounded-2xl border px-3 py-2 text-center ${date === v ? "border-brand bg-brand text-white" : c ? "border-border text-muted/40" : "border-border hover:border-brand"}`}>
              <span className="text-[10px] font-semibold uppercase">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className="font-display text-lg font-bold">{d.getDate()}</span>
            </button>); })}
        </div>
        {date && (slots === null ? <p className="mt-4 text-sm text-muted">Loading…</p> : slots.length === 0 ? <p className="mt-4 text-sm text-muted">No times available that day.</p> :
          <div className="mt-4 flex flex-wrap gap-2">{slots.map((t) => <button key={t} disabled={busy} onClick={() => pick(t)} className="chip">{t}</button>)}</div>)}
        {err && <p className="mt-3 text-sm font-medium text-red-600">{err}</p>}
        <button onClick={onClose} className="btn btn-ghost mt-4 w-full py-2 text-sm">Close</button>
      </div>
    </div>
  );
}

function ReviewModal({ appt, H, onClose }: { appt: Appointment; H: Record<string, string>; onClose: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  async function submit() { setBusy(true); setErr(""); try { await api.post("/api/customer/me/reviews", { rating, comment, appointmentId: appt.id }, H); setDone(true); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't submit."); setBusy(false); } }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="card w-full max-w-md rounded-b-none p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center">
            <div className="text-3xl">💖</div>
            <p className="mt-2 font-display text-lg font-bold text-ink">Thank you!</p>
            <p className="mt-1 text-sm text-muted">Your review will appear once approved.</p>
            <button onClick={onClose} className="btn btn-primary mt-4 w-full py-2.5">Close</button>
          </div>
        ) : (
          <>
            <h3 className="font-display text-lg font-bold text-ink">Review {appt.serviceName}</h3>
            <div className="mt-3 flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => <button key={i} onClick={() => setRating(i)} aria-label={`${i} stars`} className={`text-3xl ${i <= rating ? "text-amber-400" : "text-border"}`}>★</button>)}
            </div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Tell us about your experience…" className="input mt-3" />
            {err && <p className="mt-2 text-sm font-medium text-red-600">{err}</p>}
            <button onClick={submit} disabled={busy} className="btn btn-primary mt-3 w-full py-2.5 disabled:opacity-60">{busy ? "Submitting…" : "Submit review"}</button>
            <button onClick={onClose} className="btn btn-ghost mt-2 w-full py-2 text-sm">Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

function Favourites({ H }: { H: Record<string, string> }) {
  const [favs, setFavs] = useState<FavService[] | null>(null);
  const load = () => api.get<FavService[]>("/api/customer/me/favorites", H).then(setFavs).catch(() => setFavs([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  if (!favs) return <div className="py-8 text-center text-muted">Loading…</div>;
  if (favs.length === 0) return <p className="card p-8 text-center text-sm text-muted">No favourites yet. Tap the ♡ on a service when booking to save it here.</p>;
  return (
    <div className="space-y-2">
      {favs.map((s) => (
        <div key={s.id} className="card flex items-center justify-between gap-2 p-3">
          <span><span className="font-semibold text-ink">{s.name}</span> <span className="text-xs text-muted">· {durationLabel(s.durationMin)} · {s.price > 0 ? money(s.price) : "On request"}</span></span>
          <div className="flex gap-2">
            <Link to={`/book?service=${s.id}`} className="btn btn-ghost px-3 py-1.5 text-xs">Book</Link>
            <button onClick={async () => { await api.delete(`/api/customer/me/favorites/${s.id}`, H); load(); }} className="btn btn-ghost px-3 py-1.5 text-xs text-red-500">Remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Profile({ H }: { H: Record<string, string> }) {
  const { customer, setCustomer } = useCustomer();
  const [f, setF] = useState({ name: customer!.name, phone: customer!.phone, email: customer!.email, birthday: "" });
  const [pw, setPw] = useState({ current: "", password: "" });
  const [msg, setMsg] = useState("");
  useEffect(() => { api.get<{ birthday?: string }>("/api/customer/me", H).then((c) => setF((x) => ({ ...x, birthday: c.birthday ?? "" }))).catch(() => {}); /* eslint-disable-next-line */ }, []);
  async function save() { setMsg(""); try { const c = await api.patch<Customer>("/api/customer/me", f, H); setCustomer(c); setMsg("Profile saved."); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed."); } }
  async function changePw() { setMsg(""); try { await api.post("/api/customer/me/password", pw, H); setPw({ current: "", password: "" }); setMsg("Password changed."); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed."); } }
  return (
    <div className="space-y-5">
      <div className="card space-y-3 p-5">
        <p className="font-display font-bold text-ink">Your details</p>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name" className="input" />
        <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" className="input" />
        <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" className="input" />
        <label className="block"><span className="mb-1 block text-xs font-semibold text-muted">Birthday (for a little treat 🎂)</span><input type="date" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} className="input" /></label>
        <button onClick={save} className="btn btn-primary py-2.5">Save</button>
      </div>
      <div className="card space-y-3 p-5">
        <p className="font-display font-bold text-ink">Change password</p>
        <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Current password" className="input" />
        <input type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} placeholder="New password" className="input" />
        <button onClick={changePw} className="btn btn-ghost py-2.5">Update password</button>
      </div>
      {msg && <p className="text-center text-sm font-medium text-brand">{msg}</p>}
    </div>
  );
}
