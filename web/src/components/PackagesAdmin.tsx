import { useEffect, useState } from "react";
import { api, priceLabel, durationLabel } from "../lib/api";
import { ImageUpload } from "./ImageUpload";

type Pkg = { id: number; title: string; image: string; description: string; price: number; durationMin: number; serviceIds: number[]; services: string[]; isActive: boolean };
type Cat = { id: number; name: string; emoji: string; services: { id: number; name: string }[] };

export function PackagesAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [items, setItems] = useState<Pkg[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [editing, setEditing] = useState<Pkg | "new" | null>(null);
  const load = () => api.get<Pkg[]>("/api/admin/packages", hdr).then(setItems).catch(() => {});
  useEffect(() => { load(); api.get<Cat[]>("/api/admin/catalog", hdr).then(setCats).catch(() => {}); /* eslint-disable-next-line */ }, []);

  async function del(id: number) { if (!confirm("Delete this package?")) return; await api.delete(`/api/admin/packages/${id}`, hdr); load(); }
  async function toggle(p: Pkg) { await api.patch(`/api/admin/packages/${p.id}`, { isActive: !p.isActive }, hdr); load(); }

  return (
    <div className="space-y-3">
      <button onClick={() => setEditing("new")} className="btn btn-primary px-5 py-2">+ Add package</button>
      {items.length === 0 && <p className="card p-8 text-center text-muted">No packages yet.</p>}
      {items.map((p) => (
        <div key={p.id} className="card flex flex-wrap items-center gap-3 p-4">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">{p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xl">🎀</div>}</div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-ink">{p.title} {!p.isActive && <span className="text-xs font-normal text-muted">(hidden)</span>}</p>
            <p className="text-xs text-muted">{priceLabel(p.price)} · {durationLabel(p.durationMin)} · {p.services.join(", ") || "no services"}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => toggle(p)} className="btn btn-ghost px-3 py-1.5 text-xs">{p.isActive ? "Hide" : "Show"}</button>
            <button onClick={() => setEditing(p)} className="btn btn-ghost px-3 py-1.5 text-xs">Edit</button>
            <button onClick={() => del(p.id)} className="btn btn-ghost px-3 py-1.5 text-xs text-red-500">Delete</button>
          </div>
        </div>
      ))}
      {editing && <PackageForm hdr={hdr} adminKey={adminKey} cats={cats} pkg={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function PackageForm({ hdr, adminKey, cats, pkg, onClose, onSaved }: { hdr: Record<string, string>; adminKey: string; cats: Cat[]; pkg: Pkg | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: pkg?.title ?? "", price: String(pkg?.price ?? ""), durationMin: String(pkg?.durationMin ?? "60"), description: pkg?.description ?? "", image: pkg?.image ?? "" });
  const [ids, setIds] = useState<Set<number>>(new Set(pkg?.serviceIds ?? []));
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const toggle = (id: number) => { const n = new Set(ids); n.has(id) ? n.delete(id) : n.add(id); setIds(n); };

  async function save() {
    if (!f.title.trim()) return; setBusy(true);
    const body = { title: f.title, price: Number(f.price) || 0, durationMin: Number(f.durationMin) || 60, description: f.description, image: f.image, serviceIds: [...ids] };
    try {
      if (pkg) await api.patch(`/api/admin/packages/${pkg.id}`, body, hdr);
      else await api.post("/api/admin/packages", body, hdr);
      onSaved();
    } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-[1.5rem] bg-surface p-5 shadow-2xl sm:rounded-[1.5rem]" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-lg font-bold text-ink">{pkg ? "Edit package" : "Add package"}</p>
        <div className="mt-3 space-y-3">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-ink">Package name</span><input value={f.title} onChange={(e) => set("title", e.target.value)} className="input" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-ink">Total price $</span><input type="number" value={f.price} onChange={(e) => set("price", e.target.value)} className="input" /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-ink">Duration (min)</span><input type="number" value={f.durationMin} onChange={(e) => set("durationMin", e.target.value)} className="input" /></label>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-ink">Description</span><textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} className="input" /></label>
          <div>
            <span className="mb-1 block text-xs font-semibold text-ink">Included services</span>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
              {cats.map((c) => (
                <div key={c.id}>
                  <p className="text-xs font-bold text-brand-dark">{c.emoji} {c.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.services.map((s) => <button key={s.id} type="button" onClick={() => toggle(s.id)} className={`chip !py-1 !text-xs ${ids.has(s.id) ? "chip-active" : ""}`}>{ids.has(s.id) ? "✓ " : ""}{s.name}</button>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div><span className="mb-1 block text-xs font-semibold text-ink">Package image</span><ImageUpload value={f.image} onChange={(url) => set("image", url)} adminKey={adminKey} /></div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={busy} className="btn btn-primary flex-1 py-2.5 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
          <button onClick={onClose} className="btn btn-ghost px-5 py-2.5">Cancel</button>
        </div>
      </div>
    </div>
  );
}
