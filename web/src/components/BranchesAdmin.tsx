import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Branch = { id: number; name: string; address: string; phone: string; isActive: boolean; isDefault: boolean };

export function BranchesAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [items, setItems] = useState<Branch[]>([]);
  const [f, setF] = useState({ name: "", address: "", phone: "" });
  const load = () => api.get<Branch[]>("/api/admin/branches", hdr).then(setItems).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function add() { if (!f.name.trim()) return; await api.post("/api/admin/branches", f, hdr); setF({ name: "", address: "", phone: "" }); load(); }
  async function patch(id: number, data: Record<string, unknown>) { await api.patch(`/api/admin/branches/${id}`, data, hdr); load(); }
  async function del(id: number) { if (!confirm("Delete this branch?")) return; try { await api.delete(`/api/admin/branches/${id}`, hdr); load(); } catch (e) { alert(e instanceof Error ? e.message : "Failed."); } }

  return (
    <div className="space-y-4">
      <p className="card p-4 text-sm text-muted">Your salon locations. Everything runs from your main branch today — this is ready for when you open more. Staff and bookings are already tagged to a branch behind the scenes.</p>

      {items.map((b) => (
        <div key={b.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input defaultValue={b.name} onBlur={(e) => e.target.value.trim() && e.target.value !== b.name && patch(b.id, { name: e.target.value.trim() })} className="min-w-[8rem] rounded-lg border border-transparent px-2 py-1 font-display font-bold text-ink hover:border-border focus:border-brand focus:bg-surface" />
            {b.isDefault && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-bold text-brand-dark">Main</span>}
            {!b.isActive && <span className="text-xs text-muted">(hidden)</span>}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input defaultValue={b.address} onBlur={(e) => e.target.value !== b.address && patch(b.id, { address: e.target.value })} placeholder="Address" className="input !py-2 text-sm" />
            <input defaultValue={b.phone} onBlur={(e) => e.target.value !== b.phone && patch(b.id, { phone: e.target.value })} placeholder="Phone" className="input !py-2 text-sm" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {!b.isDefault && <button onClick={() => patch(b.id, { isDefault: true })} className="btn btn-ghost px-3 py-1.5 text-xs">Set as main</button>}
            <button onClick={() => patch(b.id, { isActive: !b.isActive })} className="btn btn-ghost px-3 py-1.5 text-xs">{b.isActive ? "Hide" : "Show"}</button>
            {!b.isDefault && <button onClick={() => del(b.id)} className="btn btn-ghost px-3 py-1.5 text-xs text-red-500">Delete</button>}
          </div>
        </div>
      ))}

      <div className="card p-4">
        <p className="font-display font-bold text-brand-dark">Add a branch</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Branch name" className="input text-sm" />
          <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Address" className="input text-sm" />
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" className="input text-sm" />
        </div>
        <button onClick={add} className="btn btn-primary mt-3 px-5 py-2">+ Add branch</button>
      </div>
    </div>
  );
}
