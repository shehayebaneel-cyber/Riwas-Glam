import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Entry = {
  id: number;
  name: string;
  phone: string;
  serviceName: string;
  staffName: string;
  preferredDate: string;
  preferredTime: string;
  note: string;
  status: string;
  createdAt: string;
};
const BADGE: Record<string, string> = {
  WAITING: "bg-amber-400/15 text-amber-600",
  CONTACTED: "bg-brand-soft text-brand-dark",
  BOOKED: "bg-emerald-500/15 text-emerald-600",
  CANCELLED: "bg-red-500/15 text-red-500",
};
const FILTERS = ["ALL", "WAITING", "CONTACTED", "BOOKED", "CANCELLED"];

export function WaitlistAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [filter, setFilter] = useState("WAITING");
  const [items, setItems] = useState<Entry[]>([]);
  const [adding, setAdding] = useState(false);
  const load = () =>
    api
      .get<Entry[]>(`/api/admin/waitlist?status=${filter}`, hdr)
      .then(setItems)
      .catch(() => {});
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [filter]);

  async function setStatus(id: number, status: string) {
    await api.patch(`/api/admin/waitlist/${id}`, { status }, hdr);
    load();
  }
  async function del(id: number) {
    if (!confirm("Remove this entry?")) return;
    await api.delete(`/api/admin/waitlist/${id}`, hdr);
    load();
  }
  const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "")}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`chip whitespace-nowrap ${filter === f ? "chip-active" : ""}`}>
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <button onClick={() => setAdding(true)} className="btn btn-primary whitespace-nowrap px-3 py-1.5 text-xs">
          + Add
        </button>
      </div>
      {adding && (
        <AddWaitlistModal
          adminKey={adminKey}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            setFilter("WAITING");
            load();
          }}
        />
      )}
      {items.length === 0 && <p className="card text-muted p-8 text-center">No one on the waiting list here.</p>}
      {items.map((e) => (
        <div key={e.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-ink font-bold">{e.name}</span>
            <a href={`tel:${e.phone}`} className="text-brand text-sm">
              {e.phone}
            </a>
            <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold ${BADGE[e.status] ?? "bg-surface-2 text-muted"}`}>
              {e.status.toLowerCase()}
            </span>
          </div>
          <p className="text-muted mt-1 text-sm">
            {e.serviceName || "Any service"}
            {e.staffName ? ` · ${e.staffName}` : ""}
            {e.preferredDate ? ` · ${new Date(e.preferredDate + "T00:00:00").toLocaleDateString()}` : ""}
            {e.preferredTime ? ` · ${e.preferredTime}` : ""}
          </p>
          {e.note && <p className="text-muted mt-1 text-sm">“{e.note}”</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={wa(e.phone)} target="_blank" rel="noreferrer" className="btn btn-ghost px-3 py-1.5 text-xs text-emerald-600">
              💬 WhatsApp
            </a>
            {e.status !== "CONTACTED" && (
              <button onClick={() => setStatus(e.id, "CONTACTED")} className="btn btn-ghost px-3 py-1.5 text-xs">
                Mark contacted
              </button>
            )}
            {e.status !== "BOOKED" && (
              <button onClick={() => setStatus(e.id, "BOOKED")} className="btn btn-ghost px-3 py-1.5 text-xs text-emerald-600">
                Booked
              </button>
            )}
            {e.status !== "CANCELLED" && (
              <button onClick={() => setStatus(e.id, "CANCELLED")} className="btn btn-ghost px-3 py-1.5 text-xs text-red-500">
                Cancel
              </button>
            )}
            <button onClick={() => del(e.id)} className="btn btn-ghost text-muted px-3 py-1.5 text-xs">
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AddWaitlistModal({ adminKey, onClose, onAdded }: { adminKey: string; onClose: () => void; onAdded: () => void }) {
  const hdr = { "x-admin-key": adminKey };
  const [f, setF] = useState({ name: "", phone: "", serviceName: "", preferredDate: "", preferredTime: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  async function save() {
    if (!f.name.trim() || !f.phone.trim()) {
      setErr("Name and phone are required.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await api.post("/api/waitlist", f, hdr);
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add to the waitlist.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full max-w-sm rounded-t-[1.5rem] p-5 shadow-2xl sm:rounded-[1.5rem]" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-ink text-lg font-bold">Add to waiting list</p>
        <p className="text-muted mt-0.5 text-sm">For a phone/walk-in customer when the slot they want is full.</p>
        <div className="mt-3 space-y-2">
          <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Customer name *" className="input" />
          <input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone *" className="input" />
          <input value={f.serviceName} onChange={(e) => set("serviceName", e.target.value)} placeholder="Service they want (optional)" className="input" />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-muted mb-1 block text-xs font-semibold">Preferred date</span>
              <input type="date" value={f.preferredDate} onChange={(e) => set("preferredDate", e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="text-muted mb-1 block text-xs font-semibold">Preferred time</span>
              <input value={f.preferredTime} onChange={(e) => set("preferredTime", e.target.value)} placeholder="e.g. after 5pm" className="input" />
            </label>
          </div>
          <textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="Note (optional)" className="input" />
          {err && <p className="text-sm font-medium text-red-600">{err}</p>}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={busy} className="btn btn-primary flex-1 py-2.5 disabled:opacity-60">
            {busy ? "Adding…" : "Add to list"}
          </button>
          <button onClick={onClose} className="btn btn-ghost px-5 py-2.5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
