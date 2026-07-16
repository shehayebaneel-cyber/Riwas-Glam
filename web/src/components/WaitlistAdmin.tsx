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
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`chip whitespace-nowrap ${filter === f ? "chip-active" : ""}`}>
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
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
