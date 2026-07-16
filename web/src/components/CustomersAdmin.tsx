import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ImageUpload } from "./ImageUpload";
import { CustomerInsights } from "./CustomerInsights";
import { ConsentForms } from "./ConsentForms";

type ListItem = { id: number; name: string; email: string; phone: string; birthday: string; tags: string[]; visits: number; spent: number; lastVisit: string };
type Profile = {
  id: number;
  name: string;
  email: string;
  phone: string;
  birthday: string;
  notes: string;
  tags: string[];
  createdAt: string;
  points: number;
  lifetimePoints: number;
  tier: string;
  visits: number;
  spent: number;
  noShows: number;
  cancellations: number;
  preferredStaff: string;
  favorites: { id: number; name: string }[];
  appointments: { id: number; date: string; time: string; serviceName: string; staffName: string; price: number; status: string }[];
  giftCards: { code: string; initialValue: number; balance: number; status: string }[];
  redemptions: { id: string; rewardName: string; createdAt: string }[];
  photos: { id: string; url: string; label: string; kind?: string }[];
};
const money = (n: number) => "$" + (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const STATUS: Record<string, string> = { CONFIRMED: "text-emerald-600", COMPLETED: "text-brand-dark", CANCELLED: "text-red-500", NO_SHOW: "text-amber-600" };
const TAG_PRESETS = ["VIP", "Bride", "Student", "Influencer", "Regular", "First Visit", "Corporate", "Premium"];

export function CustomersAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [list, setList] = useState<ListItem[]>([]);
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const load = () =>
    api
      .get<ListItem[]>("/api/admin/customers", hdr)
      .then(setList)
      .catch(() => {});
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);
  const allTags = [...new Set(list.flatMap((c) => c.tags ?? []))].sort();
  const shown = list.filter(
    (c) => `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()) && (!tagFilter || (c.tags ?? []).includes(tagFilter)),
  );

  return (
    <div className="space-y-3">
      <CustomerInsights adminKey={adminKey} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or email…" className="input" />
      {allTags.length > 0 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => setTagFilter("")} className={`chip whitespace-nowrap !py-1 !text-xs ${!tagFilter ? "chip-active" : ""}`}>
            All
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(t === tagFilter ? "" : t)}
              className={`chip whitespace-nowrap !py-1 !text-xs ${tagFilter === t ? "chip-active" : ""}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 && <p className="card text-muted p-8 text-center">No customer accounts yet.</p>}
      {shown.map((c) => (
        <button key={c.id} onClick={() => setOpenId(c.id)} className="card hover:border-brand flex w-full items-center gap-3 p-4 text-left transition">
          <span className="bg-brand-soft font-display text-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-bold">
            {c.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-ink font-semibold">
              {c.name}
              {(c.tags ?? []).map((t) => (
                <span key={t} className="bg-brand-soft text-brand-dark ml-1.5 rounded-full px-2 py-0.5 align-middle text-[10px] font-bold">
                  {t}
                </span>
              ))}
            </p>
            <p className="text-muted truncate text-xs">
              {c.phone} · {c.visits} visit{c.visits === 1 ? "" : "s"} · {money(c.spent)}
            </p>
          </div>
          <span className="text-muted">→</span>
        </button>
      ))}
      {openId !== null && (
        <ProfileModal
          id={openId}
          hdr={hdr}
          adminKey={adminKey}
          onClose={() => {
            setOpenId(null);
            load();
          }}
        />
      )}
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
  const [tags, setTags] = useState<string[]>([]);
  const [thread, setThread] = useState<{ id: string; author: string; body: string; createdAt: string }[]>([]);
  const [newNote, setNewNote] = useState("");
  const [photoKind, setPhotoKind] = useState("PHOTO");
  const loadNotes = () =>
    api
      .get<{ id: string; author: string; body: string; createdAt: string }[]>(`/api/admin/customers/${id}/notes`, hdr)
      .then(setThread)
      .catch(() => {});
  const load = () => {
    api
      .get<Profile>(`/api/admin/customers/${id}`, hdr)
      .then((d) => {
        setP(d);
        setNotes(d.notes);
        setBirthday(d.birthday);
        setTags(d.tags ?? []);
      })
      .catch(() => {});
    loadNotes();
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [id]);
  const toggleTag = (t: string) => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));

  async function saveInfo() {
    await api.patch(`/api/admin/customers/${id}`, { notes, birthday, tags }, hdr);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  async function addNote() {
    if (!newNote.trim()) return;
    await api.post(`/api/admin/customers/${id}/notes`, { body: newNote.trim() }, hdr);
    setNewNote("");
    loadNotes();
  }
  async function delNote(nid: string) {
    await api.delete(`/api/admin/customers/${id}/notes/${nid}`, hdr);
    loadNotes();
  }
  async function addPhoto(url: string) {
    if (!url) return;
    await api.post(`/api/admin/customers/${id}/photos`, { url, kind: photoKind }, hdr);
    load();
  }
  async function delPhoto(pid: string) {
    await api.delete(`/api/admin/customers/${id}/photos/${pid}`, hdr);
    load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full max-w-2xl rounded-t-[1.5rem] p-5 shadow-2xl sm:my-4 sm:rounded-[1.5rem]" onClick={(e) => e.stopPropagation()}>
        {!p ? (
          <p className="text-muted py-10 text-center">Loading…</p>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-ink text-2xl font-bold">{p.name}</h2>
                <p className="text-muted text-sm">
                  <a href={`tel:${p.phone}`} className="text-brand">
                    {p.phone}
                  </a>{" "}
                  · {p.email}
                </p>
                <p className="text-muted mt-1 text-xs">
                  Member since {new Date(p.createdAt).toLocaleDateString()} · <span className="text-brand font-semibold">{p.tier}</span> · {p.points} pts
                </p>
              </div>
              <button onClick={onClose} className="text-muted text-2xl">
                ✕
              </button>
            </div>

            <div className="bg-surface-2 mt-3 flex gap-1 rounded-full p-1">
              {(["profile", "timeline"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex-1 rounded-full py-1.5 text-xs font-semibold ${view === v ? "bg-brand text-white" : "text-muted"}`}
                >
                  {v === "profile" ? "Profile" : "Timeline"}
                </button>
              ))}
            </div>

            {view === "timeline" && <Timeline id={id} hdr={hdr} />}
            {view === "profile" && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Mini label="Visits" value={String(p.visits)} />
                  <Mini label="Total spent" value={money(p.spent)} />
                  <Mini label="No-shows" value={String(p.noShows)} />
                  <Mini label="Cancelled" value={String(p.cancellations)} />
                </div>
                <p className="text-muted mt-3 text-sm">
                  Preferred specialist: <b className="text-ink">{p.preferredStaff}</b>
                  {p.favorites.length > 0 && <> · Favourites: {p.favorites.map((f) => f.name).join(", ")}</>}
                </p>

                <div className="mt-3">
                  <p className="text-ink text-xs font-semibold">Tags</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {[...TAG_PRESETS, ...tags.filter((t) => !TAG_PRESETS.includes(t))].map((t) => (
                      <button key={t} type="button" onClick={() => toggleTag(t)} className={`chip !py-1 !text-xs ${tags.includes(t) ? "chip-active" : ""}`}>
                        {t}
                        {tags.includes(t) && !TAG_PRESETS.includes(t) ? " ✕" : ""}
                      </button>
                    ))}
                  </div>
                  <input
                    placeholder="+ custom tag, press Enter"
                    onKeyDown={(e) => {
                      const v = e.currentTarget.value.trim();
                      if (e.key === "Enter" && v) {
                        e.preventDefault();
                        if (!tags.includes(v)) setTags([...tags, v]);
                        e.currentTarget.value = "";
                      }
                    }}
                    className="input mt-1.5 !py-1.5 text-xs"
                  />
                  <p className="text-muted mt-1 text-[11px]">Tags save with the button below.</p>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-ink mb-1 block text-xs font-semibold">Birthday</span>
                    <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="input !py-2 text-sm" />
                  </label>
                  <div className="flex items-end">
                    <button onClick={saveInfo} className="btn btn-primary w-full py-2">
                      Save {saved && "✓"}
                    </button>
                  </div>
                </div>
                <label className="mt-3 block">
                  <span className="text-ink mb-1 block text-xs font-semibold">Private notes</span>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Allergies, preferences, anything to remember…"
                    className="input text-sm"
                  />
                </label>

                <div className="mt-4">
                  <p className="text-ink text-sm font-bold">Staff notes</p>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addNote();
                      }}
                      placeholder="Add a note (allergy, preference…)"
                      className="input !py-2 text-sm"
                    />
                    <button onClick={addNote} className="btn btn-primary px-4 py-2 text-sm">
                      Add
                    </button>
                  </div>
                  {thread.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {thread.map((n) => (
                        <div key={n.id} className="bg-surface-2 group rounded-xl p-2.5 text-sm">
                          <p className="text-ink">{n.body}</p>
                          <p className="text-muted mt-0.5 text-[11px]">
                            {n.author} · {new Date(n.createdAt).toLocaleDateString()}{" "}
                            <button onClick={() => delNote(n.id)} className="ml-1 text-red-400 opacity-0 transition group-hover:opacity-100">
                              delete
                            </button>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Photos, before/after & documents */}
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-ink text-sm font-bold">Photos & documents</p>
                  <select value={photoKind} onChange={(e) => setPhotoKind(e.target.value)} className="input !w-auto !py-1 text-xs">
                    <option value="PHOTO">Photo</option>
                    <option value="BEFORE">Before</option>
                    <option value="AFTER">After</option>
                    <option value="DOCUMENT">Document</option>
                  </select>
                </div>
                <div className="mt-1">
                  <ImageUpload value="" onChange={addPhoto} adminKey={adminKey} />
                </div>
                {p.photos.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {p.photos.map((ph) => (
                      <a
                        key={ph.id}
                        href={ph.url}
                        target="_blank"
                        rel="noreferrer"
                        className="border-border group relative block aspect-square overflow-hidden rounded-xl border"
                      >
                        <img src={ph.url} alt="" className="h-full w-full object-cover" />
                        {ph.kind && ph.kind !== "PHOTO" && (
                          <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[9px] font-bold uppercase text-white">
                            {ph.kind === "BEFORE" ? "Before" : ph.kind === "AFTER" ? "After" : "Doc"}
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            delPhoto(ph.id);
                          }}
                          className="absolute right-1 top-1 rounded-full bg-black/50 px-1.5 text-xs text-white opacity-0 group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      </a>
                    ))}
                  </div>
                )}

                <ConsentForms id={id} customerName={p.name} hdr={hdr} />

                {/* Gift cards */}
                {p.giftCards.length > 0 && (
                  <>
                    <p className="text-ink mt-4 text-sm font-bold">Gift cards</p>
                    <div className="mt-1 space-y-1 text-sm">
                      {p.giftCards.map((g) => (
                        <div key={g.code} className="flex justify-between">
                          <span className="text-muted">{g.code}</span>
                          <span className="text-ink">
                            {money(g.balance)} / {money(g.initialValue)} · {g.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Appointment history */}
                <p className="text-ink mt-4 text-sm font-bold">Appointment history</p>
                <div className="mt-1 max-h-64 space-y-1 overflow-y-auto">
                  {p.appointments.length === 0 ? (
                    <p className="text-muted text-sm">No appointments yet.</p>
                  ) : (
                    p.appointments.map((a) => (
                      <div key={a.id} className="border-border flex items-center justify-between border-b py-1.5 text-sm last:border-0">
                        <span className="text-ink">
                          {a.date} {a.time} · {a.serviceName}
                          {a.staffName ? ` · ${a.staffName}` : ""}
                        </span>
                        <span className={`shrink-0 font-semibold ${STATUS[a.status] ?? "text-muted"}`}>{money(a.price)}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Timeline({ id, hdr }: { id: number; hdr: Record<string, string> }) {
  const [data, setData] = useState<{ notes: string; events: TimelineEvent[] } | null>(null);
  useEffect(() => {
    api
      .get<{ notes: string; events: TimelineEvent[] }>(`/api/admin/customers/${id}/timeline`, hdr)
      .then(setData)
      .catch(() => {}); /* eslint-disable-next-line */
  }, [id]);
  if (!data) return <p className="text-muted py-8 text-center">Loading…</p>;
  return (
    <div className="mt-4">
      {data.notes && (
        <div className="bg-brand-soft/50 text-ink mb-4 rounded-xl p-3 text-sm">
          <b>Staff note:</b> {data.notes}
        </div>
      )}
      {data.events.length === 0 ? (
        <p className="text-muted py-6 text-center">No activity yet.</p>
      ) : (
        <ol className="border-border relative ml-2 border-l">
          {data.events.map((e, i) => (
            <li key={i} className="mb-4 ml-5">
              <span className="bg-surface ring-border absolute -left-[11px] flex h-5 w-5 items-center justify-center rounded-full text-[11px] ring-2">
                {e.icon}
              </span>
              <p className="text-ink text-sm font-semibold">{e.title}</p>
              {e.detail && <p className="text-muted text-xs">{e.detail}</p>}
              <p className="text-muted/70 text-[11px]">{new Date(e.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-xl p-2 text-center">
      <p className="text-muted text-[10px]">{label}</p>
      <p className="font-display text-ink font-bold">{value}</p>
    </div>
  );
}
