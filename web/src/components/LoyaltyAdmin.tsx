import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Tier = { name: string; minPoints: number; discountPct: number };
type Reward = { id: number; name: string; cost: number; description: string };
type Config = { enabled: boolean; pointsPerDollar: number; tiers: Tier[]; rewards: Reward[] };
type Redemption = { id: string; rewardName: string; cost: number; status: string; createdAt: string; customer: { name: string; phone: string } };

export function LoyaltyAdmin({ adminKey }: { adminKey: string }) {
  const hdr = { "x-admin-key": adminKey };
  const [c, setC] = useState<Config | null>(null);
  const [saved, setSaved] = useState(false);
  const [reds, setReds] = useState<Redemption[]>([]);
  const loadReds = () => api.get<Redemption[]>("/api/admin/redemptions", hdr).then(setReds).catch(() => {});
  useEffect(() => { api.get<Config>("/api/admin/settings/loyalty", hdr).then(setC).catch(() => {}); loadReds(); /* eslint-disable-next-line */ }, []);
  if (!c) return <p className="card p-8 text-center text-muted">Loading…</p>;
  const set = (patch: Partial<Config>) => { setC({ ...c, ...patch }); setSaved(false); };

  async function save() { await api.patch("/api/admin/settings/loyalty", c, hdr); setSaved(true); }
  async function markUsed(r: Redemption) { await api.patch(`/api/admin/redemptions/${r.id}`, { status: r.status === "USED" ? "ISSUED" : "USED" }, hdr); loadReds(); }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <label className="flex items-center justify-between">
          <span className="font-display font-bold text-brand-dark">Loyalty program</span>
          <input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="h-5 w-5 accent-brand" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-semibold text-ink">Points earned per $1 spent</span>
          <input type="number" value={c.pointsPerDollar} onChange={(e) => set({ pointsPerDollar: Number(e.target.value) || 0 })} className="input !w-32" />
        </label>
      </div>

      <div className="card p-5">
        <p className="font-display font-bold text-brand-dark">Membership tiers</p>
        <p className="mb-2 text-xs text-muted">Based on lifetime points earned. Discount auto-applies at booking for logged-in members.</p>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_5rem_5rem_2rem] gap-2 text-xs font-semibold text-muted"><span>Tier name</span><span>Min pts</span><span>Discount %</span><span /></div>
          {c.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_5rem_2rem] gap-2">
              <input value={t.name} onChange={(e) => set({ tiers: c.tiers.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} className="input !py-2 text-sm" />
              <input type="number" value={t.minPoints} onChange={(e) => set({ tiers: c.tiers.map((x, j) => j === i ? { ...x, minPoints: Number(e.target.value) || 0 } : x) })} className="input !py-2 text-sm" />
              <input type="number" value={t.discountPct} onChange={(e) => set({ tiers: c.tiers.map((x, j) => j === i ? { ...x, discountPct: Number(e.target.value) || 0 } : x) })} className="input !py-2 text-sm" />
              <button onClick={() => set({ tiers: c.tiers.filter((_, j) => j !== i) })} className="text-lg text-red-500">✕</button>
            </div>
          ))}
        </div>
        <button onClick={() => set({ tiers: [...c.tiers, { name: "New tier", minPoints: 0, discountPct: 0 }] })} className="btn btn-ghost mt-2 px-4 py-1.5 text-sm">+ Add tier</button>
      </div>

      <div className="card p-5">
        <p className="font-display font-bold text-brand-dark">Rewards</p>
        <p className="mb-2 text-xs text-muted">Customers redeem points for these.</p>
        <div className="space-y-2">
          {c.rewards.map((r, i) => (
            <div key={i} className="card space-y-2 p-3">
              <div className="flex gap-2">
                <input value={r.name} onChange={(e) => set({ rewards: c.rewards.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} placeholder="Reward name" className="input flex-1 !py-2 text-sm" />
                <input type="number" value={r.cost} onChange={(e) => set({ rewards: c.rewards.map((x, j) => j === i ? { ...x, cost: Number(e.target.value) || 0 } : x) })} placeholder="pts" className="input !w-24 !py-2 text-sm" />
                <button onClick={() => set({ rewards: c.rewards.filter((_, j) => j !== i) })} className="text-lg text-red-500">✕</button>
              </div>
              <input value={r.description} onChange={(e) => set({ rewards: c.rewards.map((x, j) => j === i ? { ...x, description: e.target.value } : x) })} placeholder="Short description" className="input !py-2 text-sm" />
            </div>
          ))}
        </div>
        <button onClick={() => set({ rewards: [...c.rewards, { id: Math.max(0, ...c.rewards.map((r) => r.id)) + 1, name: "", cost: 100, description: "" }] })} className="btn btn-ghost mt-2 px-4 py-1.5 text-sm">+ Add reward</button>
      </div>

      <div className="sticky bottom-2 flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-lg ring-1 ring-border">
        <button onClick={save} className="btn btn-primary px-6 py-2.5">Save loyalty settings</button>
        {saved && <span className="text-sm font-semibold text-emerald-600">✓ Saved</span>}
      </div>

      <div className="card p-5">
        <p className="font-display font-bold text-brand-dark">Reward redemptions</p>
        <div className="mt-3 space-y-2">
          {reds.length === 0 ? <p className="py-4 text-center text-muted">No redemptions yet.</p> : reds.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 text-sm last:border-0">
              <span className="font-semibold text-ink">{r.customer?.name ?? "—"}</span>
              <span className="text-muted">{r.rewardName}</span>
              <span className="text-xs text-muted">{new Date(r.createdAt).toLocaleDateString()}</span>
              <button onClick={() => markUsed(r)} className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold ${r.status === "USED" ? "bg-surface-2 text-muted" : "bg-emerald-500/15 text-emerald-600"}`}>{r.status === "USED" ? "Used ✓" : "Mark used"}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
