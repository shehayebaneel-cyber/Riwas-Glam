import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Promo = {
  id: number;
  code: string;
  type: string;
  value: number;
  minSpend: number;
  maxUses: number;
  usedCount: number;
  firstTimeOnly: boolean;
  birthdayOnly: boolean;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  description: string;
};
const blank = {
  code: "",
  type: "PERCENT",
  value: "",
  minSpend: "",
  maxUses: "",
  firstTimeOnly: false,
  birthdayOnly: false,
  startsAt: "",
  expiresAt: "",
  description: "",
};

export function PromoAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [items, setItems] = useState<Promo[]>([]);
  const [editing, setEditing] = useState<Promo | "new" | null>(null);
  const load = () =>
    api
      .get<Promo[]>("/api/admin/promos", hdr)
      .then(setItems)
      .catch(() => {});
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, []);

  async function toggle(p: Promo) {
    await api.patch(`/api/admin/promos/${p.id}`, { isActive: !p.isActive }, hdr);
    load();
  }
  async function del(id: number) {
    if (!confirm("Delete this code?")) return;
    await api.delete(`/api/admin/promos/${id}`, hdr);
    load();
  }
  const off = (p: Promo) => (p.type === "PERCENT" ? `${p.value}% off` : `$${p.value} off`);

  return (
    <div className="space-y-3">
      <button onClick={() => setEditing("new")} className="btn btn-primary px-5 py-2">
        + New promo code
      </button>
      {items.length === 0 && <p className="card text-muted p-8 text-center">No promo codes yet.</p>}
      {items.map((p) => (
        <div key={p.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-brand-soft text-brand-dark rounded-lg px-2.5 py-1 font-mono font-bold">{p.code}</span>
            <span className="text-ink font-semibold">{off(p)}</span>
            {!p.isActive && <span className="text-muted text-xs">(inactive)</span>}
            <span className="text-muted ml-auto text-xs">
              used {p.usedCount}
              {p.maxUses ? ` / ${p.maxUses}` : ""}
            </span>
          </div>
          <div className="text-muted mt-1 flex flex-wrap gap-x-3 text-xs">
            {p.minSpend > 0 && <span>min ${p.minSpend}</span>}
            {p.firstTimeOnly && <span>first-time only</span>}
            {p.birthdayOnly && <span>birthday month</span>}
            {p.startsAt && <span>from {p.startsAt}</span>}
            {p.expiresAt && <span>until {p.expiresAt}</span>}
            {p.description && <span>· {p.description}</span>}
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => toggle(p)} className="btn btn-ghost px-3 py-1.5 text-xs">
              {p.isActive ? "Deactivate" : "Activate"}
            </button>
            <button onClick={() => setEditing(p)} className="btn btn-ghost px-3 py-1.5 text-xs">
              Edit
            </button>
            <button onClick={() => del(p.id)} className="btn btn-ghost px-3 py-1.5 text-xs text-red-500">
              Delete
            </button>
          </div>
        </div>
      ))}
      {editing && (
        <PromoForm
          hdr={hdr}
          promo={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PromoForm({ hdr, promo, onClose, onSaved }: { hdr: Record<string, string>; promo: Promo | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, unknown>>(
    promo ? { ...promo, value: String(promo.value), minSpend: String(promo.minSpend), maxUses: String(promo.maxUses) } : { ...blank },
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  async function save() {
    if (!String(f.code).trim()) {
      setErr("Enter a code.");
      return;
    }
    setBusy(true);
    setErr("");
    const body = { ...f, value: Number(f.value) || 0, minSpend: Number(f.minSpend) || 0, maxUses: Number(f.maxUses) || 0 };
    try {
      if (promo) await api.patch(`/api/admin/promos/${promo.id}`, body, hdr);
      else await api.post("/api/admin/promos", body, hdr);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full max-w-md rounded-t-[1.5rem] p-5 shadow-2xl sm:rounded-[1.5rem]" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-ink text-lg font-bold">{promo ? "Edit promo code" : "New promo code"}</p>
        <div className="mt-3 space-y-3">
          <input
            value={String(f.code)}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            disabled={!!promo}
            placeholder="CODE (e.g. WELCOME10)"
            className="input font-mono disabled:opacity-60"
          />
          <div className="grid grid-cols-2 gap-2">
            <select value={String(f.type)} onChange={(e) => set("type", e.target.value)} className="input">
              <option value="PERCENT">% off</option>
              <option value="FIXED">$ off</option>
            </select>
            <input
              type="number"
              value={String(f.value)}
              onChange={(e) => set("value", e.target.value)}
              placeholder={f.type === "FIXED" ? "Amount $" : "Percent %"}
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-muted block text-xs">
              Min spend $<input type="number" value={String(f.minSpend)} onChange={(e) => set("minSpend", e.target.value)} className="input mt-1" />
            </label>
            <label className="text-muted block text-xs">
              Max uses (0=∞)
              <input type="number" value={String(f.maxUses)} onChange={(e) => set("maxUses", e.target.value)} className="input mt-1" />
            </label>
            <label className="text-muted block text-xs">
              Starts
              <input type="date" value={String(f.startsAt)} onChange={(e) => set("startsAt", e.target.value)} className="input mt-1" />
            </label>
            <label className="text-muted block text-xs">
              Expires
              <input type="date" value={String(f.expiresAt)} onChange={(e) => set("expiresAt", e.target.value)} className="input mt-1" />
            </label>
          </div>
          <label className="text-ink flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!f.firstTimeOnly} onChange={(e) => set("firstTimeOnly", e.target.checked)} className="accent-brand h-4 w-4" />{" "}
            First-time customers only
          </label>
          <label className="text-ink flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!f.birthdayOnly} onChange={(e) => set("birthdayOnly", e.target.checked)} className="accent-brand h-4 w-4" />{" "}
            Birthday month only
          </label>
          <input value={String(f.description)} onChange={(e) => set("description", e.target.value)} placeholder="Description (optional)" className="input" />
          {err && <p className="text-sm font-medium text-red-600">{err}</p>}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={save} disabled={busy} className="btn btn-primary flex-1 py-2.5 disabled:opacity-60">
            {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} className="btn btn-ghost px-5 py-2.5">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
