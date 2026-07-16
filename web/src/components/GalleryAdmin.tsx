import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ImageUpload } from "./ImageUpload";

type Item = {
  id: number;
  type: string;
  url: string;
  beforeUrl: string;
  category: string;
  caption: string;
  serviceId: number | null;
  serviceName: string;
  isActive: boolean;
};
type Cat = { id: number; name: string; emoji: string; services: { id: number; name: string }[] };

export function GalleryAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [f, setF] = useState({ type: "IMAGE", url: "", beforeUrl: "", category: "", caption: "", serviceId: "" });
  const load = () =>
    api
      .get<Item[]>("/api/admin/gallery", hdr)
      .then(setItems)
      .catch(() => {});
  useEffect(() => {
    load();
    api
      .get<Cat[]>("/api/admin/catalog", hdr)
      .then(setCats)
      .catch(() => {}); /* eslint-disable-next-line */
  }, []);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  async function add() {
    if (f.type === "VIDEO" && !f.url) return;
    if (f.type === "IMAGE" && !f.url) return;
    if (f.type === "BEFOREAFTER" && (!f.url || !f.beforeUrl)) return;
    await api.post("/api/admin/gallery", { ...f, serviceId: f.serviceId || null }, hdr);
    setF({ type: f.type, url: "", beforeUrl: "", category: f.category, caption: "", serviceId: "" });
    load();
  }
  async function toggle(i: Item) {
    await api.patch(`/api/admin/gallery/${i.id}`, { isActive: !i.isActive }, hdr);
    load();
  }
  async function del(id: number) {
    if (!confirm("Delete this item?")) return;
    await api.delete(`/api/admin/gallery/${id}`, hdr);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="font-display text-brand-dark font-bold">Add to gallery</p>
        <div className="bg-surface-2 mt-2 flex gap-1 rounded-full p-1">
          {[
            ["IMAGE", "Photo"],
            ["BEFOREAFTER", "Before / After"],
            ["VIDEO", "Video"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => set("type", v)}
              className={`flex-1 rounded-full px-2 py-1.5 text-sm font-semibold ${f.type === v ? "bg-brand text-white" : "text-muted"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-3">
          {f.type === "IMAGE" && (
            <div>
              <span className="text-ink mb-1 block text-xs font-semibold">Photo</span>
              <ImageUpload value={f.url} onChange={(u) => set("url", u)} adminKey={adminKey} />
            </div>
          )}
          {f.type === "BEFOREAFTER" && (
            <>
              <div>
                <span className="text-ink mb-1 block text-xs font-semibold">Before</span>
                <ImageUpload value={f.beforeUrl} onChange={(u) => set("beforeUrl", u)} adminKey={adminKey} />
              </div>
              <div>
                <span className="text-ink mb-1 block text-xs font-semibold">After</span>
                <ImageUpload value={f.url} onChange={(u) => set("url", u)} adminKey={adminKey} />
              </div>
            </>
          )}
          {f.type === "VIDEO" && (
            <label className="block">
              <span className="text-ink mb-1 block text-xs font-semibold">Video link</span>
              <input value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="YouTube, Vimeo, or .mp4 link" className="input" />
            </label>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Category (e.g. Makeup)" className="input" />
            <select value={f.serviceId} onChange={(e) => set("serviceId", e.target.value)} className="input">
              <option value="">Link a service (optional)</option>
              {cats.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <input value={f.caption} onChange={(e) => set("caption", e.target.value)} placeholder="Caption (optional)" className="input" />
          <button onClick={add} className="btn btn-primary px-5 py-2">
            + Add to gallery
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <div key={i.id} className={`card overflow-hidden p-0 ${!i.isActive ? "opacity-50" : ""}`}>
            <div className="bg-surface-2 relative aspect-square">
              {i.type === "VIDEO" ? (
                <div className="flex h-full w-full items-center justify-center text-3xl">🎬</div>
              ) : (
                <img src={i.type === "BEFOREAFTER" ? i.beforeUrl : i.url} alt="" className="h-full w-full object-cover" />
              )}
              <span className="absolute left-1 top-1 rounded bg-black/50 px-1.5 text-[10px] font-bold text-white">
                {i.type === "BEFOREAFTER" ? "B/A" : i.type === "VIDEO" ? "VID" : "IMG"}
              </span>
            </div>
            <div className="p-2 text-xs">
              <p className="text-muted truncate">
                {i.category || "—"}
                {i.serviceName ? ` · ${i.serviceName}` : ""}
              </p>
              <div className="mt-1 flex gap-2">
                <button onClick={() => toggle(i)} className="text-muted font-semibold">
                  {i.isActive ? "Hide" : "Show"}
                </button>
                <button onClick={() => del(i.id)} className="font-semibold text-red-500">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
