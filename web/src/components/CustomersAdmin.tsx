import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ImageUpload } from "./ImageUpload";

type ListItem = { id: number; name: string; email: string; phone: string; birthday: string; visits: number; spent: number; lastVisit: string };
type Profile = {
  id: number; name: string; email: string; phone: string; birthday: string; notes: string; createdAt: string;
  points: number; lifetimePoints: number; tier: string; visits: number; spent: number; noShows: number; cancellations: number; preferredStaff: string;
  favorites: { id: number; name: string }[];
  appointments: { id: number; date: string; time: string; serviceName: string; staffName: string; price: number; status: string }[];
  giftCards: { code: string; initialValue: number; balance: number; status: string }[];
  redemptions: { id: string; rewardName: string; createdAt: string }[];
  photos: { id: string; url: string; label: string }[];
};
const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const STATUS: Record<string, string> = { CONFIRMED: "text-emerald-600", COMPLETED: "text-brand-dark", CANCELLED: "text-red-500", NO_SHOW: "text-amber-600" };

export function CustomersAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [list, setList] = useState<ListItem[]>([]);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => { api.get<ListItem[]>("/api/admin/customers", hdr).then(setList).catch(() => {}); /* eslint-disable-next-line */ }, []);
  const shown = list.filter((c) => `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or email…" className="input" />
      {list.length === 0 && <p className="card p-8 text-center text-muted">No customer accounts yet.</p>}
      {shown.map((c) => (
        <button key={c.id} onClick={() => setOpenId(c.id)} className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-brand">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display font-bold text-brand">{c.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{c.name}</p>
            <p className="truncate text-xs text-muted">{c.phone} · {c.visits} visit{c.visits === 1 ? "" : "s"} · {money(c.spent)}</p>
          </div>
          <span className="text-muted">→</span>
        </button>
      ))}
      {openId !== null && <ProfileModal id={openId} hdr={hdr} adminKey={adminKey} onClose={() => setOpenId(null)} />}
    </div>
  );
}

type TimelineEvent = { at: string; type: string; icon: string; title: string; detail?: string };

function ProfileModal({ id, hdr, adminKey, onClose }: { id: number; hdr: Record<string, string>; adminKey: string; onClose: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [notes, setNotes] = useState("");
  const [birthday, setBirthday] = useState("");
  const [saved, setSaved] = useState(false);
  const [view, setView] = useState<"profile" | "timeline">("profile");
  const load = () => api.get<Profile>(`/api/admin/customers/${id}`, hdr).then((d) => { setP(d); setNotes(d.notes); setBirthday(d.birthday); }).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function saveInfo() { await api.patch(`/api/admin/customers/${id}`, { notes, birthday }, hdr); setSaved(true); setTimeout(() => setSaved(false), 1500); }
  async function addPhoto(url: string) { if (!url) return; await api.post(`/api/admin/customers/${id}/photos`, { url }, hdr); load(); }
  async function delPhoto(pid: string) { await api.delete(`/api/admin/customers/${id}/photos/${pid}`, hdr); load(); }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-t-[1.5rem] bg-surface p-5 shadow-2xl sm:my-4 sm:rounded-[1.5rem]" onClick={(e) => e.stopPropagation()}>
        {!p ? <p className="py-10 text-center text-muted">Loading…</p> : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold text-ink">{p.name}</h2>
                <p className="text-sm text-muted"><a href={`tel:${p.phone}`} className="text-brand">{p.phone}</a> · {p.email}</p>
                <p className="mt-1 text-xs text-muted">Member since {new Date(p.createdAt).toLocaleDateString()} · <span className="font-semibold text-brand">{p.tier}</span> · {p.points} pts</p>
              </div>
              <button onClick={onClose} className="text-2xl text-muted">✕</button>
            </div>

            <div className="mt-3 flex gap-1 rounded-full bg-surface-2 p-1">
              {(["profile", "timeline"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`flex-1 rounded-full py-1.5 text-xs font-semibold ${view === v ? "bg-brand text-white" : "text-muted"}`}>{v === "profile" ? "Profile" : "Timeline"}</button>
              ))}
            </div>

            {view === "timeline" && <Timeline id={id} hdr={hdr} />}
            {view === "profile" && <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Mini label="Visits" value={String(p.visits)} />
              <Mini label="Total spent" value={money(p.spent)} />
              <Mini label="No-shows" value={String(p.noShows)} />
              <Mini label="Cancelled" value={String(p.cancellations)} />
            </div>
            <p className="mt-3 text-sm text-muted">Preferred specialist: <b className="text-ink">{p.preferredStaff}</b>{p.favorites.length > 0 && <> · Favourites: {p.favorites.map((f) => f.name).join(", ")}</>}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-xs font-semibold text-ink">Birthday</span><input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="input !py-2 text-sm" /></label>
              <div className="flex items-end"><button onClick={saveInfo} className="btn btn-primary w-full py-2">Save {saved && "✓"}</button></div>
            </div>
            <label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-ink">Private notes</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, preferences, anything to remember…" className="input text-sm" /></label>

            {/* Before/after photos */}
            <p className="mt-4 text-sm font-bold text-ink">Photos</p>
            <div className="mt-1"><ImageUpload value="" onChange={addPhoto} adminKey={adminKey} /></div>
            {p.photos.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {p.photos.map((ph) => (
                  <div key={ph.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
                    <img src={ph.url} alt="" className="h-full w-full object-cover" />
                    <button onClick={() => delPhoto(ph.id)} className="absolute right-1 top-1 rounded-full bg-black/50 px-1.5 text-xs text-white opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Gift cards */}
            {p.giftCards.length > 0 && (
              <><p className="mt-4 text-sm font-bold text-ink">Gift cards</p>
                <div className="mt-1 space-y-1 text-sm">{p.giftCards.map((g) => <div key={g.code} className="flex justify-between"><span className="text-muted">{g.code}</span><span className="text-ink">{money(g.balance)} / {money(g.initialValue)} · {g.status}</span></div>)}</div></>
            )}

            {/* Appointment history */}
            <p className="mt-4 text-sm font-bold text-ink">Appointment history</p>
            <div className="mt-1 max-h-64 space-y-1 overflow-y-auto">
              {p.appointments.length === 0 ? <p className="text-sm text-muted">No appointments yet.</p> : p.appointments.map((a) => (
                <div key={a.id} className="flex items-center justify-between border-b border-border py-1.5 text-sm last:border-0">
                  <span className="text-ink">{a.date} {a.time} · {a.serviceName}{a.staffName ? ` · ${a.staffName}` : ""}</span>
                  <span className={`shrink-0 font-semibold ${STATUS[a.status] ?? "text-muted"}`}>{money(a.price)}</span>
                </div>
              ))}
            </div>
            </>}
          </>
        )}
      </div>
    </div>
  );
}

function Timeline({ id, hdr }: { id: number; hdr: Record<string, string> }) {
  const [data, setData] = useState<{ notes: string; events: TimelineEvent[] } | null>(null);
  useEffect(() => { api.get<{ notes: string; events: TimelineEvent[] }>(`/api/admin/customers/${id}/timeline`, hdr).then(setData).catch(() => {}); /* eslint-disable-next-line */ }, [id]);
  if (!data) return <p className="py-8 text-center text-muted">Loading…</p>;
  return (
    <div className="mt-4">
      {data.notes && <div className="mb-4 rounded-xl bg-brand-soft/50 p-3 text-sm text-ink"><b>Staff note:</b> {data.notes}</div>}
      {data.events.length === 0 ? <p className="py-6 text-center text-muted">No activity yet.</p> : (
        <ol className="relative ml-2 border-l border-border">
          {data.events.map((e, i) => (
            <li key={i} className="mb-4 ml-5">
              <span className="absolute -left-[11px] flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[11px] ring-2 ring-border">{e.icon}</span>
              <p className="text-sm font-semibold text-ink">{e.title}</p>
              {e.detail && <p className="text-xs text-muted">{e.detail}</p>}
              <p className="text-[11px] text-muted/70">{new Date(e.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface-2 p-2 text-center"><p className="text-[10px] text-muted">{label}</p><p className="font-display font-bold text-ink">{value}</p></div>;
}
